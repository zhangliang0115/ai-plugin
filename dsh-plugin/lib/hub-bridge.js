import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/**
 * Host-side bridge between the dsh web GUI and the aipx MCP hub.
 *
 * Two channels, split by what they touch:
 * - live queries (status / tool catalog / search) go through a lazily spawned
 *   `aipx mcp serve` child over newline-delimited JSON-RPC — exactly what an
 *   agent client sees, so the console can never show a divergent view;
 * - configuration (get / add / remove) reads and writes `mcp-hub.json`
 *   directly (atomic rename), because the running hub holds no config API —
 *   a change drops the child and the next request respawns on the fresh file.
 *
 * Zero dependencies; child plumbing mirrors src/hub/downstream.js.
 */

const PROTOCOL_VERSION = '2024-11-05'
const REQUEST_TIMEOUT_MS = 30_000
const SEARCH_TIMEOUT_MS = 15_000
const DEFAULT_TOOLS_LIMIT = 100
const SEARCH_DEFAULT_LIMIT = 8
// the hub answers initialize but never reads clientInfo — placeholder version
const CLIENT_INFO = { name: 'ai-plugin-toolkit-dsh', version: '0.0.0' }

/**
 * The full-catalog query behind tools(). The hub's lexical index answers an
 * empty query with nothing (it tokenizes to zero terms), so "list all tools"
 * is spelled as a bag of the most common English letters: any real tool
 * description matches enough of them to score positive, and the caller's
 * limit caps the result.
 */

/** Same resolution order as the aipx CLI itself (src/util.js configDir). */
function defaultConfigPath() {
  const base =
    process.env.AIPX_CONFIG_DIR ??
    path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'aipx')
  return path.join(base, 'mcp-hub.json')
}

/** A caller mistake, not a hub failure — the HTTP layer maps `status` to the response code. */
function invalid(message) {
  const e = new Error(message)
  e.status = 400
  return e
}

function positiveInt(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

/** The config's disabledTools as a fresh string array — junk entries dropped. */
function sanitizeDisabledTools(value) {
  return Array.isArray(value) ? value.filter((t) => typeof t === 'string' && t !== '') : []
}

/** Accept {command, args?, env?} (stdio) or {url} (http) — the shapes createHub understands. */
function normalizeServerDef(def) {
  if (def === null || typeof def !== 'object') {
    throw invalid('server definition must be an object: {command, args?, env?} or {url}')
  }
  if (typeof def.command === 'string' && def.command !== '') {
    const env = {}
    if (def.env && typeof def.env === 'object') {
      for (const [k, v] of Object.entries(def.env)) env[String(k)] = String(v)
    }
    return {
      command: def.command,
      args: Array.isArray(def.args) ? def.args.map(String) : [],
      env,
    }
  }
  if (typeof def.url === 'string' && def.url !== '') {
    const out = { url: def.url }
    if (def.headers && typeof def.headers === 'object') {
      const headers = {}
      for (const [k, v] of Object.entries(def.headers)) headers[String(k)] = String(v)
      out.headers = headers
    }
    return out
  }
  throw invalid('server definition needs a non-empty "command" (stdio) or "url" (http)')
}

function parseJsonReply(text, tool) {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`mcp_${tool} returned non-JSON output: ${String(text).slice(0, 200)}`)
  }
}

export class HubBridge {
  /**
   * @param {string} [configPath] - the mcp-hub.json to manage; defaults to the
   *   aipx CLI's resolution (AIPX_CONFIG_DIR || $XDG_CONFIG_HOME/aipx || ~/.config/aipx).
   * @param {(msg: string) => void} [log] - hub stderr and lifecycle diagnostics.
   */
  constructor({ configPath, log } = {}) {
    this.configPath = configPath ?? defaultConfigPath()
    this.log = log ?? (() => {})
    this.child = null
    this.ready = false
    this.startPromise = null
    this.buffer = ''
    this.pending = new Map()
    this.nextId = 1
  }

  /**
   * Live hub status: { running: true, pid, servers: [{name, ready, lastError,
   * tools}] } — mcp_status's rows wrapped with the child's liveness.
   */
  async status() {
    const child = await this._ensure()
    const text = await this._callTool('mcp_status')
    const payload = parseJsonReply(text, 'status')
    // mcp_status returns {servers: [...rows], searchEngine}; older builds sent
    // a bare rows array — both read as a name-keyed map for the console
    const list = Array.isArray(payload) ? payload : Array.isArray(payload?.servers) ? payload.servers : []
    const servers = {}
    for (const entry of list) {
      if (typeof entry !== 'object' || entry === null || typeof entry.name !== 'string') continue
      servers[entry.name] = entry.ready === true
        ? { status: 'ok', tools: typeof entry.tools === 'number' ? entry.tools : 0 }
        : { status: 'error', error: String(entry.lastError ?? 'unknown error') }
    }
    const engine = !Array.isArray(payload) && typeof payload?.searchEngine === 'string' ? payload.searchEngine : null
    return { running: true, pid: child.pid, servers, engine }
  }

  /**
   * The full downstream tool catalog: [{id, server, name, description,
   * inputSchema}]. mcp_status carries per-server counts only (no catalog),
   * so this is mcp_search with the broad-recall query.
   */
  async tools(limit = DEFAULT_TOOLS_LIMIT) {
    const result = await this._request('aipx/catalog', {}, REQUEST_TIMEOUT_MS)
    const tools = Array.isArray(result?.tools) ? result.tools : []
    this.searchEngine = typeof result?.searchEngine === 'string' ? result.searchEngine : null
    return { tools: tools.slice(0, positiveInt(limit, DEFAULT_TOOLS_LIMIT)), engine: this.searchEngine }
  }

  /** mcp_search passthrough — ranked rows + the engine that served them. */
  async search(query, limit = SEARCH_DEFAULT_LIMIT) {
    const results = { results: await this._search(String(query ?? ''), positiveInt(Math.floor(Number(limit)), SEARCH_DEFAULT_LIMIT), SEARCH_TIMEOUT_MS) }
    if (this.searchEngine) results.engine = this.searchEngine
    return results
  }

  /**
   * Prompt optimization: rewrite the composer draft into a structured
   * high-quality prompt via the DeepSeek API. The key resolution mirrors the
   * hub's own credential store (env first, then ~/.dsh/.credentials.yaml).
   */
  async optimize(text) {
    const key = this._deepseekKey()
    if (!key) {
      throw Object.assign(new Error('未找到 DeepSeek API key——在 ~/.dsh/.credentials.yaml 配置后重试'), { status: 400 })
    }
    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是提示词优化助手。把用户的原始输入改写成清晰、具体、结构化的高质量提示词：明确目标与预期产出物，补全必要上下文与约束（不确定处以「假设：…」标注），按 目标/背景/要求/产出格式 分节。只输出改写后的提示词，不要执行它。' },
          { role: 'user', content: String(text ?? '') },
        ],
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      throw Object.assign(new Error(`DeepSeek API ${r.status}: ${detail.slice(0, 200)}`), { status: 502 })
    }
    const data = await r.json()
    const out = data?.choices?.[0]?.message?.content
    if (typeof out !== 'string' || out.length === 0) throw new Error('DeepSeek 返回了空内容')
    return { text: out.trim() }
  }

  _deepseekKey() {
    if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY
    try {
      const yaml = readFileSync(path.join(os.homedir(), '.dsh', '.credentials.yaml'), 'utf8')
      const m = /^\s*DEEPSEEK_API_KEY:\s*(.+)$/m.exec(yaml)
      return m ? m[1].trim() : null
    } catch {
      return null
    }
  }

  /** The parsed mcp-hub.json; a missing or corrupt file reads as {servers: {}} — same policy as the hub. */
  async getConfig() {
    let raw
    try {
      raw = await readFile(this.configPath, 'utf8')
    } catch {
      return { servers: {} }
    }
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed.servers === 'object' && parsed.servers) return parsed
    } catch {
      // corrupt config — start clean rather than refusing to serve
    }
    return { servers: {} }
  }

  /**
   * Add (upsert) or remove one server in mcp-hub.json, then drop the hub
   * child so the next request respawns on the fresh config. Returns the
   * updated config. Validation failures carry `status: 400`.
   */
  async setServer(action, name, def) {
    if (action !== 'add' && action !== 'remove') {
      throw invalid(`action must be "add" or "remove", got ${JSON.stringify(action ?? null)}`)
    }
    if (typeof name !== 'string' || name === '' || name.includes('/')) {
      throw invalid(`server name must be a non-empty string without "/", got ${JSON.stringify(name ?? null)}`)
    }
    const config = await this.getConfig()
    if (action === 'add') {
      config.servers[name] = normalizeServerDef(def)
    } else {
      if (!config.servers[name]) throw invalid(`server "${name}" is not registered`)
      delete config.servers[name]
    }
    await this._saveConfig(config)
    this._disposeChild()
    return config
  }

  /**
   * Enable/disable one downstream tool by id ("server/tool"): the id moves in
   * or out of mcp-hub.json's `disabledTools` (deduped, order preserved), then
   * the hub child is dropped so the next request respawns without it.
   * Returns {ok: true, disabledTools: [...]}.
   */
  async toggleTool(id, disabled) {
    if (typeof id !== 'string' || id === '' || !id.includes('/')) {
      throw invalid(`tool id must be a non-empty string shaped "server/tool", got ${JSON.stringify(id ?? null)}`)
    }
    if (typeof disabled !== 'boolean') {
      throw invalid(`disabled must be a boolean, got ${JSON.stringify(disabled ?? null)}`)
    }
    const config = await this.getConfig()
    const current = sanitizeDisabledTools(config.disabledTools)
    if (disabled) {
      if (!current.includes(id)) current.push(id)
    } else {
      const i = current.indexOf(id)
      if (i !== -1) current.splice(i, 1)
    }
    config.disabledTools = current
    await this._saveConfig(config)
    this._disposeChild()
    return { ok: true, disabledTools: config.disabledTools }
  }

  /**
   * Update hub settings: `sidecar` (one "<command> [args…]" string) lands in
   * mcp-hub.json's search.sidecar; null removes the whole `search` key. Either
   * way the hub child is dropped so the next request respawns on the fresh
   * config. Returns {ok: true, search: {sidecar} | null}.
   */
  async setSettings(sidecar) {
    if (sidecar !== null && (typeof sidecar !== 'string' || sidecar.trim() === '')) {
      throw invalid(`sidecar must be a non-empty string or null, got ${JSON.stringify(sidecar ?? null)}`)
    }
    const config = await this.getConfig()
    let result
    if (sidecar === null) {
      delete config.search
      result = null
    } else {
      config.search = { ...config.search, sidecar }
      result = { sidecar }
    }
    await this._saveConfig(config)
    this._disposeChild()
    return { ok: true, search: result }
  }

  /** Kill the hub child and forget all state. Idempotent; safe mid-request. */
  async stop() {
    const child = this.child
    this.child = null
    this.ready = false
    this.startPromise = null
    this._rejectPending(new Error('aipx hub bridge stopped'))
    if (child) await this._awaitExit(child)
  }

  // -------------------------------------------------------------------------
  // config file
  // -------------------------------------------------------------------------

  /** Atomic write: temp file + rename, so a crash never truncates the config. */
  async _saveConfig(config) {
    await mkdir(path.dirname(this.configPath), { recursive: true })
    const tmp = `${this.configPath}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(config, null, 2) + '\n', 'utf8')
    await rename(tmp, this.configPath)
  }

  // -------------------------------------------------------------------------
  // hub child: spawn, handshake, JSON-RPC
  // -------------------------------------------------------------------------

  _spawnArgv() {
    const bin = process.env.AIPX_BIN
    if (bin) {
      // repo checkouts carry no exec bit on bin/aipx.js — run .js/.cjs/.mjs
      // bins with this Node; anything else is an installed executable
      if (/\.[cm]?js$/i.test(bin)) return [process.execPath, [bin, 'mcp', 'serve']]
      return [bin, ['mcp', 'serve']]
    }
    // win32 resolves `npx` only through the shell (npx.cmd)
    return ['npx', ['-y', 'aipx', 'mcp', 'serve'], process.platform === 'win32' ? { shell: true } : {}]
  }

  /** The running child, starting it first if needed (single flight). */
  _ensure() {
    if (this.child && this.ready) return Promise.resolve(this.child)
    if (!this.startPromise) {
      this.startPromise = this._start().catch((e) => {
        this.startPromise = null
        throw e
      })
    }
    return this.startPromise
  }

  async _start() {
    const [command, args, options] = this._spawnArgv()
    const child = spawn(command, args, { ...options, stdio: ['pipe', 'pipe', 'pipe'] })
    this.child = child
    this.buffer = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => this._onData(chunk))
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => this.log(String(chunk).trim()))
    // stdin writes fail with EPIPE when the hub dies mid-request; the request
    // layer surfaces that — swallow the stream-level error event instead
    child.stdin?.on('error', () => {})
    child.on('error', (e) => this._onDeath(child, `aipx hub failed to start: ${e.message}`))
    child.on('exit', (code) => this._onDeath(child, `aipx hub exited (code ${code ?? 'signal'})`))
    try {
      // `aipx mcp serve` refreshes its index before reading stdin, so the
      // handshake waits in the pipe — possibly for a slow first refresh
      await this._send(child, 'initialize', {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: CLIENT_INFO,
      }, REQUEST_TIMEOUT_MS)
      this._notify(child, 'notifications/initialized')
    } catch (e) {
      this.child = null
      this.ready = false
      this.startPromise = null
      this._kill(child)
      throw e
    }
    this.ready = true
    return child
  }

  async _search(query, limit, timeoutMs) {
    const text = await this._callTool('mcp_search', { query, limit }, timeoutMs)
    const rows = parseJsonReply(text, 'search')
    return Array.isArray(rows) ? rows : []
  }

  async _callTool(name, args = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const result = await this._request('tools/call', { name, arguments: args }, timeoutMs)
    const text = result?.content?.find((c) => c?.type === 'text')?.text ?? ''
    // tool failures come back as results with isError, not JSON-RPC errors —
    // the model side reads them; we turn them into exceptions for the console
    if (result?.isError) throw new Error(text || `mcp_${name} failed`)
    return text
  }

  async _request(method, params, timeoutMs = REQUEST_TIMEOUT_MS) {
    const child = await this._ensure()
    try {
      return await this._send(child, method, params, timeoutMs)
    } catch (e) {
      if (!e.retryable) throw e
      // the hub died mid-request — one retry on the lazily respawned child
      const fresh = await this._ensure()
      return this._send(fresh, method, params, timeoutMs)
    }
  }

  _send(child, method, params, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (this.child !== child || child.exitCode !== null || child.signalCode !== null) {
        const e = new Error('aipx hub is not running')
        e.retryable = true
        reject(e)
        return
      }
      const id = this.nextId++
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`aipx hub: ${method} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try {
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
      } catch (e) {
        this.pending.delete(id)
        clearTimeout(timer)
        e.retryable = true
        this._onDeath(child, `aipx hub stdin failed: ${e.message}`)
        reject(e)
      }
    })
  }

  _notify(child, method) {
    try {
      child.stdin?.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n')
    } catch {
      // nothing awaits a notification; the next request re-checks liveness
    }
  }

  _onData(chunk) {
    this.buffer += chunk
    let idx
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, idx).trim()
      this.buffer = this.buffer.slice(idx + 1)
      if (line === '') continue
      let msg
      try {
        msg = JSON.parse(line)
      } catch {
        this.log('aipx hub: non-JSON line dropped')
        continue
      }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject, timer } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        clearTimeout(timer)
        if (msg.error) reject(new Error(msg.error.message ?? JSON.stringify(msg.error)))
        else resolve(msg.result)
      }
    }
  }

  _onDeath(child, message) {
    if (this.child !== child) return // a restart already replaced this child
    this.child = null
    this.ready = false
    this.startPromise = null
    const e = new Error(message)
    e.retryable = true
    this._rejectPending(e)
  }

  /** Config changed under a live hub: drop the child; in-flight requests retry on the respawn. */
  _disposeChild() {
    const child = this.child
    if (!child) return
    this.child = null
    this.ready = false
    this.startPromise = null
    const e = new Error('aipx hub restarting with new config')
    e.retryable = true
    this._rejectPending(e)
    this._kill(child)
  }

  _kill(child) {
    try {
      child.stdin?.end()
    } catch {}
    child.kill()
  }

  _awaitExit(child) {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, 2000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      this._kill(child)
    })
  }

  _rejectPending(err) {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer)
      reject(err)
    }
    this.pending.clear()
  }
}
