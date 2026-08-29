import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { AGENTS } from './agents.js'
import { exists, expandTilde, isSymlink, listDirs, parseFrontmatter } from './util.js'

/**
 * List installed skills per agent root. `--json` returns a machine-readable
 * object instead of printing.
 */
export async function list(opts = {}) {
  const out = {}

  const scanRoot = async (agent, root) => {
    const skills = await skillsIn(root)
    if (skills.length > 0) out[agent.id] = { label: agent.label, root, skills }
  }

  if (opts.project) {
    // project-scope view: scan every agent's project root under the given dir
    const dir = opts.project === true ? process.cwd() : expandTilde(opts.project)
    for (const agent of AGENTS) {
      if (!agent.projectRoot) continue
      await scanRoot(agent, path.join(dir, agent.projectRoot))
    }
    if (Object.keys(out).length === 0 && !opts.json) {
      console.log(`no project skills found under ${dir} — install with: aipx install owner/repo --project ${dir === process.cwd() ? '.' : `"${dir}"`}`)
    }
    if (opts.json) return out
    for (const entry of Object.values(out)) {
      console.log(`\n${entry.label} (${entry.root})`)
      for (const s of entry.skills) {
        const mark = s.link ? '(synced link)' : ''
        const desc = s.description ? ` — ${truncate(s.description, 80)}` : ''
        console.log(`    ${s.name} ${mark}${desc}`)
      }
    }
    console.log()
    return out
  }

  for (const agent of AGENTS) {
    const root = expandTilde(agent.userRoot)
    await scanRoot(agent, root)
  }

  if (opts.json) return out

  const any = Object.keys(out).length > 0
  if (!any) {
    console.log('no skills found in any known agent root — install one with: aipx install owner/repo')
    return out
  }

  for (const entry of Object.values(out)) {
    console.log(`\n${entry.label} (${entry.root})`)
    for (const s of entry.skills) {
      const mark = s.link ? '(synced link)' : ''
      const desc = s.description ? ` — ${truncate(s.description, 80)}` : ''
      console.log(`    ${s.name} ${mark}${desc}`)
    }
  }
  console.log()
  return out
}

async function skillsIn(root) {
  const out = []
  for (const name of await listDirs(root)) {
    const skillMd = path.join(root, name, 'SKILL.md')
    if (!(await exists(skillMd))) continue
    let description = ''
    try {
      const raw = await readFile(skillMd, 'utf8')
      description = parseFrontmatter(raw).data.description ?? ''
    } catch {
      description = ''
    }
    const link = await isSymlink(path.join(root, name))
    out.push({ name, description, link })
  }
  return out
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
