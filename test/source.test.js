import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSource } from '../src/source.js'

test('shorthand owner/repo', async () => {
  const s = await parseSource('owner/repo')
  assert.equal(s.kind, 'github')
  assert.equal(s.owner, 'owner')
  assert.equal(s.repo, 'repo')
  assert.equal(s.ref, null)
  assert.equal(s.sub, null)
})

test('shorthand with #path: subdirectory (dsh/pnpm syntax)', async () => {
  const s = await parseSource('owner/repo#path:/skills/bibi')
  assert.equal(s.kind, 'github')
  assert.equal(s.sub, 'skills/bibi')
  assert.equal(s.label, 'owner/repo#path:/skills/bibi')
})

test('shorthand with .git suffix', async () => {
  const s = await parseSource('owner/repo.git')
  assert.equal(s.repo, 'repo')
})

test('https URL', async () => {
  const s = await parseSource('https://github.com/owner/repo')
  assert.equal(s.owner, 'owner')
  assert.equal(s.repo, 'repo')
  assert.equal(s.sub, null)
})

test('https URL with tree ref and subpath', async () => {
  const s = await parseSource('https://github.com/owner/repo/tree/v1.2.0/skills/x')
  assert.equal(s.ref, 'v1.2.0')
  assert.equal(s.sub, 'skills/x')
})

test('https URL with tree ref only', async () => {
  const s = await parseSource('https://github.com/owner/repo/tree/main/')
  assert.equal(s.ref, 'main')
  assert.equal(s.sub, null)
})

test('ssh form', async () => {
  const s = await parseSource('git@github.com:owner/repo.git')
  assert.equal(s.owner, 'owner')
  assert.equal(s.repo, 'repo')
})

test('rejects unsupported URL paths', async () => {
  await assert.rejects(() => parseSource('https://github.com/owner/repo/blob/main/README.md'))
})

test('rejects garbage', async () => {
  await assert.rejects(() => parseSource('not-a-source'))
  await assert.rejects(() => parseSource(''))
})

test('local path is detected', async () => {
  const s = await parseSource('./README.md')
  assert.equal(s.kind, 'local')
  assert.ok(s.path.endsWith('README.md'))
})

test('missing local path throws', async () => {
  await assert.rejects(() => parseSource('./definitely-not-here-12345'))
})
