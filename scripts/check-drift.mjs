#!/usr/bin/env node
// Fail CI when a dsh-plugin/ mirror drifts from its repo-root source.
//
// Two mirrors, different semantics:
//   - dsh-plugin/skills/ is a SUBSET of skills/ (dsh ships the skills listed in
//     dsh-plugin/index.js SKILL_DIRS). Extra repo-root skills that the dsh
//     bundle intentionally omits (e.g. Claude-Code-only ones) are NOT drift.
//   - dsh-plugin/lib/hub/ is a strict MIRROR of src/hub/ — but only of the
//     self-contained files the bundle imports. config.js is excluded (it
//     imports ../mcp.js and ../util.js, which the bundle cannot reach);
//     search.js is bundle-only glue and lives in neither source.
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

// The hub files the dsh bundle imports (kept in lockstep with src/hub/).
const HUB_COPY = new Set([
  'index.js', 'lexical.js', 'downstream.js', 'http-downstream.js', 'sidecar.js', 'server.js',
])

async function hashDir(dir, pick) {
  const out = new Map()
  async function walk(d, prefix) {
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      let isDir = entry.isDirectory()
      if (entry.isSymbolicLink()) {
        // follow a symlink (e.g. skills/ may link a skill folder) so we hash
        // the target instead of EISDIR-reading the link itself
        try { isDir = (await stat(full)).isDirectory() } catch { isDir = false }
      }
      if (isDir) {
        await walk(full, rel)
      } else if (pick === undefined || pick(rel)) {
        const content = await readFile(full)
        out.set(rel, content.toString('base64'))
      }
    }
  }
  await walk(dir, '')
  return out
}

const sessions = [
  {
    label: 'skills',
    src: path.join(root, 'skills'),
    dst: path.join(root, 'dsh-plugin', 'skills'),
    pick: undefined,
    // subset: only drift when a dsh-shipped entry is missing/changed vs repo
    direction: 'subset',
    fix: 'npm run sync-dsh-skills',
  },
  {
    label: 'hub',
    src: path.join(root, 'src', 'hub'),
    dst: path.join(root, 'dsh-plugin', 'lib', 'hub'),
    pick: (rel) => HUB_COPY.has(rel),
    direction: 'mirror',
    fix: 'npm run sync-dsh-hub',
  },
]

let failed = false
for (const s of sessions) {
  const [hasrc, hadst] = [await hashDir(s.src, s.pick), await hashDir(s.dst, s.pick)]
  const onlyDst = [...hadst.keys()].filter((k) => !hasrc.has(k))
  const changed = [...hadst.keys()].filter((k) => hadst.get(k) !== hasrc.get(k))
  const onlySrc = [...hasrc.keys()].filter((k) => !hadst.has(k))
  const problems = changed.concat(onlyDst).concat(s.direction === 'mirror' ? onlySrc : [])
  if (problems.length === 0) {
    console.log(`dsh-plugin ${s.label} is in sync`)
    continue
  }
  failed = true
  console.error(`dsh-plugin ${s.label} has drifted (${s.src} → ${s.dst}):`)
  for (const k of onlyDst) console.error(`  missing in source:       ${k}`)
  for (const k of changed) console.error(`  content differs:         ${k}`)
  if (s.direction === 'mirror') {
    for (const k of onlySrc) console.error(`  missing in dsh-plugin:   ${k}`)
  } else {
    for (const k of onlySrc) console.error(`  (ignored) not shipped by dsh-plugin: ${k}`)
  }
  console.error(`\nfix: ${s.fix}`)
}
if (failed) process.exit(1)
