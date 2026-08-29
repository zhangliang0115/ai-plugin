import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises'
import { constants } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { install } from '../src/install.js'

const SKILL = '---\nname: demo-skill\ndescription: demo\n---\n\n# demo\n'

async function makePayload() {
  const dir = await mkdtemp(path.join(tmpdir(), 'aipx-payload-'))
  await mkdir(path.join(dir, 'skills', 'demo-skill'), { recursive: true })
  await writeFile(path.join(dir, 'skills', 'demo-skill', 'SKILL.md'), SKILL, 'utf8')
  return dir
}

function fakeAgents(tmp) {
  return [
    { agent: { id: 'a1', label: 'Agent One', note: null }, root: path.join(tmp, 'a1', 'skills') },
    { agent: { id: 'a2', label: 'Agent Two', note: null }, root: path.join(tmp, 'a2', 'skills') },
  ]
}

test('install copies skills into every provided root and records them', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'aipx-install-'))
  const payload = await makePayload()
  const roots = fakeAgents(tmp)

  const res = await install(payload, { roots })
  assert.equal(res.installed, 2)
  assert.deepEqual(res.skills, ['demo-skill'])

  for (const r of roots) {
    await access(path.join(r.root, 'demo-skill', 'SKILL.md'), constants.F_OK)
    const body = await readFile(path.join(r.root, 'demo-skill', 'SKILL.md'), 'utf8')
    assert.match(body, /# demo/)
  }
  await rm(tmp, { recursive: true, force: true })
  await rm(payload, { recursive: true, force: true })
})

test('install skips existing targets unless --force', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'aipx-install2-'))
  const payload = await makePayload()
  const roots = fakeAgents(tmp)

  await install(payload, { roots })
  const res2 = await install(payload, { roots })
  assert.equal(res2.installed, 0)
  assert.equal(res2.skipped, 2)

  const res3 = await install(payload, { roots, force: true })
  assert.equal(res3.installed, 2)

  await rm(tmp, { recursive: true, force: true })
  await rm(payload, { recursive: true, force: true })
})

test('dry run writes nothing', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'aipx-install3-'))
  const payload = await makePayload()
  const roots = fakeAgents(tmp)

  const res = await install(payload, { roots, dryRun: true })
  assert.equal(res.dryRun, true)
  await assert.rejects(() => access(path.join(roots[0].root, 'demo-skill'), constants.F_OK))

  await rm(tmp, { recursive: true, force: true })
  await rm(payload, { recursive: true, force: true })
})

test('install rejects a payload without skills but still shows hints', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'aipx-install4-'))
  const dir = path.join(tmp, 'payload')
  await mkdir(dir, { recursive: true })
  await writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'x', dsh: { bundle: { patch: './p.yml' } } }),
    'utf8'
  )
  await assert.rejects(() => install(dir, { roots: fakeAgents(tmp) }), /nothing to install/)
  await rm(tmp, { recursive: true, force: true })
})
