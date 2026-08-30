// Mock vector-search sidecar fixture: speaks the hub's sidecar protocol
// (newline-delimited JSON, ops: build / search).
//   MOCK_SIDECAR_MODE=ranked  (default) search "fast" → perf/benchmark
//   MOCK_SIDECAR_MODE=sleep   build ok, then delays every search 5s
import { createInterface } from 'node:readline'

const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n')
const mode = process.env.MOCK_SIDECAR_MODE ?? 'ranked'

const send_ = (id, result) => send({ id, result })
const rl = createInterface({ input: process.stdin })
rl.on('line', (line) => {
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  const { op, id } = msg
  if (op === 'build') {
    send_(id, { ok: true })
  } else if (op === 'search') {
    if (mode === 'sleep') {
      setTimeout(() => send_(id, { results: [] }), 5000)
    } else if (String(msg.query ?? '').includes('fast')) {
      send_(id, { results: [{ id: 'perf/benchmark', score: 0.99 }] })
    } else {
      send_(id, { results: [] })
    }
  } else if (id !== undefined) {
    send({ id, error: { message: `unknown op: ${op}` } })
  }
})
