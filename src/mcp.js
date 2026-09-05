import path from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { AGENTS } from './agents.js'
import { exists, expandTilde, HOME as OS_HOME, info, c, ok, warn } from './util.js'

/**
 * Cross-agent MCP config inventory & sync.
 *
 * Config locations follow the same honest-tier policy as skills (see
 * docs/compatibility-matrix.md): official roots are read/written by default,
 * community ones need --all or --agents. dsh is intentionally absent: it runs
 * MCP servers through its own bundle/patch config, not a flat server list.
 *
 * The Codex CLI config is TOML; everything else is JSON. The TOML reader and
 * writer handle the `[mcp_servers.NAME]` table shape (command/args/env/url)
 * and preserve the rest of the file verbatim.
 */

export const MCP_TARGETS = [
  { agentId: 'claude-code', file: '~/.claude.json', format: 'json', key: 'mcpServers', tier: 'official' },
  { agentId: 'cursor', file: '~/.cursor/mcp.json', format: 'json', key: 'mcpServers', tier: 'community' },
  { agentId: 'gemini', file: '~/.gemini/settings.json', format: 'json', key: 'mcpServers', tier: 'official' },
  { agentId: 'codex', file: '~/.codex/config.toml', format: 'toml', key: 'mcp_servers', tier: 'official' },
  { agentId: 'copilot', file: '~/.copilot/mcp-config.json', format: 'json', key: 'mcpServers', tier: 'community' },
  { agentId: 'opencode', file: '~/.config/opencode/opencode.json', format: 'json', key: 'mcp', tier: 'official', mapDef: 'opencode' },
  { agentId: 'openclaw', file: '~/.openclaw/openclaw.json', format: 'json', key: 'mcp.servers', tier: 'official' },
  { agentId: 'reasonix', file: '~/.reasonix/config.toml', format: 'toml-aot', key: 'plugins', tier: 'official' },
]

/**
 * Project-scoped MCP configs, used when `--project` is set. Claude Code's
 * project file (.mcp.json) is the team-shared standard; Cursor follows.
 */
export const MCP_PROJECT_TARGETS = [
  { agentId: 'claude-code', file: '.mcp.json', format: 'json', key: 'mcpServers', tier: 'official', project: true },
  { agentId: 'cursor', file: '.cursor/mcp.json', format: 'json', key: 'mcpServers', tier: 'community', project: true },
]

function agentLabel(agentId) {
  return AGENTS.find((a) => a.id === agentId)?.label ?? agentId
}

function resolveTarget(target, home) {
  const base = home ?? OS_HOME
  const file = target.file.startsWith('~') ? path.join(base, target.file.slice(2)) : target.file
  return { ...target, resolvedFile: file }
}

// ---------------------------------------------------------------------------
// JSON format
// ---------------------------------------------------------------------------

function keyPath(key) {
  return key.split('.')
}

function sectionAt(parsed, keys) {
  let node = parsed
  for (const k of keys) {
    if (!node || typeof node !== 'object') return undefined
    node = node[k]
  }
  return node
}

function ensureSection(parsed, keys) {
  let node = parsed
  for (const k of keys) {
    if (!node[k] || typeof node[k] !== 'object') node[k] = {}
    node = node[k]
  }
  return node
}

async function readJsonServers(resolvedFile, key) {
  if (!(await exists(resolvedFile))) return { servers: new Map(), exists: false }
  let parsed
  try {
    parsed = JSON.parse(await readFile(resolvedFile, 'utf8'))
  } catch (e) {
    throw new Error(`cannot parse ${resolvedFile}: ${e.message}`)
  }
  const section = sectionAt(parsed, keyPath(key))
  const servers = new Map()
  if (section && typeof section === 'object') {
    for (const [name, def] of Object.entries(section)) {
      if (def && typeof def === 'object') servers.set(name, def)
    }
  }
  return { servers, exists: true }
}

async function writeJsonServer(resolvedFile, key, name, def) {
  let parsed = {}
  if (await exists(resolvedFile)) {
    parsed = JSON.parse(await readFile(resolvedFile, 'utf8'))
  }
  const section = ensureSection(parsed, keyPath(key))
  section[name] = def
  await mkdir(path.dirname(resolvedFile), { recursive: true })
  await writeFile(resolvedFile, JSON.stringify(parsed, null, 2) + '\n', 'utf8')
}

// ---------------------------------------------------------------------------
// TOML array-of-tables (Reasonix) — [[plugins]] rows distinguished by a
// name = "..." line, not by the table header. Same minimal line-based
// approach as the Codex writer; strings are JSON-escaped (a superset of
// TOML basic strings for the values we write).
// ---------------------------------------------------------------------------

function tomlAotRows(text, key) {
  const header = `[${key}]`
  const rows = []
  const lines = text.split('\n')
  let i = 0
  while (i < lines.length) {
    if (lines[i].trim() === header) {
      const start = i
      const row = { start, lines: [] }
      i += 1
      while (i < lines.length && lines[i].trim() !== header) {
        // stop at the next table header of any kind ([x] or [[x]])
        if (/^\s*\[/.test(lines[i])) break
        row.lines.push(lines[i])
        i += 1
      }
      const nameMatch = row.lines.map((l) => /^\s*name\s*=\s*"([^"]*)"\s*$/.exec(l)).find(Boolean)
      if (nameMatch) {
        row.name = nameMatch[1]
        rows.push(row)
      }
      continue
    }
    i += 1
  }
  return rows
}

function tomlAotDefLines(def) {
  const lines = []
  if (def.type) lines.push(`type = "${String(def.type)}"`)
  if (typeof def.command === 'string' && def.command !== '') {
    lines.push(`command = "${String(def.command)}"`)
    if (Array.isArray(def.args) && def.args.length > 0) {
      lines.push(`args = [${def.args.map((a) => `"${String(a)}"`).join(', ')}]`)
    }
  }
  if (typeof def.url === 'string' && def.url !== '') lines.push(`url = "${String(def.url)}"`)
  if (def.env && typeof def.env === 'object') {
    const entries = Object.entries(def.env)
    if (entries.length > 0) {
      lines.push(`env = { ${entries.map(([k, v]) => `${k} = "${String(v)}"`).join(', ')} }`)
    }
  }
  return lines
}

function parseTomlAotPlugins(text, key) {
  const servers = new Map()
  for (const row of tomlAotRows(text, key)) {
    // recover a canonical def from the row lines (best-effort read view)
    const get = (k) => {
      const m = row.lines.map((l) => new RegExp(`^\\s*${k}\\s*=\\s*(.+)$`).exec(l)).find(Boolean)
      return m ? m[1].trim() : undefined
    }
    const def = {}
    const command = get('command')
    if (command) def.command = command.replace(/^"|"$/g, '')
    const argsRaw = get('args')
    if (argsRaw) def.args = [...argsRaw.matchAll(/"([^"]*)"/g)].map((m) => m[1])
    const url = get('url')
    if (url) def.url = url.replace(/^"|"$/g, '')
    const envRaw = get('env')
    if (envRaw) {
      def.env = {}
      for (const m of envRaw.matchAll(/(\w+) = "([^"]*)"/g)) def.env[m[1]] = m[2]
    }
    servers.set(row.name, def)
  }
  return servers
}

async function writeTomlAotPlugin(resolvedFile, key, name, def) {
  let text = ''
  if (await exists(resolvedFile)) text = await readFile(resolvedFile, 'utf8')
  const rows = tomlAotRows(text, key)
  const defLines = tomlAotDefLines(def)
  const header = `[${key}]`
  const lines = text.split('\n')
  const existing = rows.find((r) => r.name === name)
  const newBlock = [header, `name = "${name}"`, ...defLines]
  let out
  if (existing) {
    const before = lines.slice(0, existing.start)
    let afterStart = existing.start + 1 + existing.lines.length
    while (afterStart < lines.length && lines[afterStart].trim() === '') afterStart += 1
    out = [...before, ...newBlock, '', ...lines.slice(afterStart)]
  } else {
    const trimmed = text.length > 0 && !text.endsWith('\n') ? text + '\n' : text
    const sep = trimmed.trim() === '' ? '' : '\n'
    out = (trimmed + sep + newBlock.join('\n') + '\n').split('\n')
    out = out.join('\n').split('\n')
  }
  await mkdir(path.dirname(resolvedFile), { recursive: true })
  await writeFile(resolvedFile, out.join('\n'), 'utf8')
}

async function removeTomlAotPlugin(resolvedFile, key, name) {
  if (!(await exists(resolvedFile))) return false
  const rows = tomlAotRows(await readFile(resolvedFile, 'utf8'), key)
  const existing = rows.find((r) => r.name === name)
  if (!existing) return false
  const lines = (await readFile(resolvedFile, 'utf8')).split('\n')
  let afterStart = existing.start + 1 + existing.lines.length
  while (afterStart < lines.length && lines[afterStart].trim() === '') afterStart += 1
  lines.splice(existing.start, afterStart - existing.start)
  await writeFile(resolvedFile, lines.join('\n'), 'utf8')
  return true
}

// ---------------------------------------------------------------------------
// TOML format (Codex) — minimal, only [mcp_servers.NAME] tables
// ---------------------------------------------------------------------------

function parseTomlMcpServers(text, keyPrefix) {
  const servers = new Map()
  const lines = text.split(/\r?\n/)
  let current = null
  let currentName = null
  const sectionStart = new Map()

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const header = new RegExp(`^\\s*\\[${keyPrefix}\\.([^\\]".]+)\\]\\s*$`).exec(line)
    if (header) {
      currentName = header[1]
      current = {}
      servers.set(currentName, current)
      sectionStart.set(currentName, i)
      continue
    }
    if (current !== null && /^\s*\[/.test(line)) {
      current = null // a different section started
      continue
    }
    if (current !== null) {
      const kv = /^([A-Za-z_][\w-]*)\s*=\s*(.+?)\s*$/.exec(line)
      if (kv) current[kv[1]] = parseTomlValue(kv[2])
    }
  }
  return { servers, sectionStart, lines }
}

function parseTomlValue(raw) {
  const v = raw.trim()
  if (/^".*"$/.test(v) || /^'.*'$/.test(v)) return v.slice(1, -1)
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  if (v.startsWith('[')) {
    // inline array of strings
    const inner = v.slice(1, -1)
    if (inner.trim() === '') return []
    return [...inner.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1])
  }
  if (v.startsWith('{')) {
    // inline table of KEY = "value"
    const out = {}
    for (const m of v.slice(1, -1).matchAll(/([A-Za-z_][\w-]*)\s*=\s*"((?:[^"\\]|\\.)*)"/g)) {
      out[m[1]] = m[2]
    }
    return out
  }
  return v
}

function tomlServerDef(def) {
  const lines = []
  if (def.command !== undefined) lines.push(`command = ${JSON.stringify(def.command)}`)
  if (Array.isArray(def.args) && def.args.length > 0) {
    lines.push(`args = [${def.args.map((a) => JSON.stringify(String(a))).join(', ')}]`)
  }
  if (def.env && typeof def.env === 'object' && Object.keys(def.env).length > 0) {
    const pairs = Object.entries(def.env).map(([k, v]) => `${k} = ${JSON.stringify(String(v))}`)
    lines.push(`env = { ${pairs.join(', ')} }`)
  }
  if (def.url !== undefined) lines.push(`url = ${JSON.stringify(def.url)}`)
  return lines
}

async function writeTomlServer(resolvedFile, keyPrefix, name, def) {
  let text = ''
  if (await exists(resolvedFile)) text = await readFile(resolvedFile, 'utf8')
  const { sectionStart, lines } = parseTomlMcpServers(text, keyPrefix)

  const header = `[${keyPrefix}.${name}]`
  const body = [header, ...tomlServerDef(def)].concat('')

  let out
  if (sectionStart.has(name)) {
    const start = sectionStart.get(name)
    let end = lines.length
    for (let i = start + 1; i < lines.length; i += 1) {
      if (/^\s*\[/.test(lines[i])) {
        end = i
        break
      }
    }
    lines.splice(start, end - start, ...body)
    out = lines.join('\n')
  } else {
    const sep = text.length > 0 && !text.endsWith('\n') ? '\n' : ''
    const blank = text.trim().length > 0 ? '\n' : ''
    out = text + sep + blank + body.join('\n')
  }
  await mkdir(path.dirname(resolvedFile), { recursive: true })
  await writeFile(resolvedFile, out, 'utf8')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function mcpTargets(home) {
  return MCP_TARGETS.map((t) => resolveTarget(t, home))
}

function resolvedProjectTargets(projectDir) {
  return MCP_PROJECT_TARGETS.map((t) => ({ ...t, resolvedFile: path.join(projectDir, t.file) }))
}

async function projectDirFrom(opts) {
  const dir = opts.project === true ? process.cwd() : expandTilde(opts.project)
  if (!(await exists(dir))) throw new Error(`project directory not found: ${dir}`)
  return dir
}

export async function listMcp(opts = {}) {
  const out = {}
  const includeCommunity = opts.all || opts.includeCommunity

  const scan = async (target) => {
    let r
    try {
      r = await readJsonOrToml(target)
    } catch (e) {
      out[target.agentId] = { label: agentLabel(target.agentId), file: target.resolvedFile, error: e.message }
      return
    }
    if (!r.exists) return
    out[target.agentId] = {
      label: agentLabel(target.agentId),
      file: target.resolvedFile,
      format: target.format,
      servers: [...r.servers.entries()].map(([name, def]) => ({ name, def })),
    }
  }

  if (opts.project) {
    const projectDir = await projectDirFrom(opts)
    for (const target of resolvedProjectTargets(projectDir)) {
      if (target.tier === 'community' && !includeCommunity) continue
      await scan(target)
    }
    return out
  }

  for (const target of mcpTargets(opts.home)) {
    if (target.tier === 'community' && !includeCommunity) continue
    await scan(target)
  }
  return out
}

async function readJsonOrToml(target) {
  if (target.format === 'toml-aot') {
    if (!(await exists(target.resolvedFile))) return { servers: new Map(), exists: false }
    const text = await readFile(target.resolvedFile, 'utf8')
    return { servers: parseTomlAotPlugins(text, target.key), exists: true }
  }
  if (target.format === 'toml') {
    if (!(await exists(target.resolvedFile))) return { servers: new Map(), exists: false }
    const text = await readFile(target.resolvedFile, 'utf8')
    const { servers } = parseTomlMcpServers(text, target.key)
    return { servers, exists: true }
  }
  return readJsonServers(target.resolvedFile, target.key)
}

/** Write one server definition into a resolved target config (test hook friendly). */
// Definition-shape adapters: some agents want the same data in a different
// coat. Each takes the aipx canonical def ({command, args?, env?} or {url})
// and returns the target's native shape, or null when the def cannot be
// expressed (caller skips with a notice instead of writing something wrong).
const DEF_MAPPERS = {
  // Reasonix AoT rows need an explicit transport type: stdio is the default,
  // remote (url-only) defs must say type = "http"
  reasonix(def) {
    if (typeof def.url === 'string' && def.url !== '' && !def.command) {
      return { ...def, type: 'http' }
    }
    return def
  },
  // OpenCode: local = { type:'local', command:[cmd,...args], environment } —
  // remote = { type:'remote', url }
  opencode(def) {
    if (typeof def.command === 'string' && def.command !== '') {
      return {
        type: 'local',
        command: [def.command, ...(def.args ?? []).map(String)],
        ...(def.env && Object.keys(def.env).length > 0 ? { environment: def.env } : {}),
        enabled: true,
      }
    }
    if (typeof def.url === 'string' && def.url !== '') {
      return { type: 'remote', url: def.url, enabled: true }
    }
    return null
  },
}

export async function writeServer(target, name, def) {
  const mapped = target.mapDef && DEF_MAPPERS[target.mapDef] ? DEF_MAPPERS[target.mapDef](def) : def
  if (mapped === null) {
    info(`${target.agentId}: this server definition cannot be expressed in ${target.agentId}'s config format — skipped`)
    return
  }
  if (target.format === 'toml-aot') {
    await writeTomlAotPlugin(target.resolvedFile, target.key, name, mapped)
  } else if (target.format === 'toml') {
    await writeTomlServer(target.resolvedFile, target.key, name, mapped)
  } else {
    await writeJsonServer(target.resolvedFile, target.key, name, mapped)
  }
}

/** Read all servers from a resolved target config (test hook friendly). */
export async function readServers(target) {
  const r = await readJsonOrToml(target)
  return r.servers
}

/** Remove a server definition from a resolved target config. Returns true when removed. */
export async function removeServer(target, name) {
  if (!(await exists(target.resolvedFile))) return false
  if (target.format === 'toml-aot') {
    return removeTomlAotPlugin(target.resolvedFile, target.key, name)
  }
  if (target.format === 'toml') {
    const text = await readFile(target.resolvedFile, 'utf8')
    const { sectionStart, lines } = parseTomlMcpServers(text, target.key)
    if (!sectionStart.has(name)) return false
    const start = sectionStart.get(name)
    let end = lines.length
    for (let i = start + 1; i < lines.length; i += 1) {
      if (/^\s*\[/.test(lines[i])) {
        end = i
        break
      }
    }
    lines.splice(start, end - start)
    await writeFile(target.resolvedFile, lines.join('\n'), 'utf8')
    return true
  }
  const parsed = JSON.parse(await readFile(target.resolvedFile, 'utf8'))
  const section = sectionAt(parsed, keyPath(target.key))
  if (!section || !(name in section)) return false
  delete section[name]
  await writeFile(target.resolvedFile, JSON.stringify(parsed, null, 2) + '\n', 'utf8')
  return true
}

/**
 * Copy the MCP server `name` from its source config into other targets.
 *
 * opts: from (agent id) | agents (csv) | all | dryRun | home (test hook)
 */
export async function syncMcp(name, opts = {}) {
  if (!name) throw new Error('usage: aipx mcp sync <server-name>')

  // sources: user configs always; project configs join the search in --project mode
  const pool = mcpTargets(opts.home)
  let projectDir = null
  if (opts.project) {
    projectDir = await projectDirFrom(opts)
    pool.push(...resolvedProjectTargets(projectDir))
  }

  const found = []
  for (const target of pool) {
    const r = await readJsonOrToml(target)
    if (r.servers.has(name)) found.push({ target, def: r.servers.get(name) })
  }

  if (found.length === 0) {
    throw new Error(
      `MCP server "${name}" was not found in any known agent config — run \`aipx mcp list\` to see what aipx can see`
    )
  }

  const source = opts.from ? found.find((f) => f.target.agentId === opts.from) : found[0]
  if (!source) {
    throw new Error(`"${name}" is not configured in "${opts.from}" — it was found in: ${found.map((f) => f.target.agentId).join(', ')}`)
  }

  // destinations
  let destinations
  if (opts.project) {
    destinations = resolvedProjectTargets(projectDir).filter((t) => t.tier === 'official' || opts.all)
    if (opts.agents) {
      const ids = opts.agents.split(',').map((s) => s.trim()).filter(Boolean)
      destinations = destinations.filter((t) => ids.includes(t.agentId))
    }
  } else if (opts.agents) {
    const ids = opts.agents.split(',').map((s) => s.trim()).filter(Boolean)
    const unknown = ids.filter((id) => !MCP_TARGETS.some((t) => t.agentId === id))
    if (unknown.length > 0) throw new Error(`unknown agent id(s): ${unknown.join(', ')}`)
    destinations = mcpTargets(opts.home).filter((t) => ids.includes(t.agentId))
  } else {
    destinations = mcpTargets(opts.home).filter(
      (t) => t.agentId !== source.target.agentId && (t.tier === 'official' || opts.all)
    )
  }
  // never write back into the source file itself
  destinations = destinations.filter((t) => t.resolvedFile !== source.target.resolvedFile)
  // opencode uses a different definition shape (command as array) — read-only
  // for now rather than writing something wrong
  destinations = destinations.filter((t) => {
    if (t.agentId === 'opencode') {
      info(`opencode: writing not supported yet (${t.resolvedFile}) — add it manually from the definition below`)
      return false
    }
    return true
  })

  if (destinations.length === 0) {
    info('no destination configs to sync into')
    return { synced: 0 }
  }

  console.log()
  ok(`source: ${agentLabel(source.target.agentId)} ${source.target.resolvedFile}`)
  console.log(`    ${JSON.stringify(source.def)}`)
  console.log()

  let synced = 0
  for (const dest of destinations) {
    if (dest.format === 'toml' && source.def.url && !source.def.command) {
      warn(`${agentLabel(dest.agentId)}: skipping — remote (url) servers are not supported by the codex writer yet`)
      continue
    }
    if (opts.dryRun) {
      console.log(`    would write ${name} → ${dest.resolvedFile}`)
      continue
    }
    if (dest.format === 'toml') {
      await writeTomlServer(dest.resolvedFile, dest.key, name, source.def)
    } else {
      const def = { ...source.def }
      await writeJsonServer(dest.resolvedFile, dest.key, name, def)
    }
    synced += 1
    ok(`synced ${c.bold(name)} → ${agentLabel(dest.agentId)} ${dest.resolvedFile}`)
  }

  if (opts.dryRun) info('dry run — nothing written')
  return { synced }
}
