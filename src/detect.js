import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { exists, isDir, listDirs, parseFrontmatter } from './util.js'
import { isValidSkillName, normalizeSkillName } from './util.js'

/**
 * Inspect a payload directory and work out what it ships:
 *
 *  - 'skill'        a single <dir>/SKILL.md
 *  - 'skills'       a skills/ collection (and/or flat *.md skill files)
 *  - 'dsh-plugin'   a DeepSeek Harness bundle (package.json with dsh.bundle)
 *  - 'claude-plugin' a Claude Code plugin (.claude-plugin/plugin.json)
 *
 * A payload can be several kinds at once (a Claude plugin that also ships a
 * dsh bundle); `kinds` lists everything detected, `skills` collects every
 * installable skill, `hints` carries per-kind follow-up advice.
 */
export async function detectPayload(dir, source = null, repoRel = '') {
  const kinds = []
  const hints = []
  const skills = []

  const ghLabel = source?.kind === 'github' ? `${source.owner}/${source.repo}` : null

  const claudeMarker = path.join(dir, '.claude-plugin', 'plugin.json')
  if (await exists(claudeMarker)) {
    kinds.push('claude-plugin')
    hints.push(
      'Claude Code plugin detected — you can also add this repo as a marketplace directly:\n' +
        `    /plugin marketplace add ${ghLabel ?? '<owner>/<repo>'}\n` +
        '  then: /plugin install <plugin-name>@<marketplace-name>'
    )
  }

  let pkg = null
  const pkgPath = path.join(dir, 'package.json')
  if (await exists(pkgPath)) {
    try {
      pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
    } catch {
      // unreadable package.json — ignore, other detectors still run
    }
  }
  if (pkg?.dsh?.bundle?.patch) {
    kinds.push('dsh-plugin')
    const ghRef = ghLabel
      ? repoRel
        ? `github:${ghLabel}#path:/${repoRel}`
        : `github:${ghLabel}`
      : 'github:<owner>/<repo>#path:/<subdir>'
    hints.push(
      'DeepSeek Harness bundle detected — install it into a dsh profile with:\n' +
        `    dsh plugin --profile <profile> add "${ghRef}"`
    )
  }

  const skillsDir = path.join(dir, 'skills')
  if (await isDir(skillsDir)) {
    for (const name of await listDirs(skillsDir)) {
      const skillDir = path.join(skillsDir, name)
      const meta = await readSkillDir(skillDir)
      if (meta) {
        skills.push(meta)
        if (!kinds.includes('skills')) kinds.push('skills')
      }
    }
  }

  const single = await readSkillDir(dir)
  if (single) {
    kinds.push('skill')
    skills.push(single)
  }

  // Flat *.md skill files (a dsh-only convenience) — normalize them into
  // directories so every agent can read them. SKILL.md itself is not a flat
  // skill; it's handled by the single-skill detector above.
  const flat = []
  for (const name of await readdir(dir).catch(() => [])) {
    if (!name.endsWith('.md') || name === 'README.md' || name === 'SKILL.md' || name.startsWith('.')) continue
    const full = path.join(dir, name)
    if (!(await isDir(full))) {
      const { data } = parseFrontmatter(await readFile(full, 'utf8'))
      if (data.name && data.description) flat.push({ fileName: name, data })
    }
  }
  if (flat.length > 0) {
    kinds.push('flat-skills')
    hints.push(
      `${flat.length} flat skill file(s) found — aipx wraps each one into <name>/SKILL.md so every agent can load it`
    )
    for (const f of flat) {
      skills.push({
        name: normalizeSkillName(f.data.name),
        dir: null,
        file: path.join(dir, f.fileName),
        description: f.data.description,
        normalized: true,
      })
    }
  }

  const unique = [...new Set(kinds)]
  if (unique.length === 0) {
    throw new Error(
      'no plugin payload found — expected SKILL.md, a skills/ directory, .claude-plugin/plugin.json, or package.json with a dsh.bundle'
    )
  }

  const kind = unique.includes('claude-plugin')
    ? 'claude-plugin'
    : unique.includes('dsh-plugin')
      ? 'dsh-plugin'
      : unique[0]

  return { kind, kinds: unique, skills: dedupe(skills), hints }
}

async function readSkillDir(skillDir) {
  const skillMd = path.join(skillDir, 'SKILL.md')
  if (!(await isDir(skillDir)) || !(await exists(skillMd))) return null
  const { data } = parseFrontmatter(await readFile(skillMd, 'utf8'))
  const name =
    normalizeSkillName(data.name) || normalizeSkillName(path.basename(skillDir))
  if (!isValidSkillName(name)) return null
  return { name, dir: skillDir, file: null, description: data.description ?? '', normalized: false }
}

function dedupe(skills) {
  const seen = new Map()
  for (const s of skills) {
    if (!seen.has(s.name)) seen.set(s.name, s)
  }
  return [...seen.values()]
}
