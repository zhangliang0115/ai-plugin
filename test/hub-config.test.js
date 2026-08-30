import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { readFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { loadHubConfig, saveHubConfig } from '../src/hub/config.js'

test('saveHubConfig writes a loadable config (no directory-for-file regression)', async () => {
  const prev = process.env.AIPX_CONFIG_DIR
  const dir = await mkdtemp(path.join(tmpdir(), 'aipx-hubcfg-'))
  process.env.AIPX_CONFIG_DIR = dir
  try {
    await saveHubConfig({ servers: { fs: { command: 'npx', args: ['-y', 'x'] } } })
    const raw = await readFile(path.join(dir, 'mcp-hub.json'), 'utf8')
    const parsed = JSON.parse(raw) // throws if saveHubConfig created a directory here
    assert.equal(parsed.servers.fs.command, 'npx')
    const loaded = await loadHubConfig()
    assert.equal(loaded.servers.fs.args[0], '-y')
  } finally {
    process.env.AIPX_CONFIG_DIR = prev
  }
})
