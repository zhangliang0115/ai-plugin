import { LexicalIndex } from './lexical.js'
import { HttpDownstream } from './http-downstream.js'
import { StdioDownstream } from './downstream.js'

/**
 * The hub: fronts N downstream MCP servers with a handful of meta tools.
 *
 * The model never sees the downstream tool catalogs — it searches
 * (`mcp_search`), gets the matched tool's inputSchema back, then calls it
 * (`mcp_call`). Context cost stays flat no matter how many servers are
 * registered.
 */

// Common English fillers that dilute lexical scoring: "show me what is in
// this folder" would otherwise accrue more -1s than the query earns +s. Kept
// deliberately small; vocab gaps (folder↔directory) are what vector search
// is for.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'it', 'this', 'that',
  'in', 'on', 'of', 'to', 'for', 'from', 'by', 'at', 'with', 'and', 'or',
  'me', 'my', 'your', 'i', 's', 'what', 'which', 'how', 'show', 'some',
  'new', 'can', 'do', 'part',
])

export function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
}

export function createHub({ servers, log = () => {}, downstreamFactory, searchIndex, disabledTools } = {}) {
  const index = searchIndex ?? new LexicalIndex()
  const downstreams = new Map()
  // tool ids ("server/tool") the console toggled off: dropped at refresh time
  // so search never ranks them, call reports them unknown, and status counts
  // shrink to match — the downstream processes themselves stay untouched
  const disabled = new Set(
    Array.isArray(disabledTools) ? disabledTools.filter((t) => typeof t === 'string' && t !== '') : []
  )
  const makeDefault = (name, def) =>
    def.url ? new HttpDownstream(name, def, log) : new StdioDownstream(name, def, log)
  const factory = downstreamFactory ?? makeDefault
  let entriesById = new Map() // toolKey -> { server, name, description, inputSchema }
  let refreshed = false

  async function refresh() {
    // build a fresh entry map, then swap — concurrent searches never see a
    // half-cleared catalog
    const next = new Map()
    const results = []
    for (const [name, def] of Object.entries(servers)) {
      let d = downstreams.get(name)
      if (!d) {
        d = factory(name, def)
        downstreams.set(name, d)
      }
      try {
        const tools = await d.listTools()
        for (const tool of tools) {
          next.set(`${name}/${tool.name}`, {
            server: name,
            name: tool.name,
            description: tool.description ?? '',
            inputSchema: tool.inputSchema ?? { type: 'object' },
          })
        }
        results.push({ name, tools: tools.length, status: 'ok' })
      } catch (e) {
        results.push({ name, tools: 0, status: `error: ${e.message}` })
      }
    }
    // filter disabled ids out after the catalog is built and before the index
    // sees it — one deletion point covers search, call, and status
    for (const id of disabled) next.delete(id)
    entriesById = next
    await index.build(
      [...entriesById.entries()].map(([id, t]) => ({
        id,
        text: `${t.server} ${t.name} ${t.description}`,
      }))
    )
    refreshed = true
    return results
  }

  // a search/call against a never-refreshed index is a bug callers can't see;
  // self-heal by refreshing once (e.g. client raced the serve-time refresh)
  async function ensureRefreshed() {
    if (!refreshed) await refresh()
  }

  async function search(query, limit = 8) {
    await ensureRefreshed()
    const ranked = await index.search(query, limit)
    return ranked
      .map(({ id }) => ({ id, ...(entriesById.get(id) ?? {}) }))
      .filter((t) => t.server !== undefined)
  }

  async function call(id, args) {
    await ensureRefreshed()
    const tool = entriesById.get(id)
    if (!tool) {
      const close = await search(id, 3)
      const hint = close.map((t) => t.id).join(', ')
      throw new Error(
        `unknown tool "${id}" — run mcp_search first${hint ? `; close matches: ${hint}` : ''}`
      )
    }
    const d = downstreams.get(tool.server)
    if (!d) throw new Error(`downstream "${tool.server}" is not registered`)
    return d.callTool(tool.name, args)
  }

  function status() {
    return [...downstreams.entries()].map(([name, d]) => ({
      name,
      ready: d.ready,
      lastError: d.lastError,
      tools: [...entriesById.keys()].filter((id) => id.startsWith(`${name}/`)).length,
    }))
  }

  // the full tool catalog keyed by "server/tool" — same shape refresh builds
  function catalog() {
    return entriesById
  }

  async function stop() {
    for (const d of downstreams.values()) d.stop()
  }

  return { refresh, search, call, catalog, status, stop }
}
