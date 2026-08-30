import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHub } from '../src/hub/index.js'
import { LexicalIndex } from '../src/hub/lexical.js'
import { StdioDownstream } from '../src/hub/downstream.js'
import { createMessageHandler, META_TOOLS } from '../src/hub/server.js'

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'mini-mcp.mjs'
)

// ---- search scoring (shipped lexical index) ----

test('LexicalIndex ranks matching entries and drops unrelated', async () => {
  const idx = new LexicalIndex()
  await idx.build([
    { id: 'redis/get', text: 'redis get Get a key from Redis' },
    { id: 'browser/screenshot', text: 'browser screenshot Take a screenshot of a webpage' },
    { id: 'db/list_tables', text: 'db list_tables List database tables' },
  ])
  const redis = await idx.search('redis', 5)
  assert.equal(redis[0].id, 'redis/get')

  const shot = await idx.search('screenshot webpage', 5)
  assert.equal(shot[0].id, 'browser/screenshot')

  assert.deepEqual(await idx.search('cooking recipe', 5), [])
})


// ---- hub end-to-end against a real child fixture ----

function makeHub() {
  const servers = {
    mini: { command: process.execPath, args: [FIXTURE] },
  }
  return createHub({ servers })
}

test('hub refresh discovers downstream tools; search finds and returns schema', async () => {
  const hub = makeHub()
  try {
    const rows = await hub.refresh()
    assert.equal(rows[0].status, 'ok')
    assert.equal(rows[0].tools, 1)

    const results = await hub.search('echo text', 5)
    assert.equal(results.length, 1)
    assert.equal(results[0].id, 'mini/echo')
    assert.equal(results[0].inputSchema.type, 'object')

    assert.deepEqual(await hub.search('unrelated gibberish', 5), [])
  } finally {
    await hub.stop()
  }
})

test('hub call routes to the downstream tool and returns its content', async () => {
  const hub = makeHub()
  try {
    await hub.refresh()
    const r = await hub.call('mini/echo', { text: 'hello' })
    assert.equal(r.content[0].text, 'echo:hello')
    await assert.rejects(() => hub.call('mini/nope', {}), /unknown tool|not found/i)
    await assert.rejects(() => hub.call('ghost/tool', {}), /unknown tool "ghost\/tool"/)
  } finally {
    await hub.stop()
  }
})

// ---- stdio message handler ----

test('message handler: initialize, tools/list, status, search, unknown', async () => {
  const hub = makeHub()
  await hub.refresh()
  const handle = createMessageHandler(hub)

  const init = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
  assert.equal(init.result.serverInfo.name, 'aipx-mcp-hub')
  assert.equal(init.result.protocolVersion, '2024-11-05')

  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null)

  const tools = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
  assert.equal(tools.result.tools.length, META_TOOLS.length)
  assert.deepEqual(
    tools.result.tools.map((t) => t.name),
    META_TOOLS.map((t) => t.name)
  )

  const status = await handle({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'mcp_status', arguments: {} },
  })
  assert.ok(status.result.content[0].text.includes('"mini"'))

  const nf = await handle({ jsonrpc: '2.0', id: 4, method: 'no/such/method' })
  assert.equal(nf.error.code, -32601)

  await hub.stop()
})

test('message handler: mcp_call surfaces downstream failures as isError results', async () => {
  const hub = makeHub()
  const handle = createMessageHandler(hub)

  const bad = await handle({
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: { name: 'mcp_call', arguments: {} },
  })
  assert.equal(bad.result.isError, true)
  assert.match(bad.result.content[0].text, /missing required argument: tool/)

  await hub.stop()
})
