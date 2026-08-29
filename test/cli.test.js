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
  for (const word of ['install', 'sync', 'list', 'search', 'remove', 'doctor']) {
    assert.ok(stdout.includes(word), `help mentions ${word}`)
  }
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
