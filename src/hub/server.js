import { createHub } from './index.js'

export const HUB_SERVER_INFO = { name: 'aipx-mcp-hub', version: '0.4.1' }
export const PROTOCOL_VERSION = '2024-11-05'

/**
 * The four meta tools the model sees. Their descriptions ARE the user
 * manual — they must teach the search-then-call loop, because the model has
 * nothing else to go on.
 */
export const META_TOOLS = [
  {
    name: 'mcp_search',
    description:
      'Search EVERY tool across all registered MCP servers (databases, browsers, APIs, …). ' +
      'Always call this first when you need a capability: it returns the tool id, a description, ' +
      'and the exact inputSchema needed to call it. Then execute with mcp_call.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords for the capability you need, e.g. "redis get" or "browser screenshot"' },
        limit: { type: 'number', description: 'Max results (default 8)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'mcp_call',
    description:
      'Execute a downstream MCP tool. `tool` is the "<server>/<tool>" id from mcp_search results, ' +
      'and `arguments` must match the inputSchema that mcp_search returned for it.',
    inputSchema: {
      type: 'object',
      properties: {
        tool: { type: 'string', description: 'Tool id from mcp_search, in "<server>/<tool>" form' },
        arguments: { type: 'object', description: 'Arguments matching the tool\'s inputSchema' },
      },
      required: ['tool'],
    },
  },
  {
    name: 'mcp_status',
    description: 'List the registered MCP servers with their tool counts and health.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'mcp_refresh',
    description: 'Re-scan all registered MCP servers. Use after servers are added, removed or restarted.',
    inputSchema: { type: 'object', properties: {} },
  },
]

/**
 * Create a JSON-RPC message handler bound to a hub. Pure and testable: no
 * stdio, no timers — pass a request in, get the response message (or null
 * for notifications) out.
 */
export function createMessageHandler(hub, log = () => {}) {
  return async function handleMessage(msg) {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return null
    const isNotification = msg.id === undefined
    const reply = (result) => (isNotification ? null : { jsonrpc: '2.0', id: msg.id, result })
    const error = (code, message) =>
      isNotification ? null : { jsonrpc: '2.0', id: msg.id, error: { code, message } }

    switch (msg.method) {
      case 'initialize':
        return reply({ protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: HUB_SERVER_INFO })
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return null
      case 'ping':
        return reply({})
      case 'aipx/catalog':
        // operator surface (the hub console bridge), deliberately NOT a meta
        // tool — the model never sees the full catalog
        return reply({ tools: await hub.ensureCatalog() })
      case 'tools/list':
        return reply({ tools: META_TOOLS })
      case 'tools/call': {
        const name = msg.params?.name
        const args = msg.params?.arguments ?? {}
        try {
          let result
          if (name === 'mcp_search') {
            const results = await hub.search(args.query ?? '', args.limit ?? 8)
            result = { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] }
          } else if (name === 'mcp_call') {
            if (!args.tool) throw new Error('missing required argument: tool')
            const r = await hub.call(args.tool, args.arguments)
            result = r ?? { content: [{ type: 'text', text: 'done' }] }
          } else if (name === 'mcp_status') {
            result = { content: [{ type: 'text', text: JSON.stringify({ servers: hub.status(), searchEngine: hub.searchEngine() }, null, 2) }] }
          } else if (name === 'mcp_refresh') {
            const rows = await hub.refresh()
            result = { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] }
          } else {
            return error(-32602, `unknown tool: ${name}`)
          }
          return reply(result)
        } catch (e) {
          log(`tools/call ${name} failed: ${e.message}`)
          // tool execution errors are results (isError), not JSON-RPC errors —
          // the model needs to read the failure and adjust
          return reply({ content: [{ type: 'text', text: String(e.message) }], isError: true })
        }
      }
      default:
        if (msg.method.startsWith('notifications/')) return null
        return error(-32601, `method not found: ${msg.method}`)
    }
  }
}

/**
 * Serve the hub over stdio (newline-delimited JSON-RPC). The initial index
 * refresh completes before input is attached — early client requests wait in
 * the pipe instead of racing an empty index. Resolves when stdin closes;
 * stops all downstreams first.
 */
export async function serveStdio(hub, { input = process.stdin, output = process.stdout, log = () => {} } = {}) {
  const handle = createMessageHandler(hub, log)
  const { createInterface } = await import('node:readline')

  // refresh first: requests sent by the client sit in the pipe until we attach
  await hub.refresh().catch((e) => log(`initial refresh failed: ${e.message}`))

  const rl = createInterface({ input })
  const write = (obj) => {
    output.write(JSON.stringify(obj) + '\n')
  }

  const done = new Promise((resolve) => {
    const onClose = async () => {
      rl.close()
      await hub.stop()
      resolve()
    }
    input.on('end', onClose)
    input.on('close', onClose)
  })

  rl.on('line', (line) => {
    const trimmed = line.trim()
    if (trimmed === '') return
    let msg
    try {
      msg = JSON.parse(trimmed)
    } catch {
      log(`non-JSON line dropped`)
      return
    }
    Promise.resolve(handle(msg))
      .then((res) => {
        if (res) write(res)
      })
      .catch((e) => {
        if (msg.id !== undefined) {
          write({ jsonrpc: '2.0', id: msg.id, error: { code: -32700, message: String(e.message) } })
        }
      })
  })

  return done
}

export { createHub } from './index.js'
