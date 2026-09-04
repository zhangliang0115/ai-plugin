import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const sidecar = path.join(here, '..', 'sidecars', 'zvec_sidecar.py')
const hasZvec = spawnSync('python3', ['-c', 'import zvec'])

/**
 * Real-engine integration: exercises the shipped reference sidecar with the
 * actual zvec package. Skipped where zvec is not installed (CI) — the mock
 * sidecar suite (hub-sidecar.test.js) covers the protocol everywhere else.
 */
const zvecTest = hasZvec.status === 0 ? test : test.skip

zvecTest('zvec sidecar: build, rank, id round-trip, rebuild swap', async () => {
  const { SidecarIndex } = await import('../src/hub/sidecar.js')
  const index = new SidecarIndex({ command: 'python3', args: [sidecar], buildTimeoutMs: 30_000 })
  try {
    const entries = [
      { id: 'fs/read_file', text: 'filesystem read_file Read the complete contents of a file' },
      { id: 'mem/create_entities', text: 'memory create_entities Create multiple new entities in the knowledge graph' },
      { id: 'think/sequential_thinking', text: 'sequential thinking 在动态对话中进行逐步推理和问题分解' },
    ]
    const built = await index.build(entries)
    assert.equal(built.ok, true)
    assert.equal(built.entries, 3)
    assert.match(built.engine, /^zvec(-hybrid)?$/)

    const english = await index.search('read a file from disk', 2)
    assert.equal(english[0]?.id, 'fs/read_file')

    const chinese = await index.search('推理 分解', 2)
    assert.equal(chinese[0]?.id, 'think/sequential_thinking')

    const rebuilt = await index.build([
      { id: 'web/fetch', text: 'web fetch Fetch a URL and return its contents' },
    ])
    assert.equal(rebuilt.entries, 1)
    const stale = await index.search('read file', 3)
    assert.equal(stale.find((r) => r.id === 'fs/read_file'), undefined)
    const fresh = await index.search('fetch url', 3)
    assert.equal(fresh[0]?.id, 'web/fetch')
  } finally {
    index.stop()
  }
})
