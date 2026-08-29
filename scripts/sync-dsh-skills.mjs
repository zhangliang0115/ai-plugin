#!/usr/bin/env node
// Sync repo-root skills/ into dsh-plugin/skills/ (the copies a dsh profile
// installs). Run after editing any SKILL.md; CI fails on drift.
import { cp, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const src = path.join(root, 'skills')
const dest = path.join(root, 'dsh-plugin', 'skills')

await rm(dest, { recursive: true, force: true })
await cp(src, dest, { recursive: true })
console.log(`synced ${src} -> ${dest}`)
