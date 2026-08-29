#!/usr/bin/env node
// Syntax-check every source file (stands in for a linter while the project
// stays zero-dependency).
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const files = []

async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      await collect(full)
    } else if (/\.(mjs|js)$/.test(entry.name) && !entry.name.endsWith('.test.js')) {
      files.push(full)
    }
  }
}

await collect(path.join(root, 'src'))
await collect(path.join(root, 'bin'))
await collect(path.join(root, 'scripts'))
files.push(path.join(root, 'dsh-plugin', 'index.js'))

let failed = false
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { stdio: 'pipe' })
  if (r.status !== 0) {
    failed = true
    console.error(r.stderr.toString())
    console.error(`syntax error: ${f}`)
  }
}
if (failed) process.exit(1)
console.log(`syntax OK — ${files.length} files`)
