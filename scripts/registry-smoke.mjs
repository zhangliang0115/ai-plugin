#!/usr/bin/env node
// Registry install smoke test: for every registry entry with an `aipx install`
// line, run the real install in --dry-run mode against live GitHub (into an
// isolated temp config + no agent roots). Reports per-entry results as a job
// summary. Scheduled weekly — upstream repos change; dead install lines must
// be caught before users hit them.
//
// Exits 0 even with failures (third-party repos are outside our control);
// failures are surfaced via ::warning annotations and the summary table.

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const BIN = path.join(root, 'bin', 'aipx.js')
const registry = JSON.parse(await readFile(path.join(root, 'registry', 'index.json'), 'utf8'))

const entries = (registry.plugins ?? []).filter(
  (p) => typeof p.install === 'string' && p.install.startsWith('aipx install ')
)

const rows = []
let failed = 0

for (const entry of entries) {
  const source = entry.install.replace(/^aipx install\s+/, '').trim()
  const configDir = await mkdtemp(path.join(tmpdir(), 'aipx-smoke-'))
  const started = Date.now()
  const r = spawnSync(process.execPath, [BIN, 'install', source, '--dry-run', '--no-color'], {
    env: { ...process.env, AIPX_CONFIG_DIR: configDir, GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? '' },
    encoding: 'utf8',
    timeout: 120_000,
  })
  await rm(configDir, { recursive: true, force: true }).catch(() => {})
  const ms = Date.now() - started
  const okRun = r.status === 0
  if (!okRun) failed += 1
  const detail = (okRun ? '✔ dry-run resolved' : `✗ exit ${r.status}`) + ` (${ms}ms)`
  rows.push(`| ${entry.repo} | ${detail} |`)
  if (!okRun) {
    const err = (r.stderr ?? '').trim().split('\n').pop() ?? 'unknown error'
    console.error(`::warning::registry entry ${entry.repo}: install smoke failed — ${err}`)
  }
}

const summary = [
  '## Registry install smoke',
  '',
  '| Entry | Result |',
  '|---|---|',
  ...rows,
  '',
].join('\n')

const summaryFile = process.env.GITHUB_STEP_SUMMARY
if (summaryFile) {
  const { writeFile: w } = await import('node:fs/promises')
  await w(summaryFile, summary, 'utf8')
} else {
  console.log(summary)
}

console.log(`registry smoke: ${entries.length - failed}/${entries.length} install lines resolve against live GitHub`)
if (failed > 0) {
  console.error(`::warning::${failed} registry install line(s) failed — consider updating registry/index.json`)
}
process.exit(0)
