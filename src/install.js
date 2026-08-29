import path from 'node:path'
import { detectAgents, projectRootsFor, userRootsFor } from './agents.js'
import { detectPayload } from './detect.js'
import { cleanup, downloadRepoTarball } from './github.js'
import { recordInstall } from './manifest.js'
import { parseSource } from './source.js'
import {
  c,
  copyDir,
  ensureDir,
  exists,
  expandTilde,
  info,
  isDir,
  listDirs,
  ok,
  warn,
} from './util.js'
import { readFile, writeFile, mkdir } from 'node:fs/promises'

/**
 * Install a skill/plugin payload into every detected agent's skill root.
 *
 * opts:
 *   agents   comma-separated agent ids (overrides detection)
 *   all      include community-tier agents during detection
 *   project  true (cwd) or a directory path → install into project-scoped
 *            roots (.claude/skills, .agents/skills, .github/skills, …)
 *            instead of user roots
 *   force    overwrite skills that already exist at a target
 *   dryRun   print the plan without writing anything
 *   roots    explicit absolute roots (used by tests)
 */
export async function install(sourceInput, opts = {}) {
  const source = await parseSource(sourceInput)

  let payloadDir
  let temp = null
  if (source.kind === 'local') {
    payloadDir = source.path
  } else {
    info(`fetching ${c.bold(source.owner + '/' + source.repo)} …`)
    const dl = await downloadRepoTarball(source)
    temp = dl.temp
    payloadDir = source.sub ? path.join(dl.root, source.sub) : dl.root
    if (!(await exists(payloadDir))) {
      const top = (await listDirs(dl.root)).join(', ')
      cleanup(temp)
      throw new Error(
        `subdirectory "${source.sub}" not found in ${source.owner}/${source.repo}` +
          (top ? ` — top-level entries: ${top}` : '')
      )
    }
  }

  const payload = await detectPayload(payloadDir)

  // temp stays alive until the install body below finishes: payload files are
  // copied (not just parsed), so cleanup happens in the finally block.
  try {
    if (payload.skills.length === 0) {
      for (const hint of payload.hints) info(hint)
      throw new Error(
        `nothing to install — the payload is a ${payload.kind} without bundled skills; follow the hints above`
      )
    }

    const agents = opts.roots ? opts.roots.map((r) => r.agent) : await resolveTargets(opts)
    const roots = opts.roots ?? (await resolveRoots(agents, opts))

    console.log()
    ok(`detected ${payload.kind} with ${payload.skills.length} skill(s):`)
    for (const s of payload.skills) {
      console.log(
        `    ${c.bold(s.name)}${s.description ? c.dim(` — ${truncate(s.description, 90)}`) : ''}`
      )
    }
    console.log()
    ok(`target roots:`)
    for (const r of roots) console.log(`    ${r.root} ${c.dim(`(${r.agent.label})`)}`)
    console.log()

    if (payload.hints.length > 0) {
      for (const hint of payload.hints) info(hint)
      console.log()
    }

    const plan = []
    for (const skill of payload.skills) {
      for (const r of roots) {
        const dest = path.join(r.root, skill.name)
        plan.push({ skill, root: r, dest })
      }
    }

    if (opts.dryRun) {
      info('dry run — nothing written. Files that would be created:')
      for (const p of plan) {
        const existsAlready = await exists(p.dest)
        console.log(
          `    ${p.dest}${existsAlready ? c.yellow('  (exists — skipped unless --force)') : ''}`
        )
      }
      return { dryRun: true, plan: plan.length }
    }

    const installedRoots = new Set()
    let created = 0
    let skipped = 0
    for (const p of plan) {
      const already = await exists(p.dest)
      if (already && !opts.force) {
        skipped += 1
        continue
      }
      await ensureDir(p.root.root)
      if (p.skill.normalized) {
        await mkdir(p.dest, { recursive: true })
        const body = await readFile(p.skill.file, 'utf8')
        await writeFile(path.join(p.dest, 'SKILL.md'), body, 'utf8')
      } else {
        await copyDir(p.skill.dir, p.dest)
      }
      installedRoots.add(p.dest)
      created += 1
    }

    if (skipped > 0) {
      warn(`${skipped} target(s) already existed — re-run with --force to overwrite`)
    }

    if (created > 0) {
      const bySkill = new Map()
      for (const p of plan) {
        if (!installedRoots.has(p.dest)) continue
        const list = bySkill.get(p.skill.name) ?? []
        list.push(p.root.root) // the agent root dir, not the per-skill dest
        bySkill.set(p.skill.name, list)
      }
      for (const [name, rootsHit] of bySkill) {
        const skill = payload.skills.find((s) => s.name === name)
        await recordInstall({
          name,
          description: skill?.description ?? '',
          source: source.label,
          kind: payload.kind,
          scope: opts.project ? 'project' : 'user',
          roots: rootsHit,
        })
        ok(`installed ${c.bold(name)} into ${rootsHit.length} root(s)`)
      }
    }

    for (const a of agents) {
      if (a.note) info(`${a.label}: ${a.note}`)
    }

    return { installed: created, skipped, skills: payload.skills.map((s) => s.name) }
  } finally {
    if (temp) cleanup(temp)
  }
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

async function resolveTargets(opts) {
  const { AGENTS } = await import('./agents.js')
  if (opts.agents) {
    const ids = opts.agents.split(',').map((s) => s.trim()).filter(Boolean)
    const unknown = ids.filter((id) => !AGENTS.some((a) => a.id === id))
    if (unknown.length > 0) {
      throw new Error(
        `unknown agent id(s): ${unknown.join(', ')} — known ids: ${AGENTS.map((a) => a.id).join(', ')}`
      )
    }
    return AGENTS.filter((a) => ids.includes(a.id))
  }
  // Project installs commit skills into the repo for the whole team, so they
  // target every official-tier agent with a project root regardless of what
  // is installed on this machine; community tiers stay opt-in.
  if (opts.project) {
    return AGENTS.filter((a) => a.projectRoot && (a.tier === 'official' || opts.all))
  }
  const detected = await detectAgents()
  const targets = detected.filter((a) => a.installed && (a.tier === 'official' || opts.all))
  if (targets.length === 0) {
    throw new Error(
      'no installed agents detected — pass --agents <id,id> to choose targets explicitly, or --all to write every known root'
    )
  }
  return targets
}

async function resolveRoots(agents, opts) {
  if (opts.roots) return opts.roots // test hook: [{agent, root}]

  if (opts.project) {
    const dir = opts.project === true ? process.cwd() : expandTilde(opts.project)
    if (!(await isDir(dir))) throw new Error(`project directory not found: ${dir}`)
    const roots = projectRootsFor(agents, dir)
    if (roots.length === 0) {
      throw new Error(
        'none of the target agents has a project-scoped skill root — pass --agents with ids that do (see aipx --help)'
      )
    }
    return roots
  }

  const pairs = await userRootsFor(agents)
  const seen = new Map()
  for (const p of pairs) {
    if (!seen.has(p.root)) seen.set(p.root, p)
  }
  return [...seen.values()]
}
