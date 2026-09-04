import { readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'ai-plugin-toolkit'
export const inject = ['skills']

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * The bundled skill folders. `skills/` next to index.js is what `dsh plugin
 * add "github:zhangliang0115/ai-plugin#path:/dsh-plugin"` ships — the copies
 * are kept in lockstep with the repo-root `skills/` by CI (check-drift).
 */
const SKILL_DIRS = [
  'skills/skill-author',
  'skills/dsh-plugin-dev',
  'skills/claude-plugin-dev',
  'skills/deepseek-cost-router',
  'skills/deepseek-migration',
  'skills/skill-portability-audit',
]

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/**
 * Read the `name` and `description` scalars out of a YAML frontmatter block.
 * Deliberately not a YAML parser: the bundle ships with zero dependencies and
 * SKILL.md headers only ever carry flat scalars or `>`/`|` blocks.
 */
function readFrontmatterScalars(block) {
  const out = {}
  const lines = block.split(/\r?\n/)

  for (let i = 0; i < lines.length; i += 1) {
    const match = /^([A-Za-z][\w-]*):[ \t]*(.*)$/.exec(lines[i])
    if (match === null) continue

    const key = match[1]
    const inline = match[2].trim()

    if (inline !== '' && !inline.startsWith('>') && !inline.startsWith('|')) {
      out[key] = inline.replace(/^['"]|['"]$/g, '')
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
    if (joined !== '') out[key] = joined
  }

  return out
}

async function loadSkill(dir) {
  const path = join(dir, 'SKILL.md')
  const raw = await readFile(path, 'utf8')
  const match = FRONTMATTER.exec(raw)
  if (match === null) return undefined

  const { name, description } = readFrontmatterScalars(match[1])
  if (name === undefined || description === undefined) return undefined

  // `references/` and `scripts/` sit next to SKILL.md; expose the folder so
  // relative links keep working inside the agent.
  let resourceBase
  try {
    if ((await stat(dir)).isDirectory()) resourceBase = { kind: 'directory', path: dir }
  } catch {
    // a flat SKILL.md still registers; only relative links go dark
  }

  return {
    name,
    description,
    content: raw.replace(FRONTMATTER, ''),
    source: 'bundled',
    path,
    resourceBase,
  }
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - the plugin context,
 *   with the `skills` service injected.
 */
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
          ctx.logger.info('ai-plugin-toolkit: registered the "%s" skill', skill.name)
        })
        .catch((e) => {
          ctx.logger.warn('ai-plugin-toolkit: failed to register %s: %o', rel, e)
        })
    }

    return () => {
      disposed = true
      for (const dispose of disposers) dispose?.()
    }
  })
}
