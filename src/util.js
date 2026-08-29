import { cp, lstat, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const HOME = os.homedir()

export function expandTilde(p) {
  if (p === '~') return HOME
  if (p.startsWith('~/')) return path.join(HOME, p.slice(2))
  return p
}

export function configDir() {
  // AIPX_CONFIG_DIR isolates tests (and CI) from the real user manifest.
  if (process.env.AIPX_CONFIG_DIR) return process.env.AIPX_CONFIG_DIR
  const base = process.env.XDG_CONFIG_HOME || path.join(HOME, '.config')
  return path.join(base, 'aipx')
}

export async function exists(p) {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

export async function isDir(p) {
  try {
    return (await stat(p)).isDirectory()
  } catch {
    return false
  }
}

export async function isSymlink(p) {
  try {
    return (await lstat(p)).isSymbolicLink()
  } catch {
    return false
  }
}

export async function ensureDir(p) {
  await mkdir(p, { recursive: true })
}

export async function readJson(p) {
  return JSON.parse(await readFile(p, 'utf8'))
}

export async function writeJson(p, data) {
  await ensureDir(path.dirname(p))
  await writeFile(p, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

export async function copyDir(src, dest) {
  await cp(src, dest, { recursive: true })
}

export async function removePath(p) {
  await rm(p, { recursive: true, force: true })
}

export async function linkDir(src, dest) {
  await symlink(src, dest, 'dir')
}

export async function listDirs(dir) {
  const out = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.isDirectory() || e.isSymbolicLink()) out.push(e.name)
  }
  return out.sort()
}

// ---------------------------------------------------------------------------
// SKILL.md frontmatter
// ---------------------------------------------------------------------------

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/**
 * Minimal frontmatter reader: flat `key: value` scalars plus `>` / `|` block
 * scalars, which is all a SKILL.md header ever carries. Not a YAML parser on
 * purpose — the CLI ships with zero dependencies.
 */
export function parseFrontmatter(text) {
  const m = FRONTMATTER.exec(text)
  if (m === null) return { data: {}, body: text }
  return { data: readFrontmatterScalars(m[1]), body: text.slice(m[0].length) }
}

function readFrontmatterScalars(block) {
  const out = {}
  const lines = block.split(/\r?\n/)

  for (let i = 0; i < lines.length; i += 1) {
    const match = /^([A-Za-z][\w-]*):[ \t]*(.*)$/.exec(lines[i])
    if (match === null) continue

    const key = match[1]
    const inline = match[2].trim()

    if (inline !== '' && !inline.startsWith('>') && !inline.startsWith('|')) {
      out[key] = unquote(inline)
      continue
    }

    const folded = []
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j]
      if (line.trim() === '') {
        folded.push('')
        continue
      }
      if (!/^[ \t]/.test(line)) break
      folded.push(line.trim())
      i = j
    }
    const joined = folded.join(' ').replace(/\s+/g, ' ').trim()
    if (joined !== '') out[key] = unquote(joined)
  }

  return out
}

function unquote(v) {
  return v.replace(/^['"]/, '').replace(/['"]$/, '')
}

/** The SKILL.md spec wants kebab-case names (lowercase letters, digits, hyphens). */
export function normalizeSkillName(raw) {
  const name = String(raw ?? '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return name.slice(0, 64)
}

export function isValidSkillName(name) {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(name)
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

const useColor = process.stdout.isTTY && !process.env.NO_COLOR

const paint = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s))

export const c = {
  bold: (s) => paint(1, s),
  dim: (s) => paint(2, s),
  green: (s) => paint(32, s),
  yellow: (s) => paint(33, s),
  red: (s) => paint(31, s),
  cyan: (s) => paint(36, s),
}

export const ok = (msg) => console.log(c.green('✔') + ' ' + msg)
export const warn = (msg) => console.log(c.yellow('!') + ' ' + msg)
export const fail = (msg) => console.error(c.red('✗') + ' ' + msg)
export const info = (msg) => console.log(c.dim(msg))
