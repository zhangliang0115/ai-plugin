import { readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HubBridge } from './lib/hub-bridge.js'

export const name = 'ai-plugin-toolkit'
// `webserver` is provided by dsh-web-app only; on tui/headless profiles the
// plugin still loads — a missing injected service just throws on access,
// which startHubBridge treats as "no console here".
export const inject = ['skills']

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * The bundled skill folders. `skills/` next to index.js is what `dsh plugin
 * add "github:zhangliang0115/ai-plugin#path:/dsh-plugin"` ships — the copies
 * are kept in lockstep with the repo-root `skills/` by CI (check-drift).
 */
const SKILL_DIRS = [
  'skills/skill-author',
  'skills/dsh-plugin-dev',
  'skills/claude-plugin-dev',
  'skills/deepseek-cost-router',
  'skills/deepseek-migration',
  'skills/skill-portability-audit',
]

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/**
 * Read the `name` and `description` scalars out of a YAML frontmatter block.
 * Deliberately not a YAML parser: the bundle ships with zero dependencies and
 * SKILL.md headers only ever carry flat scalars or `>`/`|` blocks.
 */
function readFrontmatterScalars(block) {
  const out = {}
  const lines = block.split(/\r?\n/)

  for (let i = 0; i < lines.length; i += 1) {
    const match = /^([A-Za-z][\w-]*):[ \t]*(.*)$/.exec(lines[i])
    if (match === null) continue

    const key = match[1]
    const inline = match[2].trim()

    if (inline !== '' && !inline.startsWith('>') && !inline.startsWith('|')) {
      out[key] = inline.replace(/^['"]|['"]$/g, '')
      continue
    }

    const folded = []
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j]
      if (line.trim() === '') {
        folded.push('')
        continue
      }
      if (!/^[ \t]/.test(line)) break
      folded.push(line.trim())
      i = j
    }
    const joined = folded.join(' ').replace(/\s+/g, ' ').trim()
    if (joined !== '') out[key] = joined
  }

  return out
}

async function loadSkill(dir) {
  const path = join(dir, 'SKILL.md')
  const raw = await readFile(path, 'utf8')
  const match = FRONTMATTER.exec(raw)
  if (match === null) return undefined

  const { name, description } = readFrontmatterScalars(match[1])
  if (name === undefined || description === undefined) return undefined

  // `references/` and `scripts/` sit next to SKILL.md; expose the folder so
  // relative links keep working inside the agent.
  let resourceBase
  try {
    if ((await stat(dir)).isDirectory()) resourceBase = { kind: 'directory', path: dir }
  } catch {
    // a flat SKILL.md still registers; only relative links go dark
  }

  return {
    name,
    description,
    content: raw.replace(FRONTMATTER, ''),
    source: 'bundled',
    path,
    resourceBase,
  }
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - the plugin context,
 *   with the `skills` service injected.
 */
export function apply(ctx) {
  if (ctx.skills === undefined) return

  const disposers = []
  let disposed = false

  ctx.effect(() => {
    for (const rel of SKILL_DIRS) {
      loadSkill(resolve(HERE, rel))
        .then((skill) => {
          if (disposed || skill === undefined) return
          disposers.push(ctx.skills.register(skill))
          ctx.logger.info('ai-plugin-toolkit: registered the "%s" skill', skill.name)
        })
        .catch((e) => {
          ctx.logger.warn('ai-plugin-toolkit: failed to register %s: %o', rel, e)
        })
    }

    return () => {
      disposed = true
      for (const dispose of disposers) dispose?.()
    }
  })

  startHubBridge(ctx)
}

// ---------------------------------------------------------------------------
// aipx MCP hub bridge — HTTP routes backing the aipx hub console (web GUI only)
// ---------------------------------------------------------------------------

/**
 * The management surface of the running aipx MCP hub, all same-origin JSON.
 * `dsh-host-webserver` binds loopback by default and dispatches routes
 * without regard to method, so each entry owns its method check.
 */
const HUB_ROUTES = [
  { method: 'GET', path: '/aipx-hub/status', handle: (bridge) => bridge.status() },
  { method: 'GET', path: '/aipx-hub/tools', handle: (bridge, body, query) => bridge.tools(query.limit) },
  { method: 'POST', path: '/aipx-hub/search', handle: (bridge, body) => bridge.search(body.query ?? '', body.limit) },
  { method: 'GET', path: '/aipx-hub/config', handle: (bridge) => bridge.getConfig() },
  {
    method: 'POST',
    path: '/aipx-hub/servers',
    handle: (bridge, body) => bridge.setServer(body.action, body.name, body.def),
  },
]

const HUB_BODY_CAP = 1 << 20 // server definitions are tiny; the cap is abuse guard

function sendJson(res, status, value) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(value))
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > HUB_BODY_CAP) {
      const e = new Error('request body too large')
      e.status = 413
      throw e
    }
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    const e = new Error('request body is not valid JSON')
    e.status = 400
    throw e
  }
}

/**
 * Adapt one HUB_ROUTES entry to a `WebRoute` handler: the webserver hands over
 * the raw node:http pair and does not dispatch on method. Every failure —
 * including validation errors carrying `status` from the bridge — becomes a
 * JSON error body; an escaping throw would be flattened to a bare 400 by the
 * webserver.
 */
function makeHubHandler(bridge, route) {
  return async (req, res) => {
    if (req.method !== route.method) {
      res.writeHead(405, { allow: route.method, 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: `use ${route.method} ${route.path}` }))
      return
    }
    try {
      const body = route.method === 'POST' ? await readJsonBody(req) : {}
      const query = Object.fromEntries(new URL(req.url ?? '/', 'http://localhost').searchParams)
      sendJson(res, 200, await route.handle(bridge, body, query))
    } catch (e) {
      sendJson(res, typeof e?.status === 'number' ? e.status : 500, { error: String(e?.message ?? e) })
    }
  }
}

/**
 * Register the hub routes when (and only when) this profile runs a web
 * server. `ctx.webServer` is an optional Cordis service: on profiles without
 * it (tui, headless) the property read itself throws, so the access is
 * wrapped — the skill registration above must not depend on this succeeding.
 */
function startHubBridge(ctx) {
  // The webServer service (dsh-web-app) can provide after this plugin's
  // apply(), and tui/headless profiles never provide it — so the lookup is
  // unguarded (ctx.reflect.get returns undefined instead of throwing) and
  // retried briefly against boot-order races. Skills never depend on this.
  const attempt = () => {
    let webServer
    try {
      webServer = ctx.reflect?.get?.('webServer') ?? ctx.webServer
    } catch {
      return false // no webserver in this profile at all
    }
    if (!webServer || typeof webServer.register !== 'function') return false
    registerHubRoutes(ctx, webServer)
    return true
  }
  if (attempt()) return
  let tries = 0
  const timer = setInterval(() => {
    if (attempt() || ++tries >= 60) clearInterval(timer)
  }, 500)
}

function registerHubRoutes(ctx, webServer) {

  const bridge = new HubBridge({ log: (msg) => ctx.logger.info('aipx-hub: %s', msg) })
  const disposers = []

  ctx.effect(() => {
    for (const route of HUB_ROUTES) {
      try {
        disposers.push(webServer.register({ kind: 'exact', path: route.path, handler: makeHubHandler(bridge, route) }))
      } catch (e) {
        // a duplicate path is another plugin's claim — degrade to a warning
        ctx.logger.warn('aipx-hub: failed to register %s: %o', route.path, e)
      }
    }
    return () => {
      for (const dispose of disposers) dispose?.()
      disposers.length = 0
      void bridge.stop()
    }
  })
}
