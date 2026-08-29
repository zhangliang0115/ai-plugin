import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { listMcp, syncMcp } from '../src/mcp.js'

async function makeHome() {
  return mkdtemp(path.join(tmpdir(), 'aipx-mcp-'))
}

async function writeConfig(home, rel, content) {
  const full = path.join(home, rel)
  await mkdir(path.dirname(full), { recursive: true })
  await writeFile(full, content, 'utf8')
  return full
}

test('mcp list inventories JSON and TOML configs', async () => {
  const home = await makeHome()
  await writeConfig(
    home,
    '.claude.json',
    JSON.stringify({ mcpServers: { fetch: { command: 'npx', args: ['-y', 'mcp-fetch'] } } })
  )
  await writeConfig(
    home,
    path.join('.codex', 'config.toml'),
    '[model]\nname = "gpt"\n\n[mcp_servers.demo]\ncommand = "uvx"\nargs = ["demo-pkg"]\nenv = { KEY = "value" }\n'
  )

  const out = await listMcp({ home, includeCommunity: true })
  assert.equal(out['claude-code'].servers[0].name, 'fetch')
  const codex = out['codex'].servers.find((s) => s.name === 'demo')
  assert.equal(codex.def.command, 'uvx')
  assert.deepEqual(codex.def.args, ['demo-pkg'])
  assert.deepEqual(codex.def.env, { KEY: 'value' })

  await rm(home, { recursive: true, force: true })
})

test('mcp sync copies a JSON server into JSON and TOML targets, preserving unrelated content', async () => {
  const home = await makeHome()
  await writeConfig(
    home,
    '.claude.json',
    JSON.stringify({
      theme: 'dark',
      mcpServers: { fetch: { command: 'npx', args: ['-y', 'demo'], env: { API_KEY: 'secret' } } },
    })
  )
  const gemini = await writeConfig(home, path.join('.gemini', 'settings.json'), JSON.stringify({ theme: 'light' }))
  const codex = await writeConfig(
    home,
    path.join('.codex', 'config.toml'),
    '[model]\nname = "gpt"\n\n[mcp_servers.old]\ncommand = "keep-me"\n'
  )

  const res = await syncMcp('fetch', { home, agents: 'gemini,codex' })
  assert.equal(res.synced, 2)

  const geminiParsed = JSON.parse(await readFile(gemini, 'utf8'))
  assert.equal(geminiParsed.theme, 'light') // unrelated keys preserved
  assert.equal(geminiParsed.mcpServers.fetch.command, 'npx')
  assert.deepEqual(geminiParsed.mcpServers.fetch.env, { API_KEY: 'secret' })

  const toml = await readFile(codex, 'utf8')
  assert.ok(toml.includes('[model]'))
  assert.ok(toml.includes('name = "gpt"'))
  assert.ok(toml.includes('[mcp_servers.old]'))
  assert.ok(toml.includes('command = "keep-me"'))
  assert.ok(toml.includes('[mcp_servers.fetch]'))
  assert.ok(toml.includes('command = "npx"'))
  assert.ok(toml.includes('args = ["-y", "demo"]'))
  assert.ok(toml.includes('API_KEY = "secret"'))
  await rm(home, { recursive: true, force: true })
})

test('mcp sync overwrites an existing TOML server in place', async () => {
  const home = await makeHome()
  await writeConfig(
    home,
    '.claude.json',
    JSON.stringify({ mcpServers: { fetch: { command: 'npx', args: ['-y', 'v2'] } } })
  )
  const codex = await writeConfig(
    home,
    path.join('.codex', 'config.toml'),
    '[mcp_servers.fetch]\ncommand = "old"\nargs = ["v1"]\n\n[other]\nkey = "keep"\n'
  )

  await syncMcp('fetch', { home, agents: 'codex' })
  const toml = await readFile(codex, 'utf8')
  assert.ok(toml.includes('"v2"'))
  assert.ok(!toml.includes('v1'))
  assert.ok(toml.includes('[other]'))
  assert.ok(toml.includes('key = "keep"'))
  await rm(home, { recursive: true, force: true })
})

test('mcp sync errors when the server exists nowhere', async () => {
  const home = await makeHome()
  await assert.rejects(() => syncMcp('ghost', { home }), /not found in any known agent config/)
  await rm(home, { recursive: true, force: true })
})

test('mcp sync errors on unknown --from agent', async () => {
  const home = await makeHome()
  await writeConfig(home, '.claude.json', JSON.stringify({ mcpServers: { x: { command: 'run' } } }))
  await assert.rejects(
    () => syncMcp('x', { home, from: 'gemini' }),
    /not configured in "gemini"/
  )
  await rm(home, { recursive: true, force: true })
})

test('mcp sync --dry-run writes nothing', async () => {
  const home = await makeHome()
  await writeConfig(home, '.claude.json', JSON.stringify({ mcpServers: { x: { command: 'run' } } }))
  await syncMcp('x', { home, agents: 'gemini', dryRun: true })
  await assert.rejects(() => readFile(path.join(home, '.gemini', 'settings.json'), 'utf8'))
  await rm(home, { recursive: true, force: true })
})

test('mcp sync --project writes the project .mcp.json', async () => {
  const home = await makeHome()
  const project = await mkdtemp(path.join(tmpdir(), 'aipx-mcpproj-'))
  await writeConfig(home, '.claude.json', JSON.stringify({ mcpServers: { fetch: { command: 'npx', args: ['-y', 'demo'] } } }))

  const res = await syncMcp('fetch', { home, project })
  assert.equal(res.synced, 1) // only claude-code has a project target by default

  const mcpJson = JSON.parse(await readFile(path.join(project, '.mcp.json'), 'utf8'))
  assert.equal(mcpJson.mcpServers.fetch.command, 'npx')
  await rm(home, { recursive: true, force: true })
  await rm(project, { recursive: true, force: true })
})

test('mcp list --project reads the project .mcp.json', async () => {
  const home = await makeHome()
  const project = await mkdtemp(path.join(tmpdir(), 'aipx-mcplist-'))
  await writeConfig(project, '.mcp.json', JSON.stringify({ mcpServers: { local: { command: './run.sh' } } }))

  const out = await listMcp({ home, project })
  assert.equal(out['claude-code'].servers[0].name, 'local')
  assert.ok(out['claude-code'].file.endsWith('.mcp.json'))
  await rm(home, { recursive: true, force: true })
  await rm(project, { recursive: true, force: true })
})

test('remote (url) servers skip the codex writer with a warning', async () => {
  const home = await makeHome()
  await writeConfig(home, '.claude.json', JSON.stringify({ mcpServers: { web: { type: 'http', url: 'https://x' } } }))
  const res = await syncMcp('web', { home, agents: 'codex,gemini' })
  assert.equal(res.synced, 1) // gemini got it, codex skipped
  const toml = await readFile(path.join(home, '.codex', 'config.toml'), 'utf8').catch(() => '')
  assert.equal(toml, '')
  await rm(home, { recursive: true, force: true })
})
