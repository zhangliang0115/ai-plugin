import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { detectPayload } from '../src/detect.js'

async function scratch() {
  return mkdtemp(path.join(tmpdir(), 'aipx-detect-'))
}

const SKILL_MD = (name, desc) =>
  `---\nname: ${name}\ndescription: ${desc}\n---\n\n# ${name}\n\nbody text\n`

test('detects a single skill at payload root', async () => {
  const dir = await scratch()
  await writeFile(path.join(dir, 'SKILL.md'), SKILL_MD('solo', 'a single skill'), 'utf8')
  const p = await detectPayload(dir)
  assert.deepEqual(p.kinds, ['skill'])
  assert.equal(p.skills.length, 1)
  assert.equal(p.skills[0].name, 'solo')
  await rm(dir, { recursive: true, force: true })
})

test('detects a skills/ collection', async () => {
  const dir = await scratch()
  await mkdir(path.join(dir, 'skills', 'alpha'), { recursive: true })
  await mkdir(path.join(dir, 'skills', 'beta'), { recursive: true })
  await writeFile(path.join(dir, 'skills', 'alpha', 'SKILL.md'), SKILL_MD('alpha', 'a'), 'utf8')
  await writeFile(path.join(dir, 'skills', 'beta', 'SKILL.md'), SKILL_MD('beta', 'b'), 'utf8')
  const p = await detectPayload(dir)
  assert.deepEqual(p.kinds, ['skills'])
  assert.deepEqual(p.skills.map((s) => s.name).sort(), ['alpha', 'beta'])
  await rm(dir, { recursive: true, force: true })
})

test('detects a dsh bundle and a claude plugin together', async () => {
  const dir = await scratch()
  await mkdir(path.join(dir, '.claude-plugin'), { recursive: true })
  await writeFile(
    path.join(dir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'x', version: '0.0.1' }),
    'utf8'
  )
  await writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'x', dsh: { bundle: { patch: './cordis.patch.yml' } } }),
    'utf8'
  )
  const p = await detectPayload(dir)
  assert.ok(p.kinds.includes('claude-plugin'))
  assert.ok(p.kinds.includes('dsh-plugin'))
  assert.equal(p.kind, 'claude-plugin')
  assert.ok(p.hints.some((h) => h.includes('marketplace')))
  assert.ok(p.hints.some((h) => h.includes('dsh plugin')))
  await rm(dir, { recursive: true, force: true })
})

test('detects flat skill files and normalizes their names', async () => {
  const dir = await scratch()
  await writeFile(path.join(dir, 'flat-skill.md'), SKILL_MD('Flat Skill', 'flat'), 'utf8')
  await writeFile(path.join(dir, 'README.md'), '# readme', 'utf8')
  const p = await detectPayload(dir)
  assert.deepEqual(p.kinds, ['flat-skills'])
  assert.equal(p.skills[0].name, 'flat-skill')
  assert.equal(p.skills[0].normalized, true)
  assert.equal(p.skills[0].dir, null)
  await rm(dir, { recursive: true, force: true })
})

test('falls back to directory name when frontmatter has no name', async () => {
  const dir = await scratch()
  const skillDir = path.join(dir, 'skills', 'my-fallback')
  await mkdir(skillDir, { recursive: true })
  await writeFile(
    path.join(skillDir, 'SKILL.md'),
    '---\ndescription: no name in frontmatter\n---\n\nbody\n',
    'utf8'
  )
  const p = await detectPayload(dir)
  assert.equal(p.skills[0].name, 'my-fallback')
  await rm(dir, { recursive: true, force: true })
})

test('throws a helpful error on an empty payload', async () => {
  const dir = await scratch()
  await assert.rejects(() => detectPayload(dir), /no plugin payload found/)
  await rm(dir, { recursive: true, force: true })
})
