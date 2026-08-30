import { StdioDownstream } from './downstream.js'

/**
 * The hub: fronts N downstream MCP servers with a handful of meta tools.
 *
 * The model never sees the downstream tool catalogs — it searches
 * (`mcp_search`), gets the matched tool's inputSchema back, then calls it
 * (`mcp_call`). Context cost stays flat no matter how many servers are
 * registered.
 */

export function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter((t) => t.length > 0)
}

/**
 * Lexical score for one downstream tool against a query. Deterministic and
 * dependency-free on purpose — the interface (query in, ranked tools out) is
 * what matters; a vector index (e.g. a zvec sidecar) can replace this
 * function without touching anything else.
 */
export function scoreTool(query, serverName, toolName, description) {
  const qTokens = tokenize(query)
  if (qTokens.length === 0) return 0
  const nameLower = `${serverName} ${toolName}`.toLowerCase()
  const descLower = String(description ?? '').toLowerCase()

  let score = 0
  for (const token of qTokens) {
    if (toolName.toLowerCase().includes(token)) score += 4
    if (serverName.toLowerCase().includes(token)) score += 2
    if (descLower.includes(token)) score += 1
    for (const nt of tokenize(toolName)) {
      if (nt.startsWith(token)) {
        score += 2
        break
      }
    }
    if (!nameLower.includes(token) && !descLower.includes(token)) score -= 1
  }
  return score
}

export function createHub({ servers, log = () => {}, downstreamFactory } = {}) {
  const makeStdio = (name, def) => new StdioDownstream(name, def, log)
  const factory = downstreamFactory ?? makeStdio
  const downstreams = new Map()
  const toolIndex = new Map() // toolKey -> { server, name, description, inputSchema }

  async function refresh() {
    toolIndex.clear()
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
          toolIndex.set(`${name}/${tool.name}`, {
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
    return results
  }

  function search(query, limit = 8) {
    const scored = [...toolIndex.entries()]
      .map(([id, t]) => ({ id, ...t, score: scoreTool(query, t.server, t.name, t.description) }))
      .filter((t) => t.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
    return scored.map(({ score, ...rest }) => rest)
  }

  async function call(id, args) {
    const tool = toolIndex.get(id)
    if (!tool) {
      const hint = search(id, 3).map((t) => t.id).join(', ')
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
      tools: [...toolIndex.entries()].filter(([id]) => id.startsWith(`${name}/`)).length,
    }))
  }

  async function stop() {
    for (const d of downstreams.values()) d.stop()
  }

  return { refresh, search, call, status, stop }
}
