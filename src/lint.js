import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { exists, isDir, listDirs, parseFrontmatter } from './util.js'
import { isValidSkillName } from './util.js'

const MAX_BODY_LINES = 500
const MAX_DESCRIPTION = 1024
const MIN_DESCRIPTION = 20

/**
 * Lint one skill directory (must contain SKILL.md). Returns {name, errors,
 * warnings} — errors mean spec violations agents will reject or mis-handle,
 * warnings mean quality issues that hurt trigger/discovery quality.
 */
export async function lintSkill(skillDir) {
  const errors = []
  const warnings = []
  const dirName = path.basename(skillDir)

  const raw = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8')
  const hasFrontmatter = /^---\r?\n/.test(raw)
  if (!hasFrontmatter) {
    errors.push('missing YAML frontmatter block (--- name: … description: … ---)')
    return { dir: skillDir, name: dirName, errors, warnings }
  }

  const { data, body } = parseFrontmatter(raw)

  const name = data.name
  if (!name) {
    errors.push('frontmatter is missing "name"')
  } else if (!isValidSkillName(name)) {
    errors.push(`name "${name}" is not kebab-case (lowercase letters, digits, hyphens; max 64 chars)`)
  } else if (name !== dirName) {
    warnings.push(`frontmatter name "${name}" does not match directory name "${dirName}"`)
  }

  const description = data.description
  if (!description) {
    errors.push('frontmatter is missing "description" — it is the trigger agents match requests against')
  } else {
    if (description.length > MAX_DESCRIPTION) {
      warnings.push(`description is ${description.length} chars (max ${MAX_DESCRIPTION}) — tighten it`)
    }
    if (description.length < MIN_DESCRIPTION) {
      warnings.push(
        `description is very short (${description.length} chars) — state what it does AND when to use it`
      )
    }
  }

  const bodyLines = body.split(/\r?\n/).length
  if (bodyLines > MAX_BODY_LINES) {
    warnings.push(
      `SKILL.md body is ${bodyLines} lines (over ${MAX_BODY_LINES}) — move depth into references/*.md`
    )
  }

  for (const nested of await findNestedSkills(skillDir)) {
    errors.push(`nested SKILL.md at ${path.relative(skillDir, nested)} — agents only discover direct children of a skill root`)
  }

  for (const rel of await missingRelativeLinks(skillDir, body)) {
    warnings.push(`relative link target "${rel}" does not exist`)
  }

  return { dir: skillDir, name: (typeof name === 'string' && isValidSkillName(name)) ? name : dirName, errors, warnings }
}

async function findNestedSkills(skillDir) {
  const found = []
  async function walk(dir, depth) {
    if (depth > 4) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue
      const full = path.join(dir, e.name)
      if (await exists(path.join(full, 'SKILL.md'))) found.push(full)
      await walk(full, depth + 1)
    }
  }
  await walk(skillDir, 0)
  return found
}

const LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g

async function missingRelativeLinks(skillDir, body) {
  const missing = []
  for (const match of body.matchAll(LINK_RE)) {
    const href = match[1]
    if (/^(https?:|mailto:|#|\/\/)/.test(href)) continue
    const [filePart] = href.split('#')
    if (!filePart || filePart.startsWith('/')) continue
    if (!(await exists(path.join(skillDir, filePart)))) missing.push(filePart)
  }
  return missing
}

/**
 * Lint a path: a single skill dir, a skills/ collection dir, or any directory
 * whose direct children are skill dirs. Returns an array of results plus an
 * `orphan` list (child dirs without SKILL.md).
 */
export async function lintPath(target) {
  if (!(await isDir(target))) {
    throw new Error(`not a directory: ${target}`)
  }
  if (await exists(path.join(target, 'SKILL.md'))) {
    return { results: [await lintSkill(target)], orphans: [] }
  }

  const skillsDir = path.join(target, 'skills')
  const scanDir = (await isDir(skillsDir)) ? skillsDir : target
  const children = await listDirs(scanDir)

  const results = []
  const orphans = []
  for (const child of children) {
    const dir = path.join(scanDir, child)
    if (await exists(path.join(dir, 'SKILL.md'))) {
      results.push(await lintSkill(dir))
    } else {
      orphans.push(path.relative(target, dir))
    }
  }

  if (results.length === 0 && orphans.length === 0) {
    throw new Error(
      `no skills found under ${target} — expected <dir>/SKILL.md subdirectories or a skills/ collection`
    )
  }
  return { results, orphans }
}
