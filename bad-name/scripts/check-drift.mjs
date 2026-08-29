#!/usr/bin/env node
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
