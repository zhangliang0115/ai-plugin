#!/usr/bin/env node
// Validate every registry/index.json entry against the GitHub API so PR bot
// checks (and local runs) catch typos, deleted repos and duplicate listings
// before they ship to users.
//
// - repo must exist and be public (HTTP 200)
// - entries need name/repo/description/kind and an install line for
//   installable kinds
// - one entry per repo (no duplicates)
// - GITHUB_TOKEN is used when set to avoid the 60/h unauthenticated limit

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const registryPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'registry',
  'index.json'
)

const registry = JSON.parse(await readFile(registryPath, 'utf8'))
const entries = registry.plugins ?? []
const errors = []
const seenRepos = new Map()

const KINDS = new Set(['skills', 'dsh-plugin', 'claude-plugin', 'app', 'awesome', 'harness'])
const INSTALLABLE = new Set(['skills', 'dsh-plugin', 'claude-plugin'])

for (const [i, entry] of entries.entries()) {
  const label = `entry ${i} (${entry.repo ?? entry.name ?? 'unnamed'})`

  for (const field of ['name', 'repo', 'description', 'kind']) {
    if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
      errors.push(`${label}: missing or empty "${field}"`)
    }
  }
  if (entry.kind && !KINDS.has(entry.kind)) {
    errors.push(`${label}: unknown kind "${entry.kind}" (expected one of ${[...KINDS].join(', ')})`)
  }
  if (INSTALLABLE.has(entry.kind) && typeof entry.install !== 'string') {
    errors.push(`${label}: installable kind needs a copy-paste "install" line`)
  }
  if (!Array.isArray(entry.topics) || entry.topics.length === 0) {
    errors.push(`${label}: needs a non-empty "topics" array`)
  }
  if (typeof entry.repo === 'string') {
    if (seenRepos.has(entry.repo)) {
      errors.push(`${label}: duplicate listing of ${entry.repo} (first at entry ${seenRepos.get(entry.repo)})`)
    }
    seenRepos.set(entry.repo, i)
  }
}

// collections must reference entries that exist in the registry
const knownRepos = new Set(entries.map((e) => e.repo).filter(Boolean))
const seenCollections = new Set()
for (const [i, col] of (registry.collections ?? []).entries()) {
  const label = `collection ${i} (${col.name ?? 'unnamed'})`
  for (const field of ['name', 'description']) {
    if (typeof col[field] !== 'string' || col[field].trim() === '') {
      errors.push(`${label}: missing or empty "${field}"`)
    }
  }
  if (col.name) {
    if (seenCollections.has(col.name)) {
      errors.push(`${label}: duplicate collection name "${col.name}"`)
    }
    seenCollections.add(col.name)
  }
  if (!Array.isArray(col.entries) || col.entries.length === 0) {
    errors.push(`${label}: needs a non-empty "entries" array`)
    continue
  }
  for (const e of col.entries) {
    if (!knownRepos.has(e.source)) {
      errors.push(`${label}: entry source "${e.source}" is not in the registry's plugins list`)
    }
    if (typeof e.why !== 'string' || e.why.trim() === '') {
      errors.push(`${label}: entry "${e.source}" needs a "why" line`)
    }
  }
}

// GitHub existence checks — sequential with a small delay to stay friendly to
// the unauthenticated rate limit.
const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'aipx-registry-validator',
}
const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
if (token) headers.Authorization = `Bearer ${token}`

for (const entry of entries) {
  if (typeof entry.repo !== 'string' || !entry.repo.includes('/')) continue
  const res = await fetch(`https://api.github.com/repos/${entry.repo}`, { headers })
  if (res.status === 404) {
    errors.push(`${entry.repo}: repository not found (or private) — remove or fix the entry`)
  } else if (res.status === 403 || res.status === 429) {
    console.error(`::warning::GitHub rate limit hit while checking ${entry.repo} — existence check skipped for the rest`)
    break
  } else if (!res.ok) {
    console.error(`::warning::unexpected HTTP ${res.status} for ${entry.repo}`)
  }
  await new Promise((r) => setTimeout(r, 250))
}

if (errors.length > 0) {
  console.error(`registry validation failed with ${errors.length} error(s):`)
  for (const e of errors) console.error(`  ✗ ${e}`)
  process.exit(1)
}
console.log(`registry OK — ${entries.length} entries validated (repos exist, schemas coherent)`)
