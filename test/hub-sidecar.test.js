import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHub } from '../src/hub/index.js'
import { LexicalIndex, withLexicalFallback } from '../src/hub/lexical.js'
import { SidecarIndex } from '../src/hub/sidecar.js'
import { StdioDownstream } from '../src/hub/downstream.js'

const MOCK_SIDECAR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'mock-sidecar.mjs'
)

test('SidecarIndex speaks the sidecar protocol (build + search)', async () => {
  const idx = new SidecarIndex({
    command: process.execPath,
    args: [MOCK_SIDECAR],
    log: () => {},
  })
  await idx.build([{ id: 'perf/benchmark', text: 'perf benchmark make it fast' }])
  const r = await idx.search('make it fast', 5)
  assert.deepEqual(r, [{ id: 'perf/benchmark', score: 0.99 }])
  idx.stop()
})

test('hub uses a healthy sidecar index — semantic ids the lexical scorer cannot know', async () => {
  const servers = {
    perf: {
      command: process.execPath,
      args: [
        '-e',
        `import { createInterface } from 'node:readline';
const send = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
const rl = createInterface({ input: process.stdin });
rl.on('line', (l) => {
  let m; try { m = JSON.parse(l) } catch { return }
  if (m.method === 'initialize') send({ id: m.id, result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'perf', version: '1' } } });
  else if (m.method === 'notifications/initialized') {}
  else if (m.method === 'tools/list') send({ id: m.id, result: { tools: [{ name: 'benchmark', description: 'Benchmark the app to make it fast', inputSchema: { type: 'object' } }] } });
  else if (m.method === 'tools/call') send({ id: m.id, result: { content: [{ type: 'text', text: 'bench done' }] } });
});`,
      ],
    },
  }
  const sidecar = new SidecarIndex({
    command: process.execPath,
    args: [MOCK_SIDECAR],
    log: () => {},
  })
  const index = withLexicalFallback(
    () => sidecar,
    () => new LexicalIndex(),
    () => {}
  )
  const hub = createHub({ servers, searchIndex: index })
  try {
    await hub.refresh()
    // "make it fast" has no lexical overlap with "perf benchmark…" — only the
    // sidecar's semantic ranking can surface it
    const results = await hub.search('make it fast', 5)
    assert.equal(results[0].id, 'perf/benchmark')

    const r = await hub.call('perf/benchmark', {})
    assert.equal(r.content[0].text, 'bench done')
  } finally {
    await hub.stop()
    sidecar.stop()
  }
})

test('broken sidecar falls back to lexical scoring — search keeps working', async () => {
  const servers = {
    alpha: {
      command: process.execPath,
      args: [
        '-e',
        `import { createInterface } from 'node:readline';
const send = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
const rl = createInterface({ input: process.stdin });
rl.on('line', (l) => {
  let m; try { m = JSON.parse(l) } catch { return }
  if (m.method === 'initialize') send({ id: m.id, result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'alpha', version: '1' } } });
  else if (m.method === 'notifications/initialized') {}
  else if (m.method === 'tools/list') send({ id: m.id, result: { tools: [{ name: 'alpha-tool', description: 'alpha does alpha things', inputSchema: { type: 'object' } }] } });
  else if (m.method === 'tools/call') send({ id: m.id, result: { content: [{ type: 'text', text: 'ok' }] } });
});`,
      ],
    },
  }
  // sidecar binary does not exist → build fails once → permanent lexical fallback
  const sidecar = new SidecarIndex({
    command: process.execPath,
    args: ['--eval', 'process.exit(1)'], // exits immediately every time
    log: () => {},
  })
  const index = withLexicalFallback(
    () => sidecar,
    () => new LexicalIndex(),
    () => {}
  )
  const hub = createHub({ servers, searchIndex: index })
  try {
    await hub.refresh()
    const results = await hub.search('alpha', 5)
    assert.equal(results[0].id, 'alpha/alpha-tool')
  } finally {
    await hub.stop()
    sidecar.stop()
  }
})
