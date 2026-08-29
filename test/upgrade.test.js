import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { install } from '../src/install.js'
import { upgrade } from '../src/upgrade.js'

// Isolate the aipx manifest for this test file so real user installs are
// never touched (and tests don't depend on them).
process.env.AIPX_CONFIG_DIR = await (async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'aipx-cfg-'))
  return dir
})()

const SKILL_V1 = '---\nname: demo-skill\ndescription: demo v1\n---\n\n# demo v1\n'

async function makePayload(version) {
  const dir = await mkdtemp(path.join(tmpdir(), 'aipx-up-payload-'))
  await mkdir(path.join(dir, 'skills', 'demo-skill'), { recursive: true })
  await writeFile(
    path.join(dir, 'skills', 'demo-skill', 'SKILL.md'),
    version === 2
      ? '---\nname: demo-skill\ndescription: demo v2\n---\n\n# demo v2\n'
      : SKILL_V1,
    'utf8'
  )
  if (version === 2) {
    // upstream added a sibling skill between installs
    await mkdir(path.join(dir, 'skills', 'bonus-skill'), { recursive: true })
    await writeFile(
      path.join(dir, 'skills', 'bonus-skill', 'SKILL.md'),
      '---\nname: bonus-skill\ndescription: added upstream\n---\n\n# bonus\n',
      'utf8'
    )
  }
  return dir
}

function fakeRoots(tmp, names) {
  return names.map((name) => ({
    agent: { id: name, label: `Agent ${name}`, note: null },
    root: path.join(tmp, name, 'skills'),
  }))
}

test('upgrade re-installs from the recorded source and picks up upstream changes', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'aipx-up-'))
  const payload = await makePayload(1)
  const roots = fakeRoots(tmp, ['a'])

  await install(payload, { roots })
  const before = await readFile(path.join(roots[0].root, 'demo-skill', 'SKILL.md'), 'utf8')
  assert.match(before, /demo v1/)

  // simulate an upstream update in the same local source
  await rm(payload, { recursive: true, force: true })
  const payloadV2 = await makePayload(2)
  // rewrite the manifest entry to point at the v2 directory (same path a real
  // GitHub source would keep)
  const { loadManifest, saveManifest } = await import('../src/manifest.js')
  const manifest = await loadManifest()
  manifest.installed['demo-skill'].source = payloadV2
  await saveManifest(manifest)

  const results = await upgrade('demo-skill')
  assert.equal(results[payloadV2].installed, 2) // demo-skill + bonus-skill

  const after = await readFile(path.join(roots[0].root, 'demo-skill', 'SKILL.md'), 'utf8')
  assert.match(after, /demo v2/)
  await readFile(path.join(roots[0].root, 'bonus-skill', 'SKILL.md'), 'utf8') // new sibling landed

  await rm(tmp, { recursive: true, force: true })
  await rm(payloadV2, { recursive: true, force: true })
})

test('upgrade with nothing recorded is a friendly no-op', async () => {
  // fresh isolated manifest dir
  const prev = process.env.AIPX_CONFIG_DIR
  process.env.AIPX_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), 'aipx-cfg2-'))
  const results = await upgrade()
  assert.deepEqual(results, {})
  process.env.AIPX_CONFIG_DIR = prev
})

test('upgrade of an unrecorded name fails clearly', async () => {
  await assert.rejects(() => upgrade('never-installed-xyz'), /not recorded as an aipx install/)
})
