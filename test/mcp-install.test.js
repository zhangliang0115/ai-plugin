import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { install } from '../src/install.js'
import { remove } from '../src/remove.js'

const MCP_JSON = JSON.stringify({
  mcpServers: {
    fetch: { command: 'npx', args: ['-y', 'mcp-fetch'], env: { KEY: 'v' } },
  },
})

async function makeMcpPayload() {
  const dir = await mkdtemp(path.join(tmpdir(), 'aipx-mcppayload-'))
  await writeFile(path.join(dir, '.mcp.json'), MCP_JSON, 'utf8')
  return dir
}

test('installing a pure-MCP repo writes server definitions into agent configs', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'aipx-mcpinst-'))
  const payload = await makeMcpPayload()

  const res = await install(payload, { mcpHome: home, agents: 'claude-code,gemini' })
  assert.equal(res.installed, 2)

  const claude = JSON.parse(await readFile(path.join(home, '.claude.json'), 'utf8'))
  assert.equal(claude.mcpServers.fetch.command, 'npx')
  assert.deepEqual(claude.mcpServers.fetch.env, { KEY: 'v' })

  const gemini = JSON.parse(await readFile(path.join(home, '.gemini', 'settings.json'), 'utf8'))
  assert.equal(gemini.mcpServers.fetch.command, 'npx')

  await rm(home, { recursive: true, force: true })
  await rm(payload, { recursive: true, force: true })
})

test('MCP install dry-run writes nothing', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'aipx-mcpinst2-'))
  const payload = await makeMcpPayload()

  const res = await install(payload, { mcpHome: home, agents: 'claude-code', dryRun: true })
  assert.equal(res.dryRun, true)
  await assert.rejects(() => readFile(path.join(home, '.claude.json'), 'utf8'))

  await rm(home, { recursive: true, force: true })
  await rm(payload, { recursive: true, force: true })
})

test('MCP install respects tier policy — community targets need --all', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'aipx-mcpinst3-'))
  const payload = await makeMcpPayload()

  const res = await install(payload, { mcpHome: home })
  assert.equal(res.installed, 3) // official: claude-code, gemini, codex
  await assert.rejects(() => readFile(path.join(home, '.cursor', 'mcp.json'), 'utf8'))

  const res2 = await install(payload, { mcpHome: home, all: true })
  assert.ok(res2.installed >= 1) // cursor + codex toml updated
  const cursor = JSON.parse(await readFile(path.join(home, '.cursor', 'mcp.json'), 'utf8'))
  assert.equal(cursor.mcpServers.fetch.command, 'npx')

  await rm(home, { recursive: true, force: true })
  await rm(payload, { recursive: true, force: true })
})

test('codex TOML receives the definition when installed', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'aipx-mcpinst4-'))
  const payload = await makeMcpPayload()

  await install(payload, { mcpHome: home, agents: 'codex' })
  const toml = await readFile(path.join(home, '.codex', 'config.toml'), 'utf8')
  assert.ok(toml.includes('[mcp_servers.fetch]'))
  assert.ok(toml.includes('command = "npx"'))

  await rm(home, { recursive: true, force: true })
  await rm(payload, { recursive: true, force: true })
})

test('remove uninstalls MCP servers from recorded configs, preserving the rest', async () => {
  const prev = process.env.AIPX_CONFIG_DIR
  process.env.AIPX_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), 'aipx-mcpcfg-'))
  const home = await mkdtemp(path.join(tmpdir(), 'aipx-mcprm-'))
  const payload = await makeMcpPayload()
  // pre-existing unrelated server must survive removal
  await mkdir(path.join(home, '.claude'), { recursive: true })
  await writeFile(
    path.join(home, '.claude.json'),
    JSON.stringify({ mcpServers: { keeper: { command: 'keep' } } }),
    'utf8'
  )
  await writeCodexPreexisting(home)

  await install(payload, { mcpHome: home }) // official tier: claude-code, gemini, codex
  const res = await remove('fetch', { home })
  assert.equal(res, 3)

  const claude = JSON.parse(await readFile(path.join(home, '.claude.json'), 'utf8'))
  assert.ok(!claude.mcpServers.fetch)
  assert.equal(claude.mcpServers.keeper.command, 'keep') // unrelated server survives

  const toml = await readFile(path.join(home, '.codex', 'config.toml'), 'utf8')
  assert.ok(!toml.includes('[mcp_servers.fetch]'))

  process.env.AIPX_CONFIG_DIR = prev
  await rm(home, { recursive: true, force: true })
  await rm(payload, { recursive: true, force: true })
})

async function writeCodexPreexisting(home) {
  const p = path.join(home, '.codex', 'config.toml')
  await mkdir(path.dirname(p), { recursive: true })
  await writeFile(p, '[other]\nkey = "keep"\n', 'utf8')
}
