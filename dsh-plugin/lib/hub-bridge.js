import { readFileSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHub } from './hub/index.js'
import { buildSearchIndex } from './hub/search.js'
import { parseInstallSource, resolveMcpPayload, deriveName } from './hub/install-source.js'

/**
 * Host-side bridge between the dsh web GUI and the aipx MCP hub.
 *
 * The hub runs IN-PROCESS (createHub from ./hub/) so the dsh bundle needs no
 * `aipx mcp serve` child and no `aipx`/npx dependency. Two channels:
 * - live queries (status / tool catalog / search) call the in-process hub
 *   directly — the same createHub the `aipx mcp serve` CLI builds, so the
 *   console shows the same view an agent client would;
 * - configuration (get / add / remove) reads and writes `mcp-hub.json`
 *   directly (atomic rename), because the running hub holds no config API —
 *   a change disposes the in-process hub and the next request rebuilds it
 *   from the fresh file (stopping spawned downstream processes first).
 *
 * Zero dependencies.
 */

const DEFAULT_TOOLS_LIMIT = 100
const SEARCH_DEFAULT_LIMIT = 8

// ---------------------------------------------------------------------------
// Plugin feature config (~/.config/aipx/ai-plugin-toolkit.json, or beside a
// custom mcp-hub.json). Features default ON; a missing/corrupt file reads as
// defaults — the plugin must never fail to load because of its own settings.
// ---------------------------------------------------------------------------

const DEFAULT_SYSTEM_PROMPT =
  '你是提示词优化助手。把用户的原始输入改写成清晰、具体、结构化的高质量提示词：明确目标与预期产出物，补全必要上下文与约束（不确定处以「假设：…」标注），按 目标/背景/要求/产出格式 分节。只输出改写后的提示词，不要执行它。'

const DEFAULT_PLUGIN_CONFIG = {
  features: {
    mcpConsole: { enabled: true, fullscreen: true },
    promptOptimize: { enabled: true },
  },
  promptOptimize: {
    showLabel: false,
    model: 'follow',
    contextMode: 'input',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    templates: [],
  },
}

/** The plugin feature config file, next to the mcp-hub.json being managed. */
function pluginConfigPathFor(configPath) {
  return path.join(path.dirname(configPath), 'ai-plugin-toolkit.json')
}

/**
 * Same resolution order as the aipx CLI itself (src/util.js configDir), for
 * the default mcp-hub.json — and therefore for the plugin config beside it.
 */
function defaultConfigPath() {
  const base =
    process.env.AIPX_CONFIG_DIR ??
    path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'aipx')
  return path.join(base, 'mcp-hub.json')
}

/**
 * Accept any parsed JSON (a stored file, a client PATCH) and return a complete,
 * type-checked plugin config. Unknown keys are dropped, wrong-typed fields fall
 * back to defaults. `templates` is replaced wholesale; at most one template is
 * active (first one wins, later marked inactive).
 */
export function normalizePluginConfig(raw) {
  const out = JSON.parse(JSON.stringify(DEFAULT_PLUGIN_CONFIG))
  if (raw === null || typeof raw !== 'object') return out
  const features = raw.features
  if (features !== null && typeof features === 'object') {
    for (const id of ['mcpConsole', 'promptOptimize']) {
      const f = features[id]
      if (f !== null && typeof f === 'object' && typeof f.enabled === 'boolean') {
        out.features[id].enabled = f.enabled
      }
    }
    if (features.mcpConsole !== null && typeof features.mcpConsole === 'object'
        && typeof features.mcpConsole.fullscreen === 'boolean') {
      out.features.mcpConsole.fullscreen = features.mcpConsole.fullscreen
    }
  }
  const po = raw.promptOptimize
  if (po !== null && typeof po === 'object') {
    if (typeof po.showLabel === 'boolean') out.promptOptimize.showLabel = po.showLabel
    if (typeof po.model === 'string' && po.model.trim() !== '' && po.model.length <= 128) {
      out.promptOptimize.model = po.model.trim()
    }
    if (po.contextMode === 'input' || po.contextMode === 'session') out.promptOptimize.contextMode = po.contextMode
    if (typeof po.systemPrompt === 'string' && po.systemPrompt.length <= 8000) out.promptOptimize.systemPrompt = po.systemPrompt
    if (Array.isArray(po.templates)) {
      const templates = []
      for (const t of po.templates) {
        if (t === null || typeof t !== 'object') continue
        if (typeof t.id !== 'string' || t.id === '' || t.id.length > 64) continue
        if (typeof t.name !== 'string' || t.name === '' || t.name.length > 64) continue
        if (typeof t.content !== 'string' || t.content.length === 0 || t.content.length > 8000) continue
        templates.push({ id: t.id, name: t.name, content: t.content, active: t.active === true })
      }
      if (templates.length > 0) {
        let seen = false
        for (const t of templates) {
          if (t.active) {
            t.active = !seen
            seen = true
          }
        }
        out.promptOptimize.templates = templates
      }
    }
  }
  return out
}

/**
 * Merge a PATCH onto the current config: PATCHes may carry `features` and/or
 * `promptOptimize`, each partial. Lists (templates) are replaced wholesale
 * when present; everything else is overlaid field-by-field so a small patch
 * never resets unrelated settings.
 */
function mergePluginPatch(current, patch) {
  const out = JSON.parse(JSON.stringify(current ?? DEFAULT_PLUGIN_CONFIG))
  if (patch === null || typeof patch !== 'object') return out
  if (patch.features !== null && typeof patch.features === 'object') {
    for (const id of ['mcpConsole', 'promptOptimize']) {
      const f = patch.features[id]
      if (f !== null && typeof f === 'object') out.features[id] = { ...out.features[id], ...f }
    }
  }
  if (patch.promptOptimize !== null && typeof patch.promptOptimize === 'object') {
    const p = patch.promptOptimize
    out.promptOptimize = {
      ...out.promptOptimize,
      ...p,
      templates: Array.isArray(p.templates) ? p.templates : out.promptOptimize.templates,
    }
  }
  return out
}

/** The effective rewrite prompt: active template > saved systemPrompt > built-in default. */
function effectivePrompt(po) {
  const active = Array.isArray(po?.templates) ? po.templates.find((t) => t?.active === true) : undefined
  if (active && typeof active.content === 'string' && active.content !== '') return active.content
  if (typeof po?.systemPrompt === 'string' && po.systemPrompt !== '') return po.systemPrompt
  return DEFAULT_SYSTEM_PROMPT
}

/** Flatten one dsh-llm Message to plain text (content may be a part array). */
export function messageText(message) {
  const content = message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => (typeof part === 'string' ? part : part?.type === 'text' && typeof part?.text === 'string' ? part.text : ''))
    .filter((text) => text !== '')
    .join('\n')
    .trim()
}

/**
 * Build the chat messages for one optimize call. Pure (no I/O) so the rules are
 * testable; `history` is [{role: 'user'|'assistant', content: text}] from the
 * current session (already capped/truncated by the caller), and a prompt that
 * contains `{{input}}` gets the draft substituted in place of a user message.
 */
export function buildOptimizeMessages(config, text, history) {
  const po = config?.promptOptimize ?? DEFAULT_PLUGIN_CONFIG.promptOptimize
  const prompt = effectivePrompt(po)
  const messages = [{ role: 'system', content: prompt }]
  for (const turn of Array.isArray(history) ? history.slice(-6) : []) {
    if (turn === null || typeof turn !== 'object') continue
    const role = turn.role === 'assistant' ? 'assistant' : 'user'
    const content = String(turn.content ?? '')
    if (content === '') continue
    messages.push({ role, content: content.length > 2000 ? `${content.slice(0, 2000)}…` : content })
  }
  const input = String(text ?? '')
  if (prompt.includes('{{input}}')) {
    messages[0] = { role: 'system', content: prompt.split('{{input}}').join(input) }
  } else {
    messages.push({ role: 'user', content: input })
  }
  return messages
}

/**
 * The full-catalog query behind tools(). The hub's lexical index answers an
 * empty query with nothing (it tokenizes to zero terms), so "list all tools"
 * is spelled as a bag of the most common English letters: any real tool
 * description matches enough of them to score positive, and the caller's
 * limit caps the result.
 */

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

export class HubBridge {
  /**
   * @param {string} [configPath] - the mcp-hub.json to manage; defaults to the
   *   aipx CLI's resolution (AIPX_CONFIG_DIR || $XDG_CONFIG_HOME/aipx || ~/.config/aipx).
   * @param {(msg: string) => void} [log] - hub stderr and lifecycle diagnostics.
   * @param {(sessionId: string) => Promise<Array<{role, content}>|null>} [loadSessionContext]
   *   - optional resolver for the current session's recent turns (contextMode
   *   "session"); a null/throw answer degrades the call to input-only mode.
   */
  constructor({ configPath, log, loadSessionContext, getModelCatalog } = {}) {
    this.configPath = configPath ?? defaultConfigPath()
    this.pluginConfigPath = pluginConfigPathFor(this.configPath)
    this.log = log ?? (() => {})
    this.loadSessionContext = typeof loadSessionContext === 'function' ? loadSessionContext : null
    this.getModelCatalog = typeof getModelCatalog === 'function' ? getModelCatalog : null
    this.catalogCache = null
    // in-process hub: the createHub instance, its single-flight build promise,
    // and the generation counter that lets tests/watchdog see a rebuild
    this.hub = null
    this.hubPromise = null
    this.hubGen = 0
  }

  /**
   * Host-side model catalog — the same provider/model view the composer's
   * model selector shows (ctx.llm), so the settings dropdown can mirror it
   * even though the client-side `remote` face is not granted to external
   * plugins. Cached 5 min: listModels may hit the provider API.
   */
  async modelCatalog() {
    if (this.getModelCatalog === null) return { groups: [] }
    if (this.catalogCache !== null && Date.now() - this.catalogCache.at < 5 * 60_000) return this.catalogCache.value
    const value = await this.getModelCatalog()
    this.catalogCache = { at: Date.now(), value }
    return value
  }

  /**
   * Live hub status: { running: true, pid, servers: [{name, ready, lastError,
   * tools}] } — hub.status() rows wrapped with the host process's pid (the
   * console shows "pid NNN"; the dot is driven by `running`).
   */
  async status() {
    const hub = await this._ensureHub()
    // hub.status() returns rows [{name, ready, lastError, tools}] — map to the
    // name-keyed shape the console renders (client.js consumes running/pid)
    const servers = {}
    for (const entry of hub.status() ?? []) {
      if (typeof entry !== 'object' || entry === null || typeof entry.name !== 'string') continue
      servers[entry.name] = entry.ready === true
        ? { status: 'ok', tools: typeof entry.tools === 'number' ? entry.tools : 0 }
        : { status: 'error', error: String(entry.lastError ?? 'unknown error') }
    }
    const engine = hub.searchEngine()
    // pid is the host process: the console shows "pid NNN" and the dot is
    // driven by `running` — both stay valid with an in-process hub
    return { running: true, pid: process.pid, servers, engine }
  }

  /**
   * The full downstream tool catalog: [{id, server, name, description,
   * inputSchema}]. hub.status() carries per-server counts only (no catalog),
   * so this is hub.ensureCatalog() — the same `aipx/catalog` surface the
   * console exposes, without the model-visible search ranking.
   */
  async tools(limit = DEFAULT_TOOLS_LIMIT) {
    const hub = await this._ensureHub()
    const catalog = await hub.ensureCatalog()
    this.searchEngine = hub.searchEngine()
    return { tools: catalog.slice(0, positiveInt(limit, DEFAULT_TOOLS_LIMIT)), engine: this.searchEngine }
  }

  /** mcp_search passthrough — ranked rows + the engine that served them. */
  async search(query, limit = SEARCH_DEFAULT_LIMIT) {
    const hub = await this._ensureHub()
    const results = { results: await hub.search(String(query ?? ''), positiveInt(Math.floor(Number(limit)), SEARCH_DEFAULT_LIMIT)) }
    if (this.searchEngine) results.engine = this.searchEngine
    return results
  }

  /** Execute one downstream tool by its "<server>/<tool>" id (mcp_call). */
  async call(tool, args) {
    if (typeof tool !== 'string' || tool === '') throw invalid('tool must be a non-empty "<server>/<tool>" id')
    const hub = await this._ensureHub()
    return hub.call(tool, args)
  }

  /** Re-scan the registered servers and rebuild the catalog/index (mcp_refresh). */
  async refresh() {
    const hub = await this._ensureHub()
    return hub.refresh()
  }

  /**
   * Install MCP servers from a free-text source (mcp_install). Accepts a bare
   * command, a JSON def / {mcpServers:{...}} map, a GitHub link, or an npm
   * package; resolves each into mcp-hub.json via normalizeServerDef, then drops
   * the in-process hub so the next request rebuilds from the fresh file (a
   * targeted refreshServer would need the new server to be in the hub first).
   * Returns { installed, skipped } for the caller (model or console) to echo.
   */
  async installSource(raw) {
    const log = (m) => this.log(`install: ${m}`)
    const desc = parseInstallSource(raw) // throws invalid(400) on unparseable
    let entries
    if (desc.kind === 'json') {
      entries = desc.entries
    } else if (desc.kind === 'github' || desc.kind === 'local') {
      entries = await resolveMcpPayload(desc, { log })
    } else if (desc.kind === 'npm') {
      entries = [{ name: deriveName(desc), def: { command: 'npx', args: ['-y', desc.pkg], env: {} } }]
    } else if (desc.kind === 'url') {
      entries = [{ name: deriveName(desc), def: { url: desc.url } }]
    } else {
      entries = [{ name: deriveName(desc), def: { command: desc.command, args: desc.args ?? [], env: {} } }]
    }

    const config = await this.getConfig()
    const installed = []
    const overwritten = []
    const skipped = []
    for (const { name, def } of entries) {
      if (name.includes('/') || name === '') {
        skipped.push({ name: name || '(无名)', reason: '名字含 "/" 或为空' })
        continue
      }
      try {
        const was = Object.prototype.hasOwnProperty.call(config.servers, name)
        config.servers[name] = normalizeServerDef(def)
        installed.push(name)
        if (was) overwritten.push(name)
      } catch (e) {
        skipped.push({ name, reason: String(e?.message ?? e) })
      }
    }
    if (installed.length === 0) {
      throw invalid('未能添加任何服务器：' + skipped.map((s) => s.reason).join('；'))
    }
    await this._saveConfig(config)
    await this._disposeHub()
    return { installed, skipped, overwritten }
  }

  /**
   * Prompt optimization: rewrite the composer draft into a structured
   * high-quality prompt via the DeepSeek API. The key resolution mirrors the
   * hub's own credential store (env first, then ~/.dsh/.credentials.yaml).
   *
   * Rules come from the plugin config (model, effective prompt, contextMode);
   * when contextMode is "session" and a sessionId is given, the injected
   * loadSessionContext supplies the recent turns — a null answer degrades to
   * input-only (contextUsed: false).
   */
  async optimize(text, sessionId, model) {
    const config = await this.getPluginConfig()
    if (config.features.promptOptimize.enabled !== true) {
      throw Object.assign(new Error('优化提示词功能已在插件设置中关闭'), { status: 403 })
    }
    const key = this._deepseekKey()
    if (!key) {
      throw Object.assign(new Error('未找到 DeepSeek API key——在 ~/.dsh/.credentials.yaml 配置后重试'), { status: 400 })
    }
    let history = null
    if (config.promptOptimize.contextMode === 'session' && typeof sessionId === 'string' && sessionId !== '' && this.loadSessionContext !== null) {
      try {
        history = await this.loadSessionContext(sessionId)
      } catch (e) {
        this.log(`session context read failed, optimizing input-only: ${String(e?.message ?? e)}`)
        history = null
      }
    }
    const messages = buildOptimizeMessages(config, text, history)
    // 按请求覆盖：客户端在 model 为 "follow" 时把输入框当前选中的模型（精确
    // id）随请求带来。配置值 "follow" 本身不是可调用模型——无覆盖时回退部署
    // 默认模型（目录 default），最后才是 deepseek-chat。覆盖模型只试一次，
    // 失败自动回退并在响应里回传实际使用的模型。
    const override = typeof model === 'string' ? model.trim().slice(0, 128) : ''
    let fallback = 'deepseek-chat'
    try {
      const catalog = await this.modelCatalog()
      const fromDefault = catalog?.default?.model
      if (typeof fromDefault === 'string' && fromDefault !== '') fallback = fromDefault
    } catch {}
    const primary = /^[\w.:-]+$/.test(override)
      ? override
      : config.promptOptimize.model === 'follow' ? fallback : config.promptOptimize.model
    const callCompletion = (modelName) => fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: modelName,
        messages,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(60_000),
    })
    let useModel = primary
    let r = await callCompletion(useModel)
    if (!r.ok && useModel !== fallback) {
      this.log(`optimize model "%s" rejected (%s), retrying with fallback "%s"`, useModel, r.status, fallback)
      useModel = fallback
      r = await callCompletion(useModel)
    }
    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      throw Object.assign(new Error(`DeepSeek API ${r.status}: ${detail.slice(0, 200)}`), { status: 502 })
    }
    const data = await r.json()
    const out = data?.choices?.[0]?.message?.content
    if (typeof out !== 'string' || out.length === 0) throw new Error('DeepSeek 返回了空内容')
    return { text: out.trim(), contextUsed: history !== null, model: useModel }
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
   * The plugin feature config (ai-plugin-toolkit.json, beside mcp-hub.json):
   * always a complete, validated object — a missing or corrupt file reads as
   * defaults and is left untouched on disk.
   */
  async getPluginConfig() {
    let raw
    try {
      raw = await readFile(this.pluginConfigPath, 'utf8')
    } catch {
      return normalizePluginConfig(null)
    }
    try {
      return normalizePluginConfig(JSON.parse(raw))
    } catch {
      return normalizePluginConfig(null)
    }
  }

  /**
   * Merge a client PATCH into the plugin config, validate, persist (atomic
   * rename — same policy as mcp-hub.json), and return the stored result.
   */
  async setPluginConfig(patch) {
    if (patch !== null && typeof patch === 'object' && (patch.features !== null && typeof patch.features === 'object')) {
      const { mcpConsole, promptOptimize } = patch.features
      if ((mcpConsole !== null && typeof mcpConsole === 'object' && mcpConsole.enabled !== undefined && typeof mcpConsole.enabled !== 'boolean') ||
          (promptOptimize !== null && typeof promptOptimize === 'object' && promptOptimize.enabled !== undefined && typeof promptOptimize.enabled !== 'boolean')) {
        throw invalid('feature enabled must be a boolean')
      }
    }
    const current = await this.getPluginConfig()
    const merged = normalizePluginConfig(mergePluginPatch(current, patch))
    await this._savePluginConfig(merged)
    return merged
  }

  /** Atomic JSON write (tmp + rename) — the same pattern _saveConfig uses. */
  async _savePluginConfig(config) {
    await mkdir(path.dirname(this.pluginConfigPath), { recursive: true })
    const tmp = `${this.pluginConfigPath}.${process.pid}.tmp`
    await writeFile(tmp, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
    await rename(tmp, this.pluginConfigPath)
  }
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
    await this._disposeHub()
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
    await this._disposeHub()
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
    await this._disposeHub()
    return { ok: true, search: result }
  }

  /** Dispose the in-process hub and forget all state. Idempotent; safe mid-request. */
  async stop() {
    await this._disposeHub()
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
  // in-process hub: build, rebuild, dispose
  // -------------------------------------------------------------------------

  /** Read the config and build (or rebuild) the in-process hub on demand. */
  async _ensureHub() {
    if (this.hub) return this.hub
    if (!this.hubPromise) {
      this.hubPromise = this._buildHub().catch((e) => {
        this.hubPromise = null
        throw e
      })
    }
    return this.hubPromise
  }

  async _buildHub() {
    const config = await this.getConfig()
    this.log(`in-process hub: ${Object.keys(config.servers ?? {}).length} server(s) registered`)
    // searchIndex mirrors `aipx mcp serve --sidecar`: an optional enhancer must
    // never turn into a hard failure — buildSearchIndex wraps it with lexical
    // fallback, and undefined means pure lexical.
    const searchIndex = buildSearchIndex(config.search?.sidecar, this.log)
    const hub = createHub({
      servers: config.servers ?? {},
      log: this.log,
      searchIndex,
      disabledTools: sanitizeDisabledTools(config.disabledTools),
    })
    // refresh before serving so callers never race an empty index; like
    // serveStdio, a bad configuration degrades per-server, not globally
    for (const row of await hub.refresh()) {
      if (row.status !== 'ok') this.log(`in-process hub: ${row.name} — ${row.status}`)
    }
    this.log(`in-process hub: search engine ${hub.searchEngine()}`)
    this.hub = hub
    this.hubGen += 1
    this.hubPromise = null
    return this.hub
  }

  /**
   * Config changed under a live hub (or stop()): dispose the in-process hub so
   * the next request rebuilds from the fresh file. Stops spawned downstream
   * processes first so nothing leaks. Idempotent.
   */
  async _disposeHub() {
    const hub = this.hub
    this.hub = null
    this.hubPromise = null
    try {
      await hub?.stop?.()
    } catch (e) {
      this.log(`in-process hub stop failed: ${String(e?.message ?? e)}`)
    }
  }
}
