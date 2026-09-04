import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * Real-engine integration: HubBridge drives an actual `aipx mcp serve` child
 * (AIPX_BIN → the repo CLI) whose hub spawns fixtures/mini-mcp.mjs, and reads
 * and writes a real mcp-hub.json in a temp AIPX_CONFIG_DIR. Exercises the
 * full chain — spawn, JSON-RPC handshake, status/tools/search, config
 * add/remove with child restart — not a mock in sight.
 */
const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(here, '..')
const AIPX_BIN = path.join(repoRoot, 'bin', 'aipx.js')
const MINI_MCP = path.join(repoRoot, 'fixtures', 'mini-mcp.mjs')

async function withHubEnv(run) {
  const prevConfigDir = process.env.AIPX_CONFIG_DIR
  const prevBin = process.env.AIPX_BIN
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aipx-hubbridge-'))
  process.env.AIPX_CONFIG_DIR = dir
  process.env.AIPX_BIN = AIPX_BIN
  const configPath = path.join(dir, 'mcp-hub.json')
  await writeFile(
    configPath,
    JSON.stringify({ servers: { mini: { command: process.execPath, args: [MINI_MCP] } } }, null, 2) + '\n'
  )
  try {
    return await run({ dir, configPath })
  } finally {
    process.env.AIPX_CONFIG_DIR = prevConfigDir
    process.env.AIPX_BIN = prevBin
  }
}

test('hub bridge: status, tools, search, config add/remove against a real aipx mcp serve', async () => {
  await withHubEnv(async ({ dir, configPath }) => {
    const { HubBridge } = await import('../dsh-plugin/lib/hub-bridge.js')
    const logs = []
    const bridge = new HubBridge({ configPath, log: (m) => logs.push(m) })
    try {
      const st = await bridge.status()
      assert.equal(st.running, true)
      assert.equal(typeof st.pid, 'number')
      // status is a name-keyed map: {status:'ok', tools} per server
      const mini = st.servers.mini
      assert.ok(mini, `status should list the mini server: ${JSON.stringify(st.servers)}`)
      assert.equal(mini.status, 'ok')
      assert.equal(mini.tools, 1)

      // the full catalog: mcp_status carries counts only, so tools() must
      // surface mini/echo through the search path (inputSchema included)
      const tools = (await bridge.tools()).tools
      const echo = tools.find((t) => t.id === 'mini/echo')
      assert.ok(echo, `catalog should contain mini/echo: ${JSON.stringify(tools)}`)
      assert.equal(echo.server, 'mini')
      assert.equal(echo.name, 'echo')
      assert.equal(echo.inputSchema.type, 'object')
      assert.ok(echo.inputSchema.properties.text)

      const hits = (await bridge.search('echo text', 5)).results
      assert.equal(hits[0]?.id, 'mini/echo')
      assert.ok(hits[0]?.inputSchema)

      // add: file updated atomically, hub restarted on the fresh config
      const cfg = await bridge.setServer('add', 'mini2', { command: process.execPath, args: [MINI_MCP] })
      assert.equal(cfg.servers.mini2.command, process.execPath)
      const raw = JSON.parse(await readFile(configPath, 'utf8'))
      assert.deepEqual(raw.servers.mini2.args, [MINI_MCP])
      const entries = await readdir(dir)
      assert.ok(
        entries.every((f) => !f.endsWith('.tmp')),
        `atomic write must not leave temp files behind: ${entries.join(', ')}`
      )
      const st2 = await bridge.status()
      assert.ok(
        st2.servers.mini2?.status === 'ok' && st2.servers.mini2.tools === 1,
        `restarted hub should serve mini2: ${JSON.stringify(st2.servers)}`
      )

      // remove: gone from file; removing again is a 400-grade caller error
      const cfg2 = await bridge.setServer('remove', 'mini2')
      assert.equal(cfg2.servers.mini2, undefined)
      await assert.rejects(bridge.setServer('remove', 'mini2'), (e) => e.status === 400)
      await assert.rejects(bridge.setServer('rename', 'mini'), (e) => e.status === 400)
      await assert.rejects(bridge.setServer('add', 'bad/name', { command: 'x' }), (e) => e.status === 400)
      await assert.rejects(bridge.setServer('add', 'broken', {}), (e) => e.status === 400)

      // configPath default resolves AIPX_CONFIG_DIR like the aipx CLI does
      const dflt = new HubBridge()
      assert.equal(dflt.configPath, configPath)
      assert.deepEqual(await dflt.getConfig().then((c) => Object.keys(c.servers)), ['mini'])
    } finally {
      await bridge.stop()
    }
  })
})

test('hub bridge: stop() kills the child and the next call respawns it', async () => {
  await withHubEnv(async ({ configPath }) => {
    const { HubBridge } = await import('../dsh-plugin/lib/hub-bridge.js')
    const bridge = new HubBridge({ configPath })
    try {
      const first = await bridge.status()
      await bridge.stop()

      // lazy restart: a fresh serve child, same config, queries work again
      const second = await bridge.status()
      assert.equal(second.running, true)
      assert.equal(typeof second.pid, 'number')
      assert.notEqual(second.pid, first.pid, 'a new hub process must be spawned after stop()')
      const hits = (await bridge.search('echo', 3)).results
      assert.equal(hits[0]?.id, 'mini/echo')
    } finally {
      await bridge.stop()
    }
  })
})
