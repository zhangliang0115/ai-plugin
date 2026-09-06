import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * In-process integration: HubBridge runs createHub directly (no aipx mcp serve
 * child, no aipx/npx dependency). Its hub spawns fixtures/mini-mcp.mjs as a
 * downstream, and the bridge reads/writes a real mcp-hub.json in a temp
 * AIPX_CONFIG_DIR. Exercises the full chain — lazy in-process build, status /
 * catalog / search, config add/remove with hub rebuild — not a mock in sight.
 */
const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(here, '..')
const MINI_MCP = path.join(repoRoot, 'fixtures', 'mini-mcp.mjs')

async function withHubEnv(run) {
  const prevConfigDir = process.env.AIPX_CONFIG_DIR
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aipx-hubbridge-'))
  process.env.AIPX_CONFIG_DIR = dir
  const configPath = path.join(dir, 'mcp-hub.json')
  await writeFile(
    configPath,
    JSON.stringify({ servers: { mini: { command: process.execPath, args: [MINI_MCP] } } }, null, 2) + '\n'
  )
  try {
    return await run({ dir, configPath })
  } finally {
    process.env.AIPX_CONFIG_DIR = prevConfigDir
  }
}

test('hub bridge: status, tools, search, config add/remove against the in-process hub', async () => {
  await withHubEnv(async ({ dir, configPath }) => {
    const { HubBridge } = await import('../dsh-plugin/lib/hub-bridge.js')
    const logs = []
    const bridge = new HubBridge({ configPath, log: (m) => logs.push(m) })
    try {
      const st = await bridge.status()
      assert.equal(st.running, true)
      // in-process: pid is the host process; the console renders "pid NNN"
      assert.equal(st.pid, process.pid)
      // status is a name-keyed map: {status:'ok', tools} per server
      const mini = st.servers.mini
      assert.ok(mini, `status should list the mini server: ${JSON.stringify(st.servers)}`)
      assert.equal(mini.status, 'ok')
      assert.equal(mini.tools, 1)

      // the full catalog: hub.status() carries counts only, so tools() must
      // surface mini/echo through the catalog path (inputSchema included)
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

      // add: file updated atomically, hub rebuilt on the fresh config
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
        `rebuilt hub should serve mini2: ${JSON.stringify(st2.servers)}`
      )

      // url + headers defs persist as-is (console Headers field support)
      const cfgUrl = await bridge.setServer('add', 'demo-http', {
        url: 'http://127.0.0.1:9/mcp',
        headers: { Authorization: 'Bearer test123' },
      })
      assert.deepEqual(cfgUrl.servers['demo-http'].headers, { Authorization: 'Bearer test123' })
      const rawUrl = JSON.parse(await readFile(configPath, 'utf8'))
      assert.equal(rawUrl.servers['demo-http'].headers.Authorization, 'Bearer test123')
      await bridge.setServer('remove', 'demo-http')

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

test('hub bridge: tools/toggle and settings rewrite the config and rebuild the hub', async () => {
  await withHubEnv(async ({ configPath }) => {
    const { HubBridge } = await import('../dsh-plugin/lib/hub-bridge.js')
    const bridge = new HubBridge({ configPath })
    try {
      // ---- toggle round 1: disable mini/echo ----
      const off = await bridge.toggleTool('mini/echo', true)
      assert.deepEqual(off, { ok: true, disabledTools: ['mini/echo'] })
      let raw = JSON.parse(await readFile(configPath, 'utf8'))
      assert.deepEqual(raw.disabledTools, ['mini/echo'])

      // the rebuilt hub no longer serves the tool
      const st = await bridge.status()
      assert.equal(st.servers.mini.tools, 0)
      const hits = (await bridge.search('echo text', 5)).results
      assert.ok(!hits.some((t) => t.id === 'mini/echo'), `mini/echo must vanish: ${JSON.stringify(hits)}`)

      // id validation: caller mistakes are 400-grade, nothing is written
      await assert.rejects(bridge.toggleTool('no-slash', true), (e) => e.status === 400)
      await assert.rejects(bridge.toggleTool('', true), (e) => e.status === 400)
      await assert.rejects(bridge.toggleTool(42, true), (e) => e.status === 400)
      await assert.rejects(bridge.toggleTool('mini/echo', 'yes'), (e) => e.status === 400)

      // ---- toggle round 2: re-enable, the tool is back ----
      const on = await bridge.toggleTool('mini/echo', false)
      assert.deepEqual(on, { ok: true, disabledTools: [] })
      raw = JSON.parse(await readFile(configPath, 'utf8'))
      assert.deepEqual(raw.disabledTools, [])
      const again = (await bridge.search('echo text', 5)).results
      assert.equal(again[0]?.id, 'mini/echo')

      // re-disabling is deduped: one entry, order preserved
      await bridge.toggleTool('mini/echo', true)
      const dup = await bridge.toggleTool('mini/echo', true)
      assert.deepEqual(dup.disabledTools, ['mini/echo'])

      // ---- settings: sidecar lands in search.sidecar, rebuild stays healthy ----
      // a command that exits immediately proves the lexical fallback keeps the
      // rebuilt hub serving even though the sidecar itself is broken
      const spec = `${process.execPath} /nonexistent/aipx-sidecar.mjs`
      const withSidecar = await bridge.setSettings(spec)
      assert.deepEqual(withSidecar, { ok: true, search: { sidecar: spec } })
      raw = JSON.parse(await readFile(configPath, 'utf8'))
      assert.equal(raw.search.sidecar, spec)
      assert.deepEqual(raw.disabledTools, ['mini/echo']) // other keys survive
      const st2 = await bridge.status()
      assert.equal(st2.servers.mini.tools, 0, 'rebuilt hub picked up the sidecar config')
      await assert.rejects(bridge.setSettings(''), (e) => e.status === 400)
      await assert.rejects(bridge.setSettings(42), (e) => e.status === 400)

      // null clears the whole search key, not just sidecar
      const cleared = await bridge.setSettings(null)
      assert.deepEqual(cleared, { ok: true, search: null })
      raw = JSON.parse(await readFile(configPath, 'utf8'))
      assert.equal(raw.search, undefined)
      assert.deepEqual(raw.disabledTools, ['mini/echo'])
    } finally {
      await bridge.stop()
    }
  })
})

test('hub bridge: stop() disposes the in-process hub and the next call rebuilds it', async () => {
  await withHubEnv(async ({ configPath }) => {
    const { HubBridge } = await import('../dsh-plugin/lib/hub-bridge.js')
    const bridge = new HubBridge({ configPath })
    try {
      const first = await bridge.status()
      assert.equal(bridge.hubGen, 1)
      await bridge.stop()
      assert.equal(bridge.hubGen, 1, 'dispose does not bump the generation; a rebuild does')

      // lazy restart: a fresh in-process hub, same config, queries work again
      const second = await bridge.status()
      assert.equal(second.running, true)
      assert.equal(second.pid, process.pid)
      assert.equal(bridge.hubGen, 2, 'a new hub must be rebuilt after stop()')
      const hits = (await bridge.search('echo', 3)).results
      assert.equal(hits[0]?.id, 'mini/echo')
    } finally {
      await bridge.stop()
    }
  })
})
