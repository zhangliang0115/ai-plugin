import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'aipx.js')

test('--version prints a semver', async () => {
  const { stdout } = await execFileAsync(process.execPath, [BIN, '--version'])
  assert.match(stdout.trim(), /^aipx \d+\.\d+\.\d+$/)
})

test('--help prints usage and mentions every command', async () => {
  const { stdout } = await execFileAsync(process.execPath, [BIN, '--help'])
  for (const word of ['install', 'sync', 'upgrade', 'new', 'list', 'search', 'lint', 'remove', 'doctor']) {
    assert.ok(stdout.includes(word), `help mentions ${word}`)
  }
})

test('search surfaces curated registry entries (offline path)', async () => {
  const { stdout } = await execFileAsync(process.execPath, [BIN, 'search', 'deepseek', '--no-color'])
  assert.ok(stdout.includes('curated registry'), 'prints the registry section')
  assert.ok(stdout.includes('zhangliang0115/ai-plugin'), 'lists this repo')
  assert.ok(stdout.includes('deepseek-ai/deepseek-harness'), 'lists the dsh harness entry')
})

test('search with no match still exits cleanly', async () => {
  const { stdout } = await execFileAsync(process.execPath, [BIN, 'search', 'zzz-no-such-thing-xyz', '--no-color'])
  assert.ok(stdout.includes('0 match(es)'))
})

test('unknown command fails with exit code 1', async () => {
  await assert.rejects(
    () => execFileAsync(process.execPath, [BIN, 'frobnicate']),
    (err) => err.code === 1
  )
})

test('install without a source fails cleanly', async () => {
  await assert.rejects(
    () => execFileAsync(process.execPath, [BIN, 'install']),
    (err) => err.code === 1
  )
})

test('unknown flag fails cleanly', async () => {
  await assert.rejects(
    () => execFileAsync(process.execPath, [BIN, 'list', '--bogus']),
    (err) => err.code === 1
  )
})
