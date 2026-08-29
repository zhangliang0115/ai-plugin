import path from 'node:path'
import { AGENTS } from './agents.js'
import { install } from './install.js'
import { loadManifest } from './manifest.js'
import { c, expandTilde, info, warn } from './util.js'

function agentForRoot(root) {
  const match = AGENTS.find((a) => expandTilde(a.userRoot) === root)
  if (match) return match
  return { id: 'recorded', label: 'recorded root', note: null }
}

/**
 * Re-install recorded installs from their recorded source with --force.
 *
 *  - `aipx upgrade`        → upgrade everything aipx has installed
 *  - `aipx upgrade <name>` → upgrade one skill
 *
 * Entries are grouped by source so a multi-skill payload is fetched once.
 * New skills added upstream land as a side effect; skills removed upstream
 * stay on disk (aipx never deletes what it didn't record — use `remove`).
 */
export async function upgrade(name, opts = {}) {
  const manifest = await loadManifest()
  const installed = manifest.installed ?? {}

  if (name && !installed[name]) {
    throw new Error(
      `"${name}" is not recorded as an aipx install — check \`aipx list\` (hand-copied skills are not tracked)`
    )
  }

  const names = name ? [name] : Object.keys(installed)
  if (names.length === 0) {
    info('nothing to upgrade — no aipx installs recorded yet (aipx install owner/repo)')
    return {}
  }

  const bySource = new Map()
  for (const n of names) {
    const entry = installed[n]
    const group = bySource.get(entry.source) ?? {
      source: entry.source,
      skills: [],
      roots: new Map(),
    }
    group.skills.push(n)
    for (const root of entry.roots ?? []) {
      // older manifests recorded the per-skill destination; normalize to the
      // containing root so re-install doesn't nest
      let realRoot = root
      const suffix = `/${n}`
      if (root.endsWith(suffix)) realRoot = root.slice(0, -suffix.length)
      group.roots.set(realRoot, agentForRoot(realRoot))
    }
    bySource.set(entry.source, group)
  }

  const results = {}
  let failed = 0
  for (const group of bySource.values()) {
    const roots = [...group.roots.entries()].map(([root, agent]) => ({ agent, root }))
    info(
      `upgrading ${c.bold(group.source)} ` +
        c.dim(`(${group.skills.length} skill(s), ${roots.length} root(s))`)
    )
    try {
      results[group.source] = await install(group.source, { force: true, roots })
    } catch (e) {
      failed += 1
      warn(`upgrade failed for ${group.source}: ${e.message}`)
    }
  }

  console.log()
  if (failed > 0) {
    warn(`${failed} source(s) failed to upgrade — likely a deleted/renamed upstream repo`)
  }
  return results
}
