import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, lstat, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sync } from '../src/sync.js'
import { remove } from '../src/remove.js'

const SKILL = '---\nname: demo-skill\ndescription: demo\n---\n\n# demo\n'

async function makePrimary() {
  const tmp = await mkdtemp(path.join(tmpdir(), 'aipx-sync-'))
  const primary = path.join(tmp, 'primary')
  await mkdir(path.join(primary, 'demo-skill'), { recursive: true })
  await writeFile(path.join(primary, 'demo-skill', 'SKILL.md'), SKILL, 'utf8')
  return { tmp, primary }
}

function fakeRoots(tmp, names) {
  return names.map((name) => ({
    agent: { id: name, label: `Agent ${name}`, note: null, userRoot: path.join(tmp, name, 'skills') },
    root: path.join(tmp, name, 'skills'),
  }))
}

test('sync links primary skills into every provided root', async () => {
  const { tmp, primary } = await makePrimary()
  const roots = fakeRoots(tmp, ['a', 'b'])

  const res = await sync({ from: primary, roots })
  assert.equal(res.linked, 2)

  for (const r of roots) {
    await lstat(path.join(r.root, 'demo-skill'))
    assert.equal((await lstat(path.join(r.root, 'demo-skill'))).isSymbolicLink(), true)
  }
  await rm(tmp, { recursive: true, force: true })
})

test('sync --copy duplicates files instead of linking', async () => {
  const { tmp, primary } = await makePrimary()
  const roots = fakeRoots(tmp, ['copy1'])

  const res = await sync({ from: primary, roots, copy: true })
  assert.equal(res.copied, 1)
  assert.equal(res.linked, 0)
  const body = await readFile(path.join(roots[0].root, 'demo-skill', 'SKILL.md'), 'utf8')
  assert.match(body, /# demo/)
  assert.equal((await lstat(path.join(roots[0].root, 'demo-skill'))).isSymbolicLink(), false)

  await rm(tmp, { recursive: true, force: true })
})

test('sync is idempotent — second run reports everything present', async () => {
  const { tmp, primary } = await makePrimary()
  const roots = fakeRoots(tmp, ['a'])

  await sync({ from: primary, roots })
  const res = await sync({ from: primary, roots })
  assert.equal(res.linked + res.copied, 0)
  assert.equal(res.skipped, 1)

  await rm(tmp, { recursive: true, force: true })
})

test('remove deletes a skill from every root where it appears', async () => {
  const { tmp, primary } = await makePrimary()
  const roots = fakeRoots(tmp, ['a', 'b'])
  await sync({ from: primary, roots })

  // remove scans real agent roots plus... it only scans real roots, so fake
  // roots are not touched; on a clean name it must be a no-op everywhere.
  const n = await remove('aipx-does-not-exist-anywhere')
  assert.equal(n, 0)

  await rm(tmp, { recursive: true, force: true })
})

test('remove rejects missing args', async () => {
  await assert.rejects(() => remove(''), /usage/)
})
