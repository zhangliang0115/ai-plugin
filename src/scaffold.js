import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { exists, c, isValidSkillName, ok } from './util.js'

const execFileAsync = promisify(execFile)

async function gitAuthor() {
  try {
    const { stdout } = await execFileAsync('git', ['config', 'user.name'])
    const name = stdout.trim()
    if (name) return name
  } catch {
    // no git config — fall through
  }
  return 'Your Name'
}

const DSH_INDEX_TEMPLATE = `import { readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = '__PKG_NAME__'
export const inject = ['skills']

const HERE = dirname(fileURLToPath(import.meta.url))
const SKILL_DIRS = __SKILL_DIRS__

const FRONTMATTER = /^---\\r?\\n([\\s\\S]*?)\\r?\\n---\\r?\\n?/

function readFrontmatterScalars(block) {
  const out = {}
  const lines = block.split(/\\r?\\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^([A-Za-z][\\w-]*):[ \\t]*(.*)$/.exec(lines[i])
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
      if (!/^[ \\t]/.test(line)) break
      folded.push(line.trim())
      i = j
    }
    const joined = folded.join(' ').replace(/\\s+/g, ' ').trim()
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
          ctx.logger.info('__PKG_NAME__: registered the "%s" skill', skill.name)
        })
        .catch((e) => ctx.logger.warn('__PKG_NAME__: failed to register %s: %o', rel, e))
    }
    return () => {
      disposed = true
      for (const dispose of disposers) dispose?.()
    }
  })
}
`

const SYNC_SCRIPT = `#!/usr/bin/env node
// Sync repo-root skills/ into dsh-plugin/skills/ (the copies a dsh profile
// installs). Run after editing any SKILL.md; CI fails on drift.
import { cp, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
await rm(path.join(root, 'dsh-plugin', 'skills'), { recursive: true, force: true })
await cp(path.join(root, 'skills'), path.join(root, 'dsh-plugin', 'skills'), { recursive: true })
console.log('synced skills/ -> dsh-plugin/skills/')
`

const DRIFT_SCRIPT = `#!/usr/bin/env node
// Fail CI when dsh-plugin/skills/ drifts from the repo-root skills/.
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const a = path.join(root, 'skills')
const b = path.join(root, 'dsh-plugin', 'skills')

async function hashDir(dir) {
  const out = new Map()
  async function walk(d, prefix) {
    const entries = await readdir(d, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const full = path.join(d, entry.name)
      const rel = prefix ? prefix + '/' + entry.name : entry.name
      if (entry.isDirectory()) await walk(full, rel)
      else out.set(rel, (await readFile(full)).toString('base64'))
    }
  }
  await walk(dir, '')
  return out
}

const [ha, hb] = [await hashDir(a), await hashDir(b)]
const changed = [...ha.keys()].filter((k) => ha.get(k) !== hb.get(k))
const onlyA = [...ha.keys()].filter((k) => !hb.has(k))
const onlyB = [...hb.keys()].filter((k) => !ha.has(k))
if (onlyA.length || onlyB.length || changed.length) {
  console.error('dsh-plugin/skills/ has drifted from skills/ — run: node scripts/sync-dsh-skills.mjs')
  process.exit(1)
}
console.log('dsh-plugin/skills/ is in sync with skills/')
`

const CI_TEMPLATE = `name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: node scripts/check-drift.mjs
      - run: npx -y github:zhangliang0115/ai-plugin lint skills
`

const README_TEMPLATE = `# __NAME__

__DESCRIPTION__

One repo, every agent: the same \`skills/\` sources a Claude Code marketplace, a
DeepSeek Harness (\`dsh\`) bundle, and plain skills for everything else.

## Install

\`\`\`sh
# 1. Plain skills, every agent (recommended — fans out to what the user has):
npx github:zhangliang0115/ai-plugin install __OWNER__/__NAME__

# 2. Claude Code marketplace:
#    /plugin marketplace add __OWNER__/__NAME__
#    /plugin install __NAME-plugin@__NAME__
#
# 3. DeepSeek Harness bundle:
dsh plugin --profile web add "github:__OWNER__/__NAME__#path:/dsh-plugin"
\`\`\`

## Development

- Edit skills under \`skills/\` (single source of truth)
- \`node scripts/sync-dsh-skills.mjs\` after editing any SKILL.md (CI enforces lockstep)
- \`npx -y github:zhangliang0115/ai-plugin lint skills\` before committing

## Publish checklist

- [ ] description states *when to use*, not just what it is
- [ ] works from a clean install (try the plain-skills line above)
- [ ] GitHub topics: \`agent-skills\`, \`claude-code\`, \`dsh-plugin\`
- [ ] PR your repo into the [aipx curated registry](https://github.com/zhangliang0115/ai-plugin/blob/main/registry/index.json)
`

/**
 * Scaffold a dual-target skill repo: plain skills/ + Claude Code marketplace +
 * DeepSeek Harness bundle, with drift-checked copies and CI.
 */
export async function newRepo(nameInput, opts = {}) {
  // Repo names must be valid as-is — GitHub repos can't contain spaces or
  // most symbols, and the skill name should match the repo name exactly.
  if (!isValidSkillName(nameInput)) {
    throw new Error(`"${nameInput}" is not a valid repo/skill name — use kebab-case (lowercase letters, digits, hyphens)`)
  }
  const name = nameInput
  const parent = opts.dir ? path.resolve(opts.dir) : process.cwd()
  const root = path.join(parent, name)
  if ((await exists(root)) && !opts.force) {
    throw new Error(`directory already exists: ${root} — use --force to overwrite`)
  }

  const description = (opts.description ?? 'TODO: one sentence — what it does AND when to use it (this is the trigger agents match against).').trim()
  const author = await gitAuthor()
  const owner = opts.owner ?? 'your-github-username'

  const skillMd = [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    '---',
    '',
    `# ${name}`,
    '',
    '<!-- Write instructions for the agent. Be concrete; assume a competent engineer.',
    '     Keep this file under ~500 lines and put depth in references/*.md.',
    '     Validate with: aipx lint skills -->',
    '',
    '## When to use',
    '',
    '- TODO: bullet the situations that should trigger this skill',
    '',
    '## Instructions',
    '',
    '1. TODO: step-by-step guidance',
    '',
  ].join('\n')

  const files = new Map([
    [path.join('skills', name, 'SKILL.md'), skillMd],
    [path.join('.claude-plugin', 'plugin.json'), JSON.stringify({ name: `${name}-plugin`, version: '0.1.0', description, author }, null, 2) + '\n'],
    [path.join('.claude-plugin', 'marketplace.json'), JSON.stringify({
      name,
      owner: { name: owner },
      plugins: [{ name: `${name}-plugin`, source: './', description, category: 'productivity', keywords: ['agent-skills', 'skills'] }],
    }, null, 2) + '\n'],
    [path.join('dsh-plugin', 'package.json'), JSON.stringify({
      name: `${name}-dsh`,
      version: '0.1.0',
      description: `DeepSeek Harness bundle for the ${name} skill`,
      type: 'module',
      main: 'index.js',
      exports: { '.': './index.js', './cordis.patch.yml': './cordis.patch.yml', './package.json': './package.json' },
      files: ['index.js', 'cordis.patch.yml', 'skills'],
      dsh: { bundle: { patch: './cordis.patch.yml' } },
      keywords: ['dsh', 'dsh-plugin', 'deepseek-harness', 'agent-skills'],
      author,
      license: 'MIT',
      engines: { node: '>=20' },
    }, null, 2) + '\n'],
    [path.join('dsh-plugin', 'cordis.patch.yml'), `- insert:\n    - id: ${name}\n      name: ${name}-dsh\n`],
    [path.join('dsh-plugin', 'index.js'), DSH_INDEX_TEMPLATE.replaceAll('__PKG_NAME__', `${name}-dsh`).replaceAll('__SKILL_DIRS__', JSON.stringify([`skills/${name}`]))],
    [path.join('dsh-plugin', 'skills', name, 'SKILL.md'), skillMd],
    [path.join('scripts', 'sync-dsh-skills.mjs'), SYNC_SCRIPT],
    [path.join('scripts', 'check-drift.mjs'), DRIFT_SCRIPT],
    [path.join('.github', 'workflows', 'ci.yml'), CI_TEMPLATE],
    ['README.md', README_TEMPLATE.replaceAll('__NAME__', name).replaceAll('__DESCRIPTION__', description).replaceAll('__OWNER__', owner)],
    ['LICENSE', `MIT License\n\nCopyright (c) ${new Date().getFullYear()} ${author}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n`],
    ['.gitignore', 'node_modules/\n.DS_Store\n*.log\n'],
  ])

  for (const [rel, content] of files) {
    const full = path.join(root, rel)
    await mkdir(path.dirname(full), { recursive: true })
    await writeFile(full, content, 'utf8')
  }

  ok(`scaffolded ${c.bold(root)}`)
  console.log(`
next steps:
  1. cd ${name}
  2. edit skills/${name}/SKILL.md (fill the TODOs — description is the trigger)
  3. npx -y github:zhangliang0115/ai-plugin lint skills
  4. git init && git add -A && git commit -m "feat: initial skill"
  5. create the GitHub repo as ${owner}/${name} (add topics: agent-skills, claude-code, dsh-plugin)
  6. update the install lines in README.md with your real username`)
  return { root, files: files.size }
}
