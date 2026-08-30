import { spawn } from 'node:child_process'

const INIT_TIMEOUT = 30_000
const CALL_TIMEOUT = 120_000

/**
 * Client side of one downstream stdio MCP server.
 *
 * Speaks newline-delimited JSON-RPC (the MCP stdio transport): spawns the
 * server process lazily, performs the initialize handshake once, then serves
 * tools/list and tools/call. If the child exits, the next request respawns it
 * — downstream servers are allowed to be flaky; the hub isn't.
 */
export class StdioDownstream {
  constructor(name, def, log = () => {}) {
    this.name = name
    this.def = def
    this.log = log
    this.child = null
    this.buffer = ''
    this.pending = new Map()
    this.nextId = 1
    this.ready = false
    this.lastError = null
  }

  _spawn() {
    this.child = spawn(this.def.command, this.def.args ?? [], {
      env: { ...process.env, ...(this.def.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.child.stdout.setEncoding('utf8')
    this.child.stdout.on('data', (chunk) => this._onData(chunk))
    this.child.stderr.setEncoding('utf8')
    this.child.stderr.on('data', (chunk) => this.log(`[${this.name}] ${chunk.trim()}`))
    this.child.on('exit', (code) => {
      this.ready = false
      this.child = null
      const err = new Error(`downstream "${this.name}" exited (code ${code})`)
      for (const { reject } of this.pending.values()) reject(err)
      this.pending.clear()
    })
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
        this.log(`[${this.name}] non-JSON line dropped`)
        continue
      }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const entry = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        clearTimeout(entry.timer)
        if (msg.error) entry.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)))
        else entry.resolve(msg.result)
      }
    }
  }

  async request(method, params, timeoutMs = CALL_TIMEOUT) {
    if (!this.child || !this.ready) await this._initialize()
    const id = this.nextId++
    const msg = { jsonrpc: '2.0', id, method, ...(params !== undefined ? { params } : {}) }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`downstream "${this.name}": ${method} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.child.stdin.write(JSON.stringify(msg) + '\n')
    })
  }

  async _initialize() {
    this._spawn()
    const id = this.nextId++
    const initMsg = {
      jsonrpc: '2.0',
      id,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'aipx-mcp-hub', version: '0.3.0' },
      },
    }
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`downstream "${this.name}": initialize timed out`))
      }, INIT_TIMEOUT)
      this.pending.set(id, { resolve, reject, timer })
      this.child.stdin.write(JSON.stringify(initMsg) + '\n')
    })
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
    this.ready = true
  }

  async listTools() {
    const result = await this.request('tools/list')
    return Array.isArray(result?.tools) ? result.tools : []
  }

  async callTool(toolName, args) {
    return this.request('tools/call', { name: toolName, arguments: args ?? {} })
  }

  stop() {
    if (this.child) {
      this.child.removeAllListeners('exit')
      this.child.kill()
      this.child = null
    }
    this.ready = false
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer)
      reject(new Error(`downstream "${this.name}" stopped`))
    }
    this.pending.clear()
  }
}
