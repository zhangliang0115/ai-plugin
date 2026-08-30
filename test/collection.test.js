import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'

const execFileAsync = promisify(execFile)
const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'aipx.js')
const REGISTRY = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'registry',
  'index.json'
)

test('every registry collection references known plugins and unique names', async () => {
  const registry = JSON.parse(await readFile(REGISTRY, 'utf8'))
  const repos = new Set((registry.plugins ?? []).map((p) => p.repo))
  const names = new Set()
  for (const col of registry.collections ?? []) {
    assert.ok(col.name && !names.has(col.name), `collection name must be present and unique: ${col.name}`)
    names.add(col.name)
    assert.ok(col.description, `collection ${col.name} needs a description`)
    for (const e of col.entries) {
      assert.ok(repos.has(e.source), `collection ${col.name} references unknown repo: ${e.source}`)
      assert.ok(e.why, `collection ${col.name}: entry ${e.source} needs a "why"`)
    }
  }
  assert.ok(names.size >= 1, 'registry should ship at least one starter collection')
})

test('collection listing shows starter collections', async () => {
  const { stdout } = await execFileAsync(process.execPath, [BIN, 'collection', '--no-color'])
  assert.ok(stdout.includes('deepseek-coding'))
  assert.ok(stdout.includes('getting-started'))
})

test('collection detail shows per-entry why and install lines', async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    BIN,
    'collection',
    'deepseek-coding',
    '--no-color',
  ])
  assert.ok(stdout.includes('why:'))
  assert.ok(stdout.includes('aipx install zhangliang0115/ai-plugin'))
  assert.ok(stdout.includes('aipx collection deepseek-coding --run'))
})

test('unknown collection fails with available names', async () => {
  await assert.rejects(
    () => execFileAsync(process.execPath, [BIN, 'collection', 'zzz-nope', '--no-color']),
    (err) => err.stderr.includes('unknown collection "zzz-nope"')
  )
})
