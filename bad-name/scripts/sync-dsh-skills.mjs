#!/usr/bin/env node
// Sync repo-root skills/ into dsh-plugin/skills/ (the copies a dsh profile
// installs). Run after editing any SKILL.md; CI fails on drift.
import { cp, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
await rm(path.join(root, 'dsh-plugin', 'skills'), { recursive: true, force: true })
await cp(path.join(root, 'skills'), path.join(root, 'dsh-plugin', 'skills'), { recursive: true })
console.log('synced skills/ -> dsh-plugin/skills/')
