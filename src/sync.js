import { readlink } from 'node:fs/promises'
import path from 'node:path'
import { detectAgents, SYNC_PRIMARY } from './agents.js'
import {
  c,
  copyDir,
  ensureDir,
  exists,
  expandTilde,
  info,
  isDir,
  isSymlink,
  linkDir,
  linkExists,
  listDirs,
  ok,
  removePath,
  warn,
} from './util.js'

/**
 * Mirror every skill in the primary root (~/.agents/skills — the shared root
 * that dsh and Codex CLI already read) into every other detected agent's
 * skill root. Default transport is a symlink so one copy serves all agents;
 * `--copy` duplicates the files instead.
 *
 * opts: agents | all | copy | from | dryRun | roots (test hook)
 */
export async function sync(opts = {}) {
  const primary = expandTilde(opts.from ?? SYNC_PRIMARY)
  if (!(await isDir(primary))) {
    throw new Error(
      `nothing to sync yet — ${primary} does not exist. Install a skill first, e.g.\n` +
        `    aipx install owner/repo`
    )
  }

  // Explicit roots (test hook / programmatic use) bypass agent detection.
  const targets =
    opts.roots ?? (await resolveTargets2(await resolveTargets(opts), primary, opts))

  if (targets.length === 0) {
    info('no other agent roots to sync into — primary root covers every detected agent already')
    return { linked: 0, copied: 0, skipped: 0, pruned: 0 }
  }

  const skillNames = []
  for (const name of await listDirs(primary)) {
    if (await exists(path.join(primary, name, 'SKILL.md'))) skillNames.push(name)
  }
  if (skillNames.length === 0 && !opts.prune) {
    throw new Error(`${primary} has no skills (no <dir>/SKILL.md found)`)
  }

  let linked = 0
  let copied = 0
  let skipped = 0
  let pruned = 0

  for (const t of targets) {
    await ensureDir(t.root)
    for (const name of skillNames) {
      const src = path.join(primary, name)
      const dest = path.join(t.root, name)
      if (await exists(dest)) {
        skipped += 1
        continue
      }
      // a dangling symlink at dest (skill deleted from primary earlier) would
      // make linkDir fail with EEXIST — clear it before linking/copying
      if (await linkExists(dest)) {
        await removePath(dest)
        pruned += 1
      }
      if (opts.dryRun) {
        console.log(`    would ${opts.copy ? 'copy' : 'link'} ${dest}`)
        continue
      }
      if (opts.copy) {
        await copyDir(src, dest)
        copied += 1
      } else {
        await linkDir(src, dest)
        linked += 1
      }
      ok(`${opts.copy ? 'copied' : 'linked'} ${c.bold(name)} → ${dest}`)
    }

    // --prune: remove links whose primary skill is gone for good
    if (opts.prune) {
      for (const entry of await listDirs(t.root)) {
        const dest = path.join(t.root, entry)
        if (!(await isSymlink(dest))) continue
        if (skillNames.includes(entry)) continue
        // dangling: lstat sees it, stat (through the link) does not
        if (!(await exists(dest))) {
          if (!opts.dryRun) await removePath(dest)
          pruned += 1
          ok(`pruned dangling link ${dest}`)
        }
      }
    }
  }

  if (opts.dryRun) {
    info('dry run — nothing written')
    return { linked, copied, skipped, pruned }
  }

  console.log()
  if (linked + copied === 0) {
    info(`everything already in sync (${skipped} already present)`)
  } else {
    const mode = opts.copy ? 'copies' : 'symlinks'
    ok(
      `synced ${linked + copied} ${mode} across ${targets.length} agent root(s)` +
        (skipped > 0 ? c.dim(` (${skipped} already present)`) : '')
    )
  }
  if (pruned > 0) ok(`pruned ${pruned} dangling link(s)`)
  if (linked > 0) {
    warn('symlinks point back to ' + primary + ' — edit skills there, every agent sees the change')
  }
  return { linked, copied, skipped, pruned }
}

function resolveTargets2(agents, primary, opts) {
  // dedupe user roots, excluding the primary itself
  const out = []
  const seen = new Set([primary])
  for (const a of agents) {
    const root = expandTilde(a.userRoot)
    if (seen.has(root)) continue
    seen.add(root)
    out.push({ agent: a, root })
  }
  return out
}

async function resolveTargets(opts) {
  if (opts.agents) {
    const { AGENTS, agentById } = await import('./agents.js')
    const ids = opts.agents.split(',').map((s) => s.trim()).filter(Boolean)
    const unknown = ids.filter((id) => !AGENTS.some((a) => a.id === id))
    if (unknown.length > 0) {
      throw new Error(`unknown agent id(s): ${unknown.join(', ')}`)
    }
    return AGENTS.filter((a) => ids.includes(a.id))
  }
  const detected = await detectAgents()
  return detected.filter((a) => a.installed && (a.tier === 'official' || opts.all))
}
