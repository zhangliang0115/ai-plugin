#!/usr/bin/env node
// Sync the dsh bundle's hub core from src/hub/ — the copy a dsh profile
// installs. Run after editing any mirrored src/hub file; CI (`check-drift`)
// fails on drift. Only the self-contained files the bundle imports are copied;
// config.js is excluded (it imports ../mcp.js and ../util.js, which the bundle
// cannot reach). search.js is bundle-only glue and is left untouched.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const src = path.join(root, 'src', 'hub')
const dest = path.join(root, 'dsh-plugin', 'lib', 'hub')

const HUB_COPY = ['index.js', 'lexical.js', 'downstream.js', 'http-downstream.js', 'sidecar.js', 'server.js']

await mkdir(dest, { recursive: true })
for (const name of HUB_COPY) {
  await writeFile(path.join(dest, name), await readFile(path.join(src, name)))
}
console.log(`synced ${HUB_COPY.length} hub files -> ${dest}`)
