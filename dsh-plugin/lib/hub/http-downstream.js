/**
 * Client side of one downstream HTTP MCP server (streamable HTTP transport).
 *
 * def: { url, headers? } — JSON-RPC goes over HTTP POST; the session id from
 * the initialize response (Mcp-Session-Id) is captured and replayed. Servers
 * may answer with a single JSON body or an SSE stream; both are parsed.
 * Notifications POST and accept 202-with-empty-body.
 */

const INIT_TIMEOUT = 30_000
const CALL_TIMEOUT = 120_000

export class HttpDownstream {
  constructor(name, def, log = () => {}) {
    if (!def?.url) throw new Error(`HTTP downstream "${name}" needs a url`)
    this.name = name
    this.def = def
    this.log = log
    this.sessionId = null
    this.ready = false
    this.lastError = null
    this.nextId = 1
  }

  _headers() {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(this.def.headers ?? {}),
      ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
    }
  }

  async _post(message, { timeoutMs = CALL_TIMEOUT, expectBody = true } = {}) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res
    try {
      res = await fetch(this.def.url, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(message),
        signal: controller.signal,
      })
    } catch (e) {
      clearTimeout(timer)
      throw new Error(`downstream "${this.name}": ${e.message}`)
    }
    const sid = res.headers.get('mcp-session-id')
    if (sid && !this.sessionId) this.sessionId = sid
    if (!expectBody) {
      clearTimeout(timer)
      return null
    }
    if (!res.ok) {
      clearTimeout(timer)
      throw new Error(`downstream "${this.name}": HTTP ${res.status}`)
    }

    const ct = res.headers.get('content-type') ?? ''
    if (ct.includes('text/event-stream')) {
      const text = await res.text()
      let parsed = null
      for (const line of text.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue
        try {
          const m = JSON.parse(line.slice(5).trim())
          if (m.id === message.id) parsed = m
        } catch {}
      }
      if (parsed === null) throw new Error(`downstream "${this.name}": no response in SSE stream`)
      return parsed
    }

    const body = await res.text()
    if (body.trim() === '') return null
    return JSON.parse(body)
  }

  async ensureReady() {
    if (this.ready) return
    const id = this.nextId++
    const init = await this._post(
      {
        jsonrpc: '2.0',
        id,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'aipx-mcp-hub', version: '0.4.1' },
        },
      },
      { timeoutMs: INIT_TIMEOUT }
    )
    if (init?.error) throw new Error(init.error.message ?? 'initialize rejected')
    // initialized notification — servers answer 202 with no body
    await this._post({ jsonrpc: '2.0', method: 'notifications/initialized' }, { expectBody: false })
    this.ready = true
  }

  async request(method, params = undefined) {
    await this.ensureReady()
    const id = this.nextId++
    const res = await this._post(
      { jsonrpc: '2.0', id, method, ...(params !== undefined ? { params } : {}) },
      { timeoutMs: CALL_TIMEOUT }
    )
    if (res?.error) throw new Error(res.error.message ?? 'downstream error')
    return res?.result ?? {}
  }

  async listTools() {
    const result = await this.request('tools/list')
    return Array.isArray(result?.tools) ? result.tools : []
  }

  async callTool(toolName, args) {
    return this.request('tools/call', { name: toolName, arguments: args ?? {} })
  }

  stop() {
    this.ready = false
  }
}
