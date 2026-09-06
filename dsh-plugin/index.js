import { readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HubBridge, messageText } from './lib/hub-bridge.js'

export const name = 'ai-plugin-toolkit'
// `webserver` is provided by dsh-web-app only; on tui/headless profiles the
// plugin still loads — a missing injected service just throws on access,
// which startHubBridge treats as "no console here".
export const inject = ['skills']

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Fallback rewrite rule for /prompt-optimize when the plugin config is
 * unreachable (no web profile, config unreadable). Kept identical in intent
 * to the bridge's DEFAULT_SYSTEM_PROMPT — the command and the dock must never
 * diverge on the rules they apply.
 */
const DEFAULT_PROMPT_OPTIMIZE_RULE = [
  '请把下面的「原始需求」改写成一个高质量提示词。要求：',
  '1. 明确目标与预期产出物；',
  '2. 补全必要上下文与约束，不确定之处以「假设：…」列出；',
  '3. 按 目标 / 背景 / 要求 / 产出格式 分节，输出可直接复制使用；',
  '4. 只输出改写后的提示词，不要执行这个需求。',
].join('\n')

/**
 * The single HubBridge created by registerHubRoutes, kept so the
 * /prompt-optimize command reuses the same plugin config as the web dock.
 * null until a web server is present in this profile.
 */
let hubBridge = null

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

  // /prompt-optimize —— 聊天窗快捷命令：把一句模糊需求改写成结构化提示词。
  // 走官方 commands 注入（服务缺失时静默跳过，不影响技能注册）。
  // 改写规则与网页 dock 共用同一份插件配置（lib/hub-bridge.js 的 plugin config）。
  try {
    ctx.inject(['commands'], (commandCtx) => {
      commandCtx.commands.register({
        name: 'prompt-optimize',
        description: '把一句模糊的需求改写成结构化提示词（只改写，不执行）',
        input: { hint: '<你的原始需求>' },
        handler(invocation) {
          const raw = String(invocation.rawInput ?? '').trim()
          if (raw.length === 0) {
            return { kind: 'error', text: '用法：/prompt-optimize <原始需求>，例如 /prompt-optimize 帮我写个爬虫' }
          }
          const agent = invocation.agent
          if (agent === undefined) {
            return { kind: 'error', text: '当前上下文没有可代理的 agent' }
          }
          // 有效规则来自插件配置（active 模板 > systemPrompt > 内置默认）；
          // 读不到配置时回退到与桥接 optimize 一致的默认文案。
          const loader = hubBridge !== null && typeof hubBridge.getPluginConfig === 'function'
            ? hubBridge.getPluginConfig()
            : Promise.resolve(null)
          Promise.resolve()
            .then(async () => {
              let rule
              try {
                const config = await loader
                const po = config?.promptOptimize
                const active = Array.isArray(po?.templates) ? po.templates.find((t) => t?.active === true) : undefined
                rule = active?.content ?? po?.systemPrompt ?? null
              } catch {
                rule = null
              }
              if (rule === null || rule === '') rule = DEFAULT_PROMPT_OPTIMIZE_RULE
              const composed = rule.includes('{{input}}')
                ? rule.split('{{input}}').join(raw)
                : `${rule}\n\n原始需求：${raw}`
              const { createUserMessage } = await import('@deepseek-ai/dsh-llm').catch(() => ({ createUserMessage: null }))
              const message = createUserMessage === null
                ? { role: 'user', content: [{ type: 'text', text: composed }], source: { kind: 'user' } }
                : createUserMessage({ content: [{ type: 'text', text: composed }], source: { kind: 'user' } })
              await agent.steer(message)
            })
            .catch((e) => {
              commandCtx.logger?.warn?.('prompt-optimize steer failed: %o', e)
            })
          return { kind: 'success', text: '已提交改写请求，回复即为优化后的提示词。' }
        },
      })
    })
  } catch {
    // commands 服务不可用的 profile 上跳过命令注册
  }
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
  { method: 'POST', path: '/aipx-hub/optimize', handle: (bridge, body) => bridge.optimize(body.text, body.sessionId, body.model) },
  { method: 'GET', path: '/aipx-hub/model-catalog', handle: (bridge) => bridge.modelCatalog() },
  // The webserver claims exact paths, so GET+POST share ONE registration; the
  // handler switches on the method (ANY short-circuits the 405 guard).
  {
    method: 'ANY',
    path: '/aipx-hub/plugin-config',
    handle: (bridge, body, query, req) => {
      if (req.method === 'GET') return bridge.getPluginConfig()
      if (req.method === 'POST') return bridge.setPluginConfig(body)
      const e = new Error('use GET or POST /aipx-hub/plugin-config')
      e.status = 405
      throw e
    },
  },
  {
    method: 'POST',
    path: '/aipx-hub/servers',
    handle: (bridge, body) => bridge.setServer(body.action, body.name, body.def),
  },
  {
    method: 'POST',
    path: '/aipx-hub/tools/toggle',
    handle: (bridge, body) => bridge.toggleTool(body.id, body.disabled),
  },
  {
    method: 'POST',
    path: '/aipx-hub/settings',
    handle: (bridge, body) => bridge.setSettings(body.sidecar),
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
    if (route.method !== 'ANY' && req.method !== route.method) {
      res.writeHead(405, { allow: route.method, 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: `use ${route.method} ${route.path}` }))
      return
    }
    try {
      const body = req.method === 'POST' ? await readJsonBody(req) : {}
      const query = Object.fromEntries(new URL(req.url ?? '/', 'http://localhost').searchParams)
      sendJson(res, 200, await route.handle(bridge, body, query, req))
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

  const bridge = new HubBridge({
    log: (msg) => ctx.logger.info('aipx-hub: %s', msg),
    // 模型目录：与 composer 模型选择器同源（llm 服务的 provider/model 视图），
    // 供设置页「优化所用模型」下拉动态渲染。llm 缺席（tui/headless）时返回
    // 空目录，面板退化为静态预设。
    getModelCatalog: async () => {
      let llm
      let defaultSelection = null
      try {
        llm = ctx.reflect?.get?.('llm') ?? ctx.llm
      } catch {
        return { groups: [], default: null }
      }
      try {
        defaultSelection = ctx.reflect?.get?.('agentDefaultModel')?.currentSelection?.() ?? null
      } catch {
        defaultSelection = null
      }
      if (!llm || typeof llm.listProviders !== 'function') return { groups: [], default: defaultSelection }
      const providers = llm.listProviders()
      const groups = await Promise.all(providers.map(async (provider) => {
        try {
          const models = await llm.listModels(provider.id)
          return {
            id: provider.id,
            name: provider.name,
            models: models.map((model) => ({ id: model.id, name: model.name })),
          }
        } catch (e) {
          ctx.logger?.warn?.('aipx-hub: model catalog for %s failed: %o', provider.id, e)
          return { id: provider.id, name: provider.name, models: [] }
        }
      }))
      return { groups: groups.filter((group) => group.models.length > 0), default: defaultSelection }
    },
    // contextMode "session": resolve the current session's recent turns for
    // the optimize call. Lazy service lookup (web profiles only; sessionQuery
    // is provided by the persisted-session plugin) — any failure degrades to
    // input-only because the bridge catches and logs independently.
    loadSessionContext: async (sessionId) => {
      try {
        let query
        try {
          query = ctx.reflect?.get?.('sessionQuery') ?? ctx.sessionQuery
        } catch {
          return null
        }
        if (!query || typeof query.readSurface !== 'function') return null
        const surface = await query.readSurface(String(sessionId))
        const events = Array.isArray(surface?.events) ? surface.events : []
        if (events.length === 0) return null
        const mod = await import('@deepseek-ai/dsh-session/surface')
        const derive = mod?.deriveEventMessage ?? mod?.default?.deriveEventMessage
        if (typeof derive !== 'function') return null
        const turns = []
        for (const event of events) {
          const message = derive(event)
          const text = messageText(message)
          if (text === '') continue
          turns.push({ role: message.role === 'assistant' ? 'assistant' : 'user', content: text })
        }
        return turns.length > 0 ? turns : null
      } catch (e) {
        ctx.logger.warn('aipx-hub: session context read failed (%s): %o', sessionId, e)
        return null
      }
    },
  })
  hubBridge = bridge
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
