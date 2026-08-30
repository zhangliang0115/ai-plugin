import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { install } from './install.js'
import { c, info, ok } from './util.js'

const REGISTRY = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'registry',
  'index.json'
)

async function loadRegistry() {
  return JSON.parse(await readFile(REGISTRY, 'utf8'))
}

export async function listCollections(opts = {}) {
  const registry = await loadRegistry()
  const collections = registry.collections ?? []
  if (collections.length === 0) {
    info('no collections in the registry yet')
    return []
  }
  if (opts.json) return collections
  for (const col of collections) {
    console.log(`  ${c.bold(col.name)} — ${col.description} ${c.dim(`(${col.entries.length} entries)`)}`)
  }
  console.log(`\ninstall one: ${c.cyan('aipx collection <name> --run')} ${c.dim('(add --dry-run to preview)')}`)
  return collections
}

export async function showCollection(name, opts = {}) {
  const registry = await loadRegistry()
  const col = (registry.collections ?? []).find((x) => x.name === name)
  if (!col) {
    const names = (registry.collections ?? []).map((x) => x.name).join(', ')
    throw new Error(`unknown collection "${name}" — available: ${names || 'none'}`)
  }

  const byRepo = new Map((registry.plugins ?? []).map((p) => [p.repo, p]))
  console.log(`\n${c.bold(col.name)} — ${col.description}\n`)
  for (const entry of col.entries) {
    const known = byRepo.get(entry.source)
    console.log(`  ${c.bold(entry.source)} ${c.dim(known ? `[${known.kind}]` : '')}`)
    console.log(`    why: ${entry.why}`)
    console.log(`    install: ${c.cyan(`aipx install ${entry.source}`)}`)
  }
  console.log(`\ninstall all: ${c.cyan(`aipx collection ${name} --run`)} ${c.dim('(add --dry-run to preview)')}`)
  return col
}

/**
 * Install every entry of a collection, in order. One failing source doesn't
 * stop the rest (third-party repos are outside our control); a summary keeps
 * the outcome visible.
 */
export async function runCollection(name, opts = {}) {
  const registry = await loadRegistry()
  const col = (registry.collections ?? []).find((x) => x.name === name)
  if (!col) throw new Error(`unknown collection "${name}"`)

  const results = []
  let installedTotal = 0
  for (const entry of col.entries) {
    info(`installing ${c.bold(entry.source)} …`)
    try {
      const res = await install(entry.source, opts)
      installedTotal += res.installed ?? 0
      results.push({ source: entry.source, ok: true, installed: res.installed ?? 0 })
    } catch (e) {
      results.push({ source: entry.source, ok: false, error: e.message })
    }
  }

  console.log(`\ncollection ${c.bold(name)}:`)
  for (const r of results) {
    console.log(`    ${r.ok ? c.green('✔') : c.red('✗')} ${r.source}${r.ok ? c.dim(` (${r.installed} installed)`) : c.dim(` (${r.error})`)}`)
  }
  const failed = results.filter((r) => !r.ok).length
  if (failed > 0) warn(`${failed} source(s) failed — see above`)
  else ok(`all ${results.length} source(s) installed`)
  return { results, installedTotal }
}
