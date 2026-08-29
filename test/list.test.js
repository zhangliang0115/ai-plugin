import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { list } from '../src/list.js'

test('list --project inventories project-scoped skills', async () => {
  const project = await mkdtemp(path.join(tmpdir(), 'aipx-list-'))
  await mkdir(path.join(project, '.claude', 'skills', 'team-skill'), { recursive: true })
  await writeFile(
    path.join(project, '.claude', 'skills', 'team-skill', 'SKILL.md'),
    '---\nname: team-skill\ndescription: a team skill committed with the repo\n---\n\nbody\n',
    'utf8'
  )

  const out = await list({ project, json: true })
  assert.ok(out['claude-code'])
  assert.equal(out['claude-code'].skills[0].name, 'team-skill')

  await rm(project, { recursive: true, force: true })
})

test('list --project on an empty dir reports nothing (json: empty object)', async () => {
  const project = await mkdtemp(path.join(tmpdir(), 'aipx-list2-'))
  const out = await list({ project, json: true })
  assert.deepEqual(out, {})
  await rm(project, { recursive: true, force: true })
})
