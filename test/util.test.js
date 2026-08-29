import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFrontmatter, normalizeSkillName, isValidSkillName } from '../src/util.js'

test('parseFrontmatter reads inline scalars', () => {
  const { data, body } = parseFrontmatter('---\nname: foo\ndescription: does things\n---\n\n# Body\n')
  assert.equal(data.name, 'foo')
  assert.equal(data.description, 'does things')
  assert.equal(body.trim(), '# Body')
})

test('parseFrontmatter strips surrounding quotes', () => {
  const { data } = parseFrontmatter("---\nname: 'quoted'\ndescription: \"dq\"\n---\n")
  assert.equal(data.name, 'quoted')
  assert.equal(data.description, 'dq')
})

test('parseFrontmatter folds block scalars into one line', () => {
  const text = [
    '---',
    'name: blocky',
    'description: >-',
    '  first part',
    '  second part',
    'license: MIT',
    '---',
    'body',
  ].join('\n')
  const { data } = parseFrontmatter(text)
  assert.equal(data.name, 'blocky')
  assert.equal(data.description, 'first part second part')
  assert.equal(data.license, 'MIT')
})

test('parseFrontmatter survives text without frontmatter', () => {
  const { data, body } = parseFrontmatter('just text')
  assert.deepEqual(data, {})
  assert.equal(body, 'just text')
})

test('normalizeSkillName produces kebab-case', () => {
  assert.equal(normalizeSkillName('Hello World'), 'hello-world')
  assert.equal(normalizeSkillName('foo_bar--baz!'), 'foo-bar-baz')
  assert.equal(normalizeSkillName('  --Weird Name--  '), 'weird-name')
})

test('normalizeSkillName truncates to 64 chars', () => {
  const long = 'a'.repeat(100)
  assert.ok(normalizeSkillName(long).length <= 64)
})

test('isValidSkillName enforces the spec', () => {
  assert.ok(isValidSkillName('foo'))
  assert.ok(isValidSkillName('foo-bar-2'))
  assert.ok(!isValidSkillName('Foo'))
  assert.ok(!isValidSkillName('-foo'))
  assert.ok(!isValidSkillName('foo bar'))
})
