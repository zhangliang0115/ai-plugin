import path from 'node:path'
import { AGENTS } from './agents.js'
import { loadManifest, recordRemove } from './manifest.js'
import { c, expandTilde, exists, isSymlink, ok, removePath, warn } from './util.js'

/** Remove an installed skill from every agent root where it appears. */
export async function remove(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('usage: aipx remove <skill-name>')
  }

  // scan set: every known user root + any root recorded in the manifest
  // (covers project-scoped installs and legacy dest-path entries)
  const roots = new Set(AGENTS.map((a) => expandTilde(a.userRoot)))
  const manifest = await loadManifest()
  const entry = manifest.installed?.[name]
  if (entry?.roots) {
    for (const r of entry.roots) {
      roots.add(r.endsWith(`/${name}`) ? r.slice(0, -name.length - 1) : r)
    }
  }

  let removed = 0
  for (const root of roots) {
    const dest = path.join(root, name)
    if (!(await exists(dest))) continue
    const link = await isSymlink(dest)
    await removePath(dest)
    removed += 1
    ok(`removed from ${dest} ${link ? c.dim('(link)') : c.dim('(copy)')}`)
  }
  await recordRemove(name)
  if (removed === 0) {
    warn(`"${name}" was not found in any agent root`)
  }
  return removed
}
