import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { lintPath, lintSkill } from '../src/lint.js'

async function skill(frontmatter, body = '# body\n') {
  const dir = await mkdtemp(path.join(tmpdir(), 'aipx-lint-'))
  await writeFile(path.join(dir, 'SKILL.md'), `---\n${frontmatter}\n---\n\n${body}`, 'utf8')
  return dir
}

test('a valid skill lints clean', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'aipx-lint-'))
  const dir = path.join(parent, 'good-skill')
  await mkdir(dir, { recursive: true })
  await writeFile(
    path.join(dir, 'SKILL.md'),
    '---\nname: good-skill\ndescription: Summarize videos from a URL. Use when the user pastes a video link.\n---\n\n# body\n',
    'utf8'
  )
  const r = await lintSkill(dir)
  assert.equal(r.errors.length, 0)
  assert.equal(r.warnings.length, 0)
  await rm(parent, { recursive: true, force: true })
})

test('missing name or description are errors', async () => {
  const dir = await skill('description: has description only')
  let r = await lintSkill(dir)
  assert.ok(r.errors.some((e) => e.includes('missing "name"')))

  const dir2 = await skill('name: no-description')
  r = await lintSkill(dir2)
  assert.ok(r.errors.some((e) => e.includes('missing "description"')))

  await rm(dir, { recursive: true, force: true })
  await rm(dir2, { recursive: true, force: true })
})

test('invalid kebab-case name is an error', async () => {
  const dir = await skill('name: Bad Name\ndescription: x'.replace('x', 'a description that is long enough here'))
  const r = await lintSkill(dir)
  assert.ok(r.errors.some((e) => e.includes('kebab-case')))
  await rm(dir, { recursive: true, force: true })
})

test('name/dirname mismatch is a warning', async () => {
  const dir = await skill('name: other-name\ndescription: a description that is long enough here')
  const r = await lintSkill(dir)
  assert.ok(r.warnings.some((w) => w.includes('does not match directory name')))
  assert.equal(r.errors.length, 0)
  await rm(dir, { recursive: true, force: true })
})

test('tiny description warns, huge description warns', async () => {
  const dir = await skill('name: tiny\ndescription: x')
  const r = await lintSkill(dir)
  assert.ok(r.warnings.some((w) => w.includes('very short')))

  const dir2 = await skill('name: huge\ndescription: ' + 'y'.repeat(1100))
  const r2 = await lintSkill(dir2)
  assert.ok(r2.warnings.some((w) => w.includes('1100 chars')))

  await rm(dir, { recursive: true, force: true })
  await rm(dir2, { recursive: true, force: true })
})

test('nested SKILL.md is an error', async () => {
  const dir = await skill('name: outer\ndescription: an outer skill for nesting checks here')
  await mkdir(path.join(dir, 'sub'), { recursive: true })
  await writeFile(
    path.join(dir, 'sub', 'SKILL.md'),
    '---\nname: sub\ndescription: nested skill\n---\n\nbody\n',
    'utf8'
  )
  const r = await lintSkill(dir)
  assert.ok(r.errors.some((e) => e.includes('nested SKILL.md')))
  await rm(dir, { recursive: true, force: true })
})

test('broken relative links warn, existing ones do not', async () => {
  const body = 'see [doc](references/a.md) and [site](https://example.com) and [missing](references/b.md)\n'
  const dir = await skill('name: linker\ndescription: a skill that links to reference files around', body)
  await mkdir(path.join(dir, 'references'), { recursive: true })
  await writeFile(path.join(dir, 'references', 'a.md'), 'doc', 'utf8')
  const r = await lintSkill(dir)
  assert.ok(r.warnings.some((w) => w.includes('references/b.md')))
  assert.ok(!r.warnings.some((w) => w.includes('references/a.md')))
  assert.ok(!r.warnings.some((w) => w.includes('example.com')))
  await rm(dir, { recursive: true, force: true })
})

test('lintPath handles a skills/ collection and flags orphans', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'aipx-lintcoll-'))
  await mkdir(path.join(tmp, 'skills', 'alpha'), { recursive: true })
  await writeFile(
    path.join(tmp, 'skills', 'alpha', 'SKILL.md'),
    '---\nname: alpha\ndescription: a collection skill that is fine\n---\n\nbody\n',
    'utf8'
  )
  await mkdir(path.join(tmp, 'skills', 'empty-dir'), { recursive: true })

  const { results, orphans } = await lintPath(tmp)
  assert.equal(results.length, 1)
  assert.equal(results[0].name, 'alpha')
  assert.deepEqual(orphans.map((o) => o.replace(/\\/g, '/')), ['skills/empty-dir'])

  await rm(tmp, { recursive: true, force: true })
})

// Dogfood: the skills we ship must always pass our own linter.
const repoSkills = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills')

test('dogfood: bundled skills pass aipx lint', async () => {
  const { results, orphans } = await lintPath(repoSkills)
  assert.deepEqual(orphans, [])
  const bad = results.filter((r) => r.errors.length > 0)
  assert.deepEqual(bad, [], `bundled skills with lint errors: ${JSON.stringify(bad)}`)
})
