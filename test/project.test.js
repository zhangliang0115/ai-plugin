import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { projectRootsFor } from '../src/agents.js'
import { install } from '../src/install.js'

const SKILL = '---\nname: demo-skill\ndescription: demo\n---\n\n# demo\n'

async function makePayload() {
  const dir = await mkdtemp(path.join(tmpdir(), 'aipx-proj-payload-'))
  await mkdir(path.join(dir, 'skills', 'demo-skill'), { recursive: true })
  await writeFile(path.join(dir, 'skills', 'demo-skill', 'SKILL.md'), SKILL, 'utf8')
  return dir
}

test('projectRootsFor dedupes shared roots and skips agents without one', () => {
  const agents = [
    { id: 'dsh', projectRoot: '.agents/skills' },
    { id: 'codex', projectRoot: '.agents/skills' },
    { id: 'claude-code', projectRoot: '.claude/skills' },
    { id: 'openclaw', projectRoot: null },
  ]
  const roots = projectRootsFor(agents, '/proj')
  assert.deepEqual(
    roots.map((r) => r.root.replace(/\\/g, '/')).sort(),
    ['/proj/.agents/skills', '/proj/.claude/skills']
  )
})

test('install --project writes official project roots without agent detection', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'aipx-proj-'))
  const project = path.join(tmp, 'repo')
  await mkdir(project, { recursive: true })
  const payload = await makePayload()

  const res = await install(payload, { project })
  // dsh + codex share .agents/skills → 4 unique roots
  assert.equal(res.installed, 4)

  for (const rel of ['.claude/skills', '.agents/skills', '.gemini/skills', '.github/skills']) {
    await access(path.join(project, rel, 'demo-skill', 'SKILL.md'), constants.F_OK)
  }

  await rm(tmp, { recursive: true, force: true })
  await rm(payload, { recursive: true, force: true })
})

test('install --project honors --agents narrowing', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'aipx-proj2-'))
  const project = path.join(tmp, 'repo')
  await mkdir(project, { recursive: true })
  const payload = await makePayload()

  const res = await install(payload, { project, agents: 'claude-code' })
  assert.equal(res.installed, 1)
  await access(path.join(project, '.claude/skills/demo-skill', 'SKILL.md'), constants.F_OK)
  await assert.rejects(() => access(path.join(project, '.agents'), constants.F_OK))

  await rm(tmp, { recursive: true, force: true })
  await rm(payload, { recursive: true, force: true })
})

test('install --project <missing-dir> fails clearly', async () => {
  const payload = await makePayload()
  await assert.rejects(
    () => install(payload, { project: path.join(tmpdir(), 'aipx-nope-xyz') }),
    /project directory not found/
  )
  await rm(payload, { recursive: true, force: true })
})

test('install --project with an explicit path installs there', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'aipx-proj3-'))
  const project = path.join(tmp, 'somewhere', 'else')
  await mkdir(project, { recursive: true })
  const payload = await makePayload()

  const res = await install(payload, { project, agents: 'dsh' })
  assert.equal(res.installed, 1)
  await access(path.join(project, '.agents/skills/demo-skill', 'SKILL.md'), constants.F_OK)

  await rm(tmp, { recursive: true, force: true })
  await rm(payload, { recursive: true, force: true })
})
