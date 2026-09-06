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
  let lastCatalogSignature = null
  let engineName = 'lexical'
  // in-flight index build; search()/call() await this so the catalog is visible
  // (status()/ensureCatalog()) before any embedding-model download finishes
  let buildPromise = null

  async function refresh() {
    // build a fresh entry map, then swap — concurrent searches never see a
    // half-cleared catalog
    const next = new Map()
    const results = []
    for (const [name, def] of Object.entries(servers)) {
      const d = ensureDownstream(name, def)
      if (!d) {
        results.push({ name, tools: 0, status: 'error: cannot create downstream' })
        continue
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

    // Prompt-cache stabilization: build the index from a canonically ordered
    // catalog (id order, not config/server enumeration order) so an identical
    // tool set always produces an identical index — and identical search
    // results — no matter how the config was written or reshuffled.
    const catalog = [...next.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([id, t]) => ({ id, text: `${t.server} ${t.name} ${t.description}` }))

    // Same catalog as the last refresh → keep the current index. Rebuilding
    // an unchanged catalog would only churn sidecar embed caches and reorder
    // score ties, both of which show up as jitter for the model.
    const signature = catalog.map((e) => `${e.id}\u0000${e.text}`).join('\u0001')
    // Catalog ready first — status()/ensureCatalog() never wait on an
    // embedding-model download. The index build runs in the background;
    // search()/call() await it via buildPromise.
    entriesById = next
    refreshed = true
    buildPromise = startBuild(signature, catalog)
    return results
  }

  // Build + wire a downstream for `name`, reusing a live one; hook the server's
  // tools/list_changed notification so a tool-list change re-syncs just this
  // server, not the whole catalog.
  function ensureDownstream(name, def) {
    let d = downstreams.get(name)
    if (!d) {
      d = factory(name, def)
      if (!d) return undefined
      downstreams.set(name, d)
      d.onToolsChanged = () => refreshServer(name)
    }
    return d
  }

  // Filter disabled ids, canonicalize catalog order, and rebuild the search
  // index only when the catalog actually changed (prompt-cache stability).
  // Used by targeted refreshServer(); the caller owns `next`, and the swap
  // happens here so searches never see a partial catalog.
  async function commitCatalog(next) {
    for (const id of disabled) next.delete(id)

    const catalog = [...next.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([id, t]) => ({ id, text: `${t.server} ${t.name} ${t.description}` }))

    // Same catalog as the last refresh → keep the current index. Rebuilding an
    // unchanged catalog would only churn sidecar embed caches and reorder score
    // ties, both of which show up as jitter for the model. (Signatures use NUL /
    // SOH separators — the same bytes refresh() produces, so the paths agree.)
    const NUL = String.fromCharCode(0)
    const SOH = String.fromCharCode(1)
    const signature = catalog.map((e) => `${e.id}${NUL}${e.text}`).join(SOH)
    // Catalog ready first — status()/ensureCatalog() never wait on the build.
    entriesById = next
    refreshed = true
    buildPromise = startBuild(signature, catalog)
  }

  // Targeted re-sync: re-list ONE server's tools and commit the catalog,
  // leaving every other downstream/catalog entry untouched. Triggered by the
  // server's own tools/list_changed notification — a rare, server-initiated
  // change — never a whole-catalog rebuild.
  async function refreshServer(name) {
    await ensureRefreshed()
    const d = downstreams.get(name)
    if (!d) throw new Error(`downstream "${name}" is not registered`)
    let tools
    try {
      tools = await d.listTools()
    } catch (e) {
      log(`[${name}] re-sync failed: ${e.message}`)
      return { name, tools: 0, status: `error: ${e.message}` }
    }
    const next = new Map(entriesById)
    for (const id of [...next.keys()]) if (id.startsWith(`${name}/`)) next.delete(id)
    for (const tool of tools) {
      next.set(`${name}/${tool.name}`, {
        server: name,
        name: tool.name,
        description: tool.description ?? '',
        inputSchema: tool.inputSchema ?? { type: 'object' },
      })
    }
    await commitCatalog(next)
    return { name, tools: tools.length, status: 'ok' }
  }

  // Serialize + run the index build in the background. Returns null when the
  // catalog is unchanged (keep the current index, per prompt-cache stability).
  // Waits on any prior build so concurrent refresh()/refreshServer() never issue
  // two builds on the same index.
  function startBuild(signature, catalog) {
    const prior = buildPromise
    const p = (async () => {
      if (prior) {
        try { await prior } catch {}
      }
      if (signature === lastCatalogSignature) return
      const built = await index.build(catalog)
      engineName = built && typeof built === 'object' && typeof built.engine === 'string'
        ? built.engine
        : 'lexical'
      lastCatalogSignature = signature
    })()
    buildPromise = p
    return p
  }

  // a search/call against a never-refreshed index is a bug callers can't see;
  // self-heal by refreshing once (e.g. client raced the serve-time refresh)
  async function ensureRefreshed() {
    if (!refreshed) await refresh()
  }

  async function search(query, limit = 8) {
    await ensureRefreshed()
    // catalog is ready (swapped before the build); wait for the in-flight index
    // so search ranks against the built index, not an empty one
    if (buildPromise) {
      try { await buildPromise } catch {}
    }
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

  // the engine that served the last build — surfaced via mcp_status
  const searchEngine = () => engineName

  // full tool catalog for operator surfaces (aipx/catalog JSON-RPC method);
  // ensures a refresh happened so the map is populated
  async function ensureCatalog() {
    await ensureRefreshed()
    return [...catalog().entries()].map(([id, t]) => ({
      id,
      server: t.server,
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }))
  }

  return { refresh, refreshServer, search, call, catalog, ensureCatalog, status, searchEngine, stop }
}
