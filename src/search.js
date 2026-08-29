import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { githubJson } from './github.js'
import { c, info, readJson } from './util.js'

const REGISTRY = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'registry',
  'index.json'
)

/**
 * Search the bundled curated registry, optionally (+ --github) the live GitHub
 * topic index for `agent-skills` / `dsh-plugin` / `claude-plugin` repos.
 */
export async function search(query, opts = {}) {
  const q = (query ?? '').toLowerCase().trim()
  const registry = await readJson(REGISTRY)
  const results = registry.plugins.filter((p) => {
    if (q === '') return true
    const haystack = [p.name, p.repo, p.description, ...(p.topics ?? [])].join(' ').toLowerCase()
    return q.split(/\s+/).every((word) => haystack.includes(word))
  })

  console.log(`\ncurated registry — ${results.length} match(es):\n`)
  for (const p of results) {
    console.log(`  ${c.bold(p.repo)}  ${c.dim(`[${p.kind}]`)}`)
    console.log(`    ${p.description}`)
    if (p.install) console.log(`    install: ${c.cyan(p.install)}`)
    console.log()
  }

  if (opts.github) {
    info('searching GitHub topics (unauthenticated, rate-limited) …')
    const topics = ['agent-skills', 'dsh-plugin', 'claude-plugin']
    const seen = new Set()
    let shown = 0
    for (const topic of topics) {
      let data
      try {
        data = await githubJson(
          `/search/repositories?q=${encodeURIComponent(`${q} topic:${topic}`.trim())}&sort=stars&order=desc&per_page=5`
        )
      } catch (e) {
        info(`  ${topic}: ${e.message}`)
        continue
      }
      for (const item of data.items ?? []) {
        if (seen.has(item.full_name)) continue
        seen.add(item.full_name)
        if (shown >= 10) break
        shown += 1
        console.log(
          `  ${c.bold(item.full_name)}  ${c.dim(`★ ${item.stargazers_count}`)}`
        )
        console.log(`    ${item.description ?? ''}`)
        console.log()
      }
    }
    if (shown === 0) info('no GitHub results (or rate-limited — set GITHUB_TOKEN)')
  } else {
    info('tip: add --github to also search GitHub topics live')
  }

  return results
}
