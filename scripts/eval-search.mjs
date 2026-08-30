#!/usr/bin/env node
// Retrieval quality eval for the hub's search, against a live downstream MCP
// server. Usage:
//   node scripts/eval-search.mjs [server-command…]   (default: filesystem MCP)
// Prints top-1 accuracy over 10 natural-language queries. Run before/after
// changing search scoring or meta-tool descriptions.
import { createHub } from '../src/hub/index.js'

const args = process.argv.slice(2)
const command = args[0] ?? 'npx'
const serverArgs = args.length > 1 ? args.slice(1) : ['-y', '@modelcontextprotocol/server-filesystem', '/tmp']

const hub = createHub({ servers: { fs: { command, args: serverArgs } }, log: () => {} })
await hub.refresh()

// [natural-language query, expected tool name fragment]
const CASES = [
  ['read a file', 'read_file'],
  ['write some content to a file', 'write_file'],
  ['show me what is in this folder', 'list_directory'],
  ['directory tree view', 'directory_tree'],
  ['rename a file', 'move_file'],
  ['find files matching a pattern', 'search_files'],
  ['create a new folder', 'create_directory'],
  ['file size and metadata', 'get_file_info'],
  ['which directories can I access', 'list_allowed_directories'],
  ['edit part of a file', 'edit_file'],
]

let hit = 0
for (const [q, expect] of CASES) {
  const r = await hub.search(q, 3)
  const top = r[0]?.id ?? '(none)'
  const ok = top.includes(expect)
  if (ok) hit++
  console.log(`${ok ? 'PASS' : 'MISS'} | ${q.padEnd(38)} → ${top}`)
}
console.log(`\ntop-1 accuracy: ${hit}/${CASES.length}`)
console.log('note: vocabulary gaps (folder↔directory) are the vector-search use case — see docs/mcp-hub-vector-search.md')
process.exit(0)
