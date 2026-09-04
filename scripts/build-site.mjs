#!/usr/bin/env node
// Generate the static registry site (site/index.html) from registry/index.json.
// Deployed to GitHub Pages by .github/workflows/pages.yml — no framework, no
// build tooling beyond this script.

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const outDir = path.join(root, 'site')

const registry = JSON.parse(await readFile(path.join(root, 'registry', 'index.json'), 'utf8'))
const entries = registry.plugins ?? []

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const KIND_COLORS = {
  skills: '#2563eb',
  'dsh-plugin': '#0f766e',
  'claude-plugin': '#7c3aed',
  app: '#b45309',
  awesome: '#4d7c0f',
  harness: '#be123c',
}

const cards = entries
  .map((p) => {
    const color = KIND_COLORS[p.kind] ?? '#475569'
    const topics = (p.topics ?? []).map((t) => `<span class="topic">${esc(t)}</span>`).join(' ')
    const install = p.install ? `<pre class="snippet"><code>${esc(p.install)}</code></pre>` : ''
    return `<div class="card">
  <div class="card-head">
    <a class="name" href="https://github.com/${esc(p.repo)}">${esc(p.name)}</a>
    <span class="kind" style="background:${color}">${esc(p.kind)}</span>
  </div>
  <p class="desc">${esc(p.description)}</p>
  ${topics ? `<div class="topics">${topics}</div>` : ''}
  ${install}
</div>`
  })
  .join('\n')

const collections = registry.collections ?? []
const collectionBlocks = collections
  .map((c) => {
    const rows = (c.entries ?? [])
      .map((e) => {
        const repo = typeof e.source === 'string' ? e.source : ''
        const link = repo.includes('/') ? `<a class="name" href="https://github.com/${esc(repo)}">${esc(repo)}</a>` : `<span class="name">${esc(repo)}</span>`
        return `<li>${link} — ${esc(e.why ?? '')}</li>`
      })
      .join('\n')
    return `<div class="card collection">
  <div class="card-head"><span class="name">${esc(c.name)}</span><span class="kind" style="background:#0f766e">collection</span></div>
  <p class="desc">${esc(c.description ?? '')}</p>
  <ul>${rows}</ul>
</div>`
  })
  .join('\n')

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>aipx registry — install any AI agent skill into every agent</title>
<meta name="description" content="Curated registry of AI agent skills and plugins: Claude Code, DeepSeek Harness (dsh), Codex CLI, Gemini CLI, Copilot and Cursor — one command installs into all of them.">
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, 'Noto Sans SC', sans-serif;
         margin: 0; background: #f8fafc; color: #0f172a; }
  main { max-width: 880px; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
  h1 { font-size: 2rem; margin: 0 0 .25rem; }
  .tagline { color: #475569; margin: 0 0 1.25rem; font-size: 1.05rem; }
  .hero pre { background: #0f172a; color: #e2e8f0; padding: 1rem 1.25rem;
              border-radius: 10px; overflow-x: auto; font-size: .9rem; }
  .meta { color: #64748b; font-size: .85rem; margin: 1rem 0 2rem; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
          padding: 1.1rem 1.25rem; margin-bottom: 1rem; }
  .card-head { display: flex; align-items: center; gap: .6rem; margin-bottom: .35rem; }
  .name { font-weight: 650; color: #0f172a; text-decoration: none; font-size: 1.05rem; }
  .name:hover { text-decoration: underline; }
  .kind { color: #fff; font-size: .68rem; padding: .15rem .55rem; border-radius: 999px;
          text-transform: uppercase; letter-spacing: .04em; }
  .desc { margin: .25rem 0 .5rem; color: #334155; line-height: 1.5; }
  .topics { margin: .35rem 0; }
  .topic { display: inline-block; background: #f1f5f9; color: #475569; font-size: .72rem;
           padding: .12rem .5rem; border-radius: 999px; margin-right: .3rem; }
  .snippet { background: #0f172a; color: #e2e8f0; border-radius: 8px; padding: .6rem .8rem;
             font-size: .8rem; overflow-x: auto; margin: .5rem 0 0; }
  @media (prefers-color-scheme: dark) {
    body { background: #0b1120; color: #e2e8f0; }
    .tagline, .meta { color: #94a3b8; }
    .desc { color: #cbd5e1; }
    .card { background: #0f172a; border-color: #1e293b; }
    .name { color: #e2e8f0; }
    .topic { background: #1e293b; color: #94a3b8; }
  }
  .collection ul { margin: .5rem 0 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: .35rem; font-size: .86rem; color: #334155; } .collection li a { color: #2563eb; } h2 { margin: 2.5rem 0 .5rem; font-size: 1.3rem; color: #0f172a; } footer { text-align: center; color: #64748b; font-size: .85rem; padding: 2rem 0; }
  footer a { color: inherit; }
</style>
</head>
<body>
<main>
  <h1>aipx registry</h1>
  <p class="tagline">Curated AI agent skills &amp; plugins — installed into every agent with one command.</p>
  <div class="hero"><pre>npm i -g github:zhangliang0115/ai-plugin
aipx install &lt;owner&gt;/&lt;repo&gt;</pre></div>
  <p class="meta">Updated ${esc(registry.updated ?? '')} · ${entries.length} entries · verified by CI against the GitHub API ·
  <a href="https://github.com/zhangliang0115/ai-plugin">source</a> ·
  <a href="https://github.com/zhangliang0115/ai-plugin/blob/main/CONTRIBUTING.md#submitting-a-pluginskill-to-the-registry">submit yours</a></p>
${cards}
  <h2>Collections — curated stacks, one command each</h2>
  <p class="meta">A collection bundles verified entries toward a goal. Install its pieces with the commands shown on each card.</p>
${collectionBlocks}
</main>
<footer>MIT · <a href="https://github.com/zhangliang0115/ai-plugin">zhangliang0115/ai-plugin</a> · install once, run in Claude Code, DeepSeek Harness (dsh), Codex, Gemini CLI, Copilot &amp; Cursor</footer>
</body>
</html>
`

await mkdir(outDir, { recursive: true })
await writeFile(path.join(outDir, 'index.html'), html, 'utf8')
console.log(`site built -> ${outDir} (${entries.length} entries)`)
process.exit(0)
