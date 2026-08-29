import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises'
import { constants } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { newRepo } from '../src/scaffold.js'
import { lintPath } from '../src/lint.js'

test('new scaffolds a complete dual-target repo', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'aipx-new-'))
  const { root, files } = await newRepo('my-cool-skill', {
    dir: parent,
    owner: 'someuser',
    description: 'Does a thing. Use when a user asks for the thing.',
  })
  assert.ok(files >= 12)
  assert.equal(path.basename(root), 'my-cool-skill')

  for (const rel of [
    path.join('skills', 'my-cool-skill', 'SKILL.md'),
    path.join('.claude-plugin', 'plugin.json'),
    path.join('.claude-plugin', 'marketplace.json'),
    path.join('dsh-plugin', 'package.json'),
    path.join('dsh-plugin', 'cordis.patch.yml'),
    path.join('dsh-plugin', 'index.js'),
    path.join('dsh-plugin', 'skills', 'my-cool-skill', 'SKILL.md'),
    path.join('scripts', 'check-drift.mjs'),
    path.join('.github', 'workflows', 'ci.yml'),
    'README.md',
    'LICENSE',
  ]) {
    await access(path.join(root, rel), constants.F_OK)
  }

  // manifests are coherent
  const pkg = JSON.parse(await readFile(path.join(root, 'dsh-plugin', 'package.json'), 'utf8'))
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  const patch = await readFile(path.join(root, 'dsh-plugin', 'cordis.patch.yml'), 'utf8')
  assert.ok(patch.includes(`name: ${pkg.name}`))
  const marketplace = JSON.parse(await readFile(path.join(root, '.claude-plugin', 'marketplace.json'), 'utf8'))
  assert.equal(marketplace.plugins[0].source, './')

  // dsh bundle and root skill copies are in lockstep from the start
  const a = await readFile(path.join(root, 'skills', 'my-cool-skill', 'SKILL.md'), 'utf8')
  const b = await readFile(path.join(root, 'dsh-plugin', 'skills', 'my-cool-skill', 'SKILL.md'), 'utf8')
  assert.equal(a, b)

  // README install lines carry the owner
  const readme = await readFile(path.join(root, 'README.md'), 'utf8')
  assert.ok(readme.includes('someuser/my-cool-skill'))

  await rm(parent, { recursive: true, force: true })
})

test('scaffolded skills pass aipx lint (dogfood)', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'aipx-new2-'))
  const { root } = await newRepo('lint-clean', {
    dir: parent,
    description: 'A scaffolded skill that must lint clean for the dogfood test to pass.',
  })
  const { results, orphans } = await lintPath(path.join(root, 'skills'))
  assert.deepEqual(orphans, [])
  for (const r of results) assert.deepEqual(r.errors, [])
  await rm(parent, { recursive: true, force: true })
})

test('refuses to overwrite an existing directory without --force', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'aipx-new3-'))
  await mkdir(path.join(parent, 'taken'), { recursive: true })
  await assert.rejects(
    () => newRepo('taken', { dir: parent }),
    /already exists/
  )
  const { root } = await newRepo('taken', { dir: parent, force: true })
  assert.ok(root.endsWith('taken'))
  await rm(parent, { recursive: true, force: true })
})

test('invalid names are rejected', async () => {
  await assert.rejects(() => newRepo('Bad Name!'), /kebab-case/)
  await assert.rejects(() => newRepo(''), /valid repo/)
})
