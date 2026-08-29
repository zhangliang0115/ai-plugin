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
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await walk(full, rel)
      } else {
        const content = await readFile(full)
        out.set(rel, content.toString('base64'))
      }
    }
  }
  await walk(dir, '')
  return out
}

const [ha, hb] = [await hashDir(a), await hashDir(b)]
const onlyA = [...ha.keys()].filter((k) => !hb.has(k))
const onlyB = [...hb.keys()].filter((k) => !ha.has(k))
const changed = [...ha.keys()].filter((k) => ha.get(k) !== hb.get(k))

if (onlyA.length || onlyB.length || changed.length) {
  console.error('dsh-plugin/skills/ has drifted from skills/:')
  for (const k of onlyA) console.error(`  missing in dsh-plugin: ${k}`)
  for (const k of onlyB) console.error(`  missing in skills/:     ${k}`)
  for (const k of changed) console.error(`  content differs:        ${k}`)
  console.error('\nfix: npm run sync-dsh-skills')
  process.exit(1)
}
console.log('dsh-plugin/skills/ is in sync with skills/')
