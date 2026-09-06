/**
 * Source detector + name derivation for the Hub Console's free-text "Install"
 * input. Zero dependencies; mirrors the aipx CLI's src/source.js + github.js +
 * detect.js semantics so a pasted MCP config, GitHub link, npm package, or bare
 * command resolves into concrete `{ name, def }` entries for mcp-hub.json.
 *
 * defs emitted here are the raw {command, args, env} / {url, headers} shape that
 * HubBridge.normalizeServerDef already validates.
 */
import { existsSync } from 'node:fs'
import { createWriteStream } from 'node:fs'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const UA = 'aipx (https://github.com/zhangliang0115/ai-plugin)'

function invalid(message) {
  const e = new Error(message)
  e.status = 400
  return e
}

const LAUNCHERS = new Set(['npx', 'uvx', 'uv', 'docker', 'python', 'python3', 'node', 'pipx', 'bun', 'deno'])

function expandTilde(p) {
  if (p.startsWith('~/')) return `${homedir()}${p.slice(1)}`
  return p
}

/** Normalize one raw def object into {command,args,env} or {url,headers}. */
export function toServerDef(def) {
  if (def === null || typeof def !== 'object') throw invalid('服务器定义必须是对象 {command,args?,env?} 或 {url}')
  if (typeof def.command === 'string' && def.command !== '') {
    const env = {}
    if (def.env && typeof def.env === 'object') {
      for (const [k, v] of Object.entries(def.env)) env[String(k)] = String(v)
    }
    // "command":"npx -y pkg" without args → split into command+args
    const parts = def.command.split(/\s+/)
    const args = Array.isArray(def.args) ? def.args.map(String) : parts.slice(1)
    return { command: Array.isArray(def.args) ? def.command : parts[0], args, env }
  }
  if (typeof def.url === 'string' && def.url !== '') {
    const out = { url: def.url }
    if (def.headers && typeof def.headers === 'object') {
      out.headers = {}
      for (const [k, v] of Object.entries(def.headers)) out.headers[String(k)] = String(v)
    }
    return out
  }
  throw invalid('服务器定义需要非空 command(stdio) 或 url(http)')
}

/** Derive a safe server name from a single-source descriptor. */
export function deriveName(desc) {
  let base = ''
  if (desc.kind === 'command') {
    const toks = [...(desc.command ?? '').split(/\s+/), ...(desc.args ?? [])].filter(Boolean)
    // skip launcher tokens (npx/uvx/…) and flags (-y, --…), take the first real token
    base = toks.find((t) => !t.startsWith('-') && !LAUNCHERS.has(t)) ?? desc.command ?? 'mcp-server'
    // a path-looking token (node /a/b/script.mjs) → use its basename, strip ext
    if (base.includes('/') || base.includes('\\\\')) base = path.basename(base).replace(/\.[^.]+$/, '')
  } else if (desc.kind === 'url') {
    try { base = new URL(desc.url).hostname } catch { base = desc.url }
  } else if (desc.kind === 'npm') {
    base = desc.pkg
  }
  base = String(base)
    .replace(/^@[^/]+\//, '') // strip @scope/
    .replace(/-server$/, '')
    .replace(/^server-/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return base || 'mcp-server'
}

export function sanitizeName(name, def) {
  const base = typeof name === 'string' && name !== '' ? name : deriveName({ kind: 'command', command: def?.command ?? '' })
  return base.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()
}

/**
 * Parse a free-text install input into a descriptor. Detection order:
 * JSON > github > http-url > npm > bare-command > local-path.
 * Throws (status 400) when nothing matches.
 */
export function parseInstallSource(raw) {
  const s = String(raw ?? '').trim()
  if (s === '') throw invalid('先填入一个 MCP 命令、JSON 定义或安装链接')

  // 1) JSON: {mcpServers:{name:def}}, a single def, or [def...]
  if (s.startsWith('{') || s.startsWith('[')) {
    let obj
    try { obj = JSON.parse(s) } catch (e) { throw invalid(`JSON 无法解析: ${e.message}`) }
    return { kind: 'json', entries: entriesFromJson(obj) }
  }

  // 2) GitHub (URL / short / ssh)
  const gh = tryGithub(s)
  if (gh) return gh

  // 3) any other http(s) url → remote MCP server
  if (/^https?:\/\//.test(s)) return { kind: 'url', url: s }

  // 4) npm package (@scope/pkg or single token, not a launcher)
  const npm = tryNpm(s)
  if (npm) return npm

  // 5) bare command (contains whitespace → clearly a command)
  if (/\s/.test(s)) {
    const tok = s.split(/\s+/)
    return { kind: 'command', command: tok[0], args: tok.slice(1) }
  }

  // 6) local path — must exist on disk
  if (/^(\.\/|\.\.\/|\/|~\/|\\\\|.*:\\|.*)/.test(s) && ('./' + s).length > 0) {
    return { kind: 'local', path: expandTilde(stripLocal(s)) }
  }

  throw invalid(`无法解析 "${s}" — 支持 owner/repo、github.com 链接、MCP JSON 定义、npm 包名，或一条命令`)
}

function stripLocal(s) {
  // C:\ → keep as-is; otherwise pass through (expandTilde handles ~/)
  return s
}

function entriesFromJson(obj) {
  if (Array.isArray(obj)) {
    return obj.map((it) => {
      if (it && typeof it === 'object' && it.def) {
        return { name: sanitizeName(it.name, it.def), def: toServerDef(it.def) }
      }
      const name = sanitizeName(it?.name, it)
      return { name, def: toServerDef(it) }
    })
  }
  if (obj && typeof obj === 'object') {
    if (obj.mcpServers && typeof obj.mcpServers === 'object') {
      return Object.entries(obj.mcpServers)
        .filter(([, d]) => d && typeof d === 'object')
        .map(([name, def]) => ({ name: sanitizeName(name, def), def: toServerDef(def) }))
    }
    return [{ name: sanitizeName(obj.name, obj), def: toServerDef(obj) }]
  }
  throw invalid('JSON 里没有可识别的 MCP 服务器定义')
}

function tryGithub(raw) {
  const url = /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#]+?)(?:\.git)?(?:\/|$)(.*)$/.exec(raw)
  if (url) {
    const rest = url[3].replace(/\/+$/, '')
    const tree = rest === '' ? null : /^tree\/([^/]+)(?:\/(.*))?$/.exec(rest)
    if (rest !== '' && !tree) throw invalid(`不支持的 GitHub URL 路径 "/${rest}" — 用 .../tree/<ref>/<subpath>`)
    return { kind: 'github', owner: url[1], repo: url[2], ref: tree ? tree[1] : null, sub: tree ? tree[2] ?? null : null }
  }
  const ssh = /^git@github\.com:([^/\s]+)\/([^/\s#]+?)(?:\.git)?$/.exec(raw)
  if (ssh) return { kind: 'github', owner: ssh[1], repo: ssh[2], ref: null, sub: null }
  const short = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:#path:\/?(.+))?$/.exec(raw)
  if (short) return { kind: 'github', owner: short[1], repo: short[2], ref: null, sub: short[3] ? short[3].replace(/\/+$/, '') : null }
  return null
}

function tryNpm(raw) {
  if (/^@[^/\s]+\/[^/\s]+$/.test(raw)) return { kind: 'npm', pkg: raw }
  if (/^[A-Za-z0-9][\w.-]*$/.test(raw) && !LAUNCHERS.has(raw)) return { kind: 'npm', pkg: raw }
  return null
}

/**
 * For GitHub / local sources: resolve `.mcp.json` / `mcp.json` mcpServers into
 * concrete {name, def} entries (or throw if none found).
 */
export async function resolveMcpPayload(desc, { log = () => {} } = {}) {
  let dir
  let temp = null
  if (desc.kind === 'local') {
    dir = desc.path
    if (!existsSync(dir)) throw invalid(`本地路径不存在: ${dir}`)
  } else {
    const dl = await downloadRepo(desc, { log })
    temp = dl.temp
    dir = dl.root
  }
  try {
    const entries = await readMcpServers(dir)
    if (entries.length === 0) throw invalid('未在该来源中找到 MCP 服务器定义(.mcp.json / mcp.json)')
    return entries
  } finally {
    if (temp) await rm(temp, { recursive: true, force: true }).catch(() => {})
  }
}

async function readMcpServers(dir) {
  for (const candidate of ['.mcp.json', 'mcp.json']) {
    const p = path.join(dir, candidate)
    if (!existsSync(p)) continue
    try {
      const parsed = JSON.parse(await readFile(p, 'utf8'))
      const section = parsed?.mcpServers
      if (section && typeof section === 'object') {
        return Object.entries(section)
          .filter(([, d]) => d && typeof d === 'object')
          .map(([name, def]) => ({ name: sanitizeName(name, def), def: toServerDef(def) }))
      }
    } catch {}
    break
  }
  return []
}

async function downloadRepo({ owner, repo, ref }, { log }) {
  const url = ref
    ? `https://api.github.com/repos/${owner}/${repo}/tarball/${encodeURIComponent(ref)}`
    : `https://api.github.com/repos/${owner}/${repo}/tarball`
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  if (!res.ok) {
    if (res.status === 404) throw invalid(`仓库不存在(或私有): ${owner}/${repo}`)
    if (res.status === 403) throw invalid('GitHub 速率受限 — 设置 GITHUB_TOKEN 提高限额')
    throw invalid(`下载失败 ${owner}/${repo}: HTTP ${res.status}`)
  }
  log(`下载 ${owner}/${repo} …`)
  const temp = await mkdtemp(path.join(tmpdir(), 'aipx-install-'))
  const archive = path.join(temp, 'repo.tar.gz')
  await pipeline(Readable.fromWeb(res.body), createWriteStream(archive))
  await execFileAsync('tar', ['-xzf', archive, '-C', temp])
  await rm(archive, { force: true })
  const entries = await readdir(temp)
  return { temp, root: path.join(temp, entries[0] ?? '') }
}
