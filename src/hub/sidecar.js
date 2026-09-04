import { spawn } from 'node:child_process'

/**
 * Vector-search sidecar client (hub side).
 *
 * Speaks the draft protocol from docs/mcp-hub-vector-search.md: a child
 * process speaking newline-delimited JSON with two request ops —
 *   {"op":"build","entries":[{"id","text"},…]}   → {"id","result":{"ok":true}}
 *   {"op":"search","query","limit"}              → {"id","result":[{id,score},…]}
 *
 * The sidecar owns embeddings and the index (e.g. a Python zvec build). The
 * hub only ever sends text and receives ranked ids.
 */
export class SidecarIndex {
  constructor({ command, args = [], buildTimeoutMs = 180_000, searchTimeoutMs = 3_000, log = () => {} } = {}) {
    this.command = command
    this.args = args
    this.buildTimeoutMs = buildTimeoutMs
    this.searchTimeoutMs = searchTimeoutMs
    this.log = log
    this.child = null
    this.buffer = ''
    this.pending = new Map()
    this.nextId = 1
  }

  _spawn() {
    if (this.child) return
    this.child = spawn(this.command, this.args, {
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.child.stdout.setEncoding('utf8')
    this.child.stdout.on('data', (chunk) => this._onData(chunk))
    this.child.stderr.setEncoding('utf8')
    this.child.stderr.on('data', (chunk) => this.log(`[sidecar] ${chunk.trim()}`))
    this.child.on('exit', () => {
      this.child = null
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer)
        reject(new Error('sidecar exited before responding'))
      }
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
        continue
      }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const entry = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        clearTimeout(entry.timer)
        entry.resolve(msg.result ?? {})
      }
    }
  }

  _request(payload, timeoutMs) {
    this._spawn()
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`sidecar ${payload.op} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.child.stdin.write(JSON.stringify({ ...payload, id }) + '\n')
    })
  }

  async build(entries) {
    this._spawn()
    const result = await this._request(
      { op: 'build', entries: entries.map((e) => ({ id: e.id, text: e.text })) },
      this.buildTimeoutMs
    )
    return result
  }

  async search(query, limit = 8) {
    const result = await this._request(
      { op: 'search', query, limit },
      this.searchTimeoutMs
    )
    return Array.isArray(result?.results) ? result.results : []
  }

  stop() {
    if (this.child) {
      this.child.removeAllListeners('exit')
      this.child.kill()
      this.child = null
    }
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer)
      reject(new Error('sidecar stopped'))
    }
    this.pending.clear()
  }
}
