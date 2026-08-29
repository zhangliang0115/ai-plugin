import path from 'node:path'
import { AGENTS } from './agents.js'
import { recordRemove } from './manifest.js'
import { c, expandTilde, exists, isSymlink, ok, removePath, warn } from './util.js'

/** Remove an installed skill from every agent root where it appears. */
export async function remove(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('usage: aipx remove <skill-name>')
  }
  let removed = 0
  for (const agent of AGENTS) {
    const dest = path.join(expandTilde(agent.userRoot), name)
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
