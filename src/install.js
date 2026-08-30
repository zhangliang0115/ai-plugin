import path from 'node:path'
import { AGENTS, projectRootsFor, SYNC_PRIMARY } from './agents.js'
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
 * Install a skill/plugin payload.
 *
 * User scope (default): one copy into the shared standard root
 * `~/.agents/skills` — read natively by DeepSeek Harness (dsh) and Codex CLI.
 * `--project [path]` instead writes team-shared copies into the project's
 * per-agent roots (.claude/skills, .agents/skills, .github/skills, …).
 *
 * opts:
 *   agents   comma-separated agent ids — narrows the project roots
 *   all      include community-tier project roots
 *   project  true (cwd) or a directory path → project-scoped install
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

  const payload = await detectPayload(payloadDir, source, source.sub ?? '')

  // temp stays alive until the install body below finishes: payload files are
  // copied (not just parsed), so cleanup happens in the finally block.
  try {
    // MCP-config payloads install server definitions instead of skills.
    if (payload.mcpServers && payload.mcpServers.length > 0) {
      const res = await installMcpServers(payload, source, opts)
      return res
    }

    if (payload.skills.length === 0) {
      for (const hint of payload.hints) info(hint)
      throw new Error(
        `nothing to install — the payload is a ${payload.kind} without bundled skills; follow the hints above`
      )
    }

    const roots = opts.roots ?? (await resolveRoots(opts))

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

    for (const a of roots.map((r) => r.agent)) {
      if (a.note) info(`${a.label}: ${a.note}`)
    }

    return { installed: created, skipped, skills: payload.skills.map((s) => s.name) }
  } finally {
    if (temp) cleanup(temp)
  }
}

/**
 * Install MCP server definitions from an mcp-config payload. Default targets
 * are official-tier user configs; `--project` writes the team-shared project
 * configs (`.mcp.json`, `.cursor/mcp.json`) instead.
 */
async function installMcpServers(payload, source, opts) {
  const { mcpTargets, MCP_PROJECT_TARGETS, writeServer } = await import('./mcp.js')

  let destinations
  if (opts.project) {
    const dir = opts.project === true ? process.cwd() : expandTilde(opts.project)
    if (!(await isDir(dir))) throw new Error(`project directory not found: ${dir}`)
    destinations = MCP_PROJECT_TARGETS.map((t) => ({ ...t, resolvedFile: path.join(dir, t.file) }))
  } else {
    destinations = mcpTargets(opts.mcpHome)
  }
  destinations = destinations.filter((t) => t.tier === 'official' || opts.all)
  if (opts.agents) {
    const ids = opts.agents.split(',').map((s) => s.trim()).filter(Boolean)
    const unknown = ids.filter((id) => !destinations.some((t) => t.agentId === id))
    if (unknown.length > 0) {
      throw new Error(`unknown agent id(s): ${unknown.join(', ')} — known MCP targets: ${MCP_PROJECT_TARGETS.map((t) => t.agentId).join(', ')}, ${mcpTargets(opts.mcpHome).map((t) => t.agentId).join(', ')}`)
    }
    destinations = destinations.filter((t) => ids.includes(t.agentId))
  }

  console.log()
  ok(`detected MCP config with ${payload.mcpServers.length} server definition(s):`)
  for (const s of payload.mcpServers) {
    console.log(`    ${c.bold(s.name)}`)
  }
  console.log()
  ok('target configs:')
  for (const t of destinations) console.log(`    ${t.resolvedFile}`)
  console.log()
  for (const hint of payload.hints) info(hint)
  console.log()

  if (opts.dryRun) {
    info('dry run — nothing written.')
    for (const s of payload.mcpServers) {
      for (const t of destinations) console.log(`    add ${s.name} → ${t.resolvedFile}`)
    }
    return { dryRun: true, plan: payload.mcpServers.length * destinations.length }
  }

  let created = 0
  for (const server of payload.mcpServers) {
    for (const t of destinations) {
      await writeServer(t, server.name, server.def)
      created += 1
      ok(`added MCP server ${c.bold(server.name)} → ${t.resolvedFile}`)
    }
  }

  if (created > 0) {
    for (const server of payload.mcpServers) {
      await recordInstall({
        name: server.name,
        description: 'MCP server',
        source: source.label,
        kind: 'mcp-config',
        scope: 'user',
        roots: destinations.map((t) => t.resolvedFile),
      })
    }
  }

  return { installed: created, skills: payload.mcpServers.map((s) => s.name) }
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

const SHARED_ROOT = {
  agent: {
    id: 'shared',
    label: 'Shared skills root (~/.agents/skills — read natively by dsh & Codex)',
    note: null,
  },
}

async function resolveRoots(opts) {
  if (opts.roots) return opts.roots // test hook: [{agent, root}]

  if (opts.project) {
    const dir = opts.project === true ? process.cwd() : expandTilde(opts.project)
    if (!(await isDir(dir))) throw new Error(`project directory not found: ${dir}`)
    let agents = AGENTS.filter((a) => a.projectRoot && (a.tier === 'official' || opts.all))
    if (opts.agents) {
      const ids = opts.agents.split(',').map((s) => s.trim()).filter(Boolean)
      const unknown = ids.filter((id) => !AGENTS.some((a) => a.id === id))
      if (unknown.length > 0) {
        throw new Error(
          `unknown agent id(s): ${unknown.join(', ')} — known ids: ${AGENTS.map((a) => a.id).join(', ')}`
        )
      }
      agents = agents.filter((a) => ids.includes(a.id))
    }
    const roots = projectRootsFor(agents, dir)
    if (roots.length === 0) {
      throw new Error(
        'none of the target agents has a project-scoped skill root — pass --agents with ids that do (see aipx --help)'
      )
    }
    return roots
  }

  // User scope: the shared standard root, nothing else. dsh and Codex read it
  // natively; other agents' separate roots are intentionally NOT written —
  // point them at this directory (or add a link) if an agent lacks support.
  return [{ ...SHARED_ROOT, root: expandTilde(SYNC_PRIMARY) }]
}