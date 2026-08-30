import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { VERSION } from '../src/version.js'

test('VERSION matches package.json — release drift regression guard', async () => {
  // "aipx --version" reported 0.1.0 through v0.4.1 because the CLI's hardcoded
  // VERSION was never bumped on release. Pin the single source to the manifest.
  const pkgRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const pkg = JSON.parse(await readFile(path.join(pkgRoot, 'package.json'), 'utf8'))
  assert.equal(VERSION, pkg.version, 'src/version.js must match package.json')
})

test('VERSION is valid semver', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/)
})
