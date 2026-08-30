// Minimal MCP server fixture for hub tests: newline-delimited JSON-RPC over
// stdio, supports initialize / tools/list / tools/call (one "echo" tool).
import { createInterface } from 'node:readline'

const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n')

const rl = createInterface({ input: process.stdin })
rl.on('line', (line) => {
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'mini-mcp', version: '1.0.0' },
      },
    })
  } else if (msg.method === 'notifications/initialized') {
    // nothing
  } else if (msg.method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        tools: [
          {
            name: 'echo',
            description: 'Echo the given text back, prefixed with "echo:"',
            inputSchema: {
              type: 'object',
              properties: { text: { type: 'string', description: 'Text to echo' } },
              required: ['text'],
            },
          },
        ],
      },
    })
  } else if (msg.method === 'tools/call') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        content: [{ type: 'text', text: `echo:${msg.params?.arguments?.text ?? ''}` }],
      },
    })
  } else if (msg.id !== undefined) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'not found' } })
  }
})
