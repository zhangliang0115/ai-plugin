import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHub } from '../src/hub/index.js'

const FIXTURE_REF = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'mini-mcp.mjs'
)


// A minimal streamable-HTTP MCP server: initialize issues a session id,
// requests without it are rejected, tools/list + tools/call answer JSON.
function startHttpMcp() {
  const sessions = new Set()
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const msg = JSON.parse(body)
      const sid = req.headers['mcp-session-id']
      const json = (obj, headers = {}) => {
        res.writeHead(200, { 'Content-Type': 'application/json', ...headers })
        res.end(JSON.stringify(obj))
      }
      const accepted = () => {
        res.writeHead(202)
        res.end()
      }

      if (msg.method === 'initialize') {
        const id = 'sess-' + sessions.size
        sessions.add(id)
        return json(
          {
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: 'http-mcp', version: '1.0.0' },
            },
          },
          { 'Mcp-Session-Id': id }
        )
      }
      if (!sid || !sessions.has(sid)) {
        res.writeHead(400)
        return res.end('missing session')
      }
      if (msg.method === 'notifications/initialized') return accepted()
      if (msg.method === 'tools/list') {
        return json({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            tools: [
              {
                name: 'http_echo',
                description: 'Echo over HTTP',
                inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
              },
            ],
          },
        })
      }
      if (msg.method === 'tools/call') {
        return json({
          jsonrpc: '2.0',
          id: msg.id,
          result: { content: [{ type: 'text', text: `http:${msg.params.arguments.text}` }] },
        })
      }
      if (msg.id !== undefined) return json({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'not found' } })
      accepted()
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, url: `http://127.0.0.1:${server.address().port}/mcp` })
    )
  })
}

test('hub aggregates an HTTP downstream alongside a stdio one', async () => {
  const { server, url } = await startHttpMcp()

  const servers = {
    remote: { url },
    mini: { command: process.execPath, args: [FIXTURE_REF] },
  }
  const hub = createHub({ servers })
  try {
    const rows = await hub.refresh()
    const by = Object.fromEntries(rows.map((r) => [r.name, r]))
    assert.equal(by.remote.status, 'ok')
    assert.equal(by.remote.tools, 1)
    assert.equal(by.mini.status, 'ok')
    assert.equal(by.mini.tools, 1)

    // cross-transport search: one query spans both transports
    const httpHit = await hub.search('http echo', 5)
    assert.equal(httpHit[0].id, 'remote/http_echo')
    const stdioHit = await hub.search('echo text', 5)
    assert.ok(stdioHit.some((t) => t.id === 'mini/echo'))

    // call over HTTP with session replay
    const r = await hub.call('remote/http_echo', { text: 'hi' })
    assert.equal(r.content[0].text, 'http:hi')
  } finally {
    await hub.stop()
    server.close()
  }
})
