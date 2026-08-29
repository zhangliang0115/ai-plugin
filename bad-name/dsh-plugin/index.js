import { readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'bad-name-dsh'
export const inject = ['skills']

const HERE = dirname(fileURLToPath(import.meta.url))
const SKILL_DIRS = ["skills/bad-name"]

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

function readFrontmatterScalars(block) {
  const out = {}
  const lines = block.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^([A-Za-z][\w-]*):[ \t]*(.*)$/.exec(lines[i])
    if (m === null) continue
    const inline = m[2].trim()
    if (inline !== '' && !inline.startsWith('>') && !inline.startsWith('|')) {
      out[m[1]] = inline.replace(/^['"]|['"]$/g, '')
      continue
    }
    const folded = []
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j]
      if (line.trim() === '') { folded.push(''); continue }
      if (!/^[ \t]/.test(line)) break
      folded.push(line.trim())
      i = j
    }
    const joined = folded.join(' ').replace(/\s+/g, ' ').trim()
    if (joined !== '') out[m[1]] = joined
  }
  return out
}

async function loadSkill(dir) {
  const path = join(dir, 'SKILL.md')
  const raw = await readFile(path, 'utf8')
  const m = FRONTMATTER.exec(raw)
  if (m === null) return undefined
  const { name, description } = readFrontmatterScalars(m[1])
  if (name === undefined || description === undefined) return undefined
  let resourceBase
  try {
    if ((await stat(dir)).isDirectory()) resourceBase = { kind: 'directory', path: dir }
  } catch {
    // flat SKILL.md still registers
  }
  return { name, description, content: raw.replace(FRONTMATTER, ''), source: 'bundled', path, resourceBase }
}

export function apply(ctx) {
  if (ctx.skills === undefined) return
  const disposers = []
  let disposed = false
  ctx.effect(() => {
    for (const rel of SKILL_DIRS) {
      loadSkill(resolve(HERE, rel))
        .then((skill) => {
          if (disposed || skill === undefined) return
          disposers.push(ctx.skills.register(skill))
          ctx.logger.info('bad-name-dsh: registered the "%s" skill', skill.name)
        })
        .catch((e) => ctx.logger.warn('bad-name-dsh: failed to register %s: %o', rel, e))
    }
    return () => {
      disposed = true
      for (const dispose of disposers) dispose?.()
    }
  })
}
