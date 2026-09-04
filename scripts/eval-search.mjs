#!/usr/bin/env node
// Retrieval quality eval for the hub's search, against a live downstream MCP
// server. Usage:
//   node scripts/eval-search.mjs [server-command…]   (default: filesystem MCP)
//   node scripts/eval-search.mjs --compare [server-command…]
//                                     → side-by-side: lexical vs zvec FTS vs
//                                       zvec hybrid-local (needs python3+zvec;
//                                       first hybrid run downloads the model)
// Prints per-query top-1 and engine accuracy. Run before/after changing
// search scoring, meta-tool descriptions, or the sidecar engine.
import { createHub } from '../src/hub/index.js'
import { LexicalIndex } from '../src/hub/lexical.js'
import { SidecarIndex } from '../src/hub/sidecar.js'

const args = process.argv.slice(2)
const compare = args[0] === '--compare'
if (compare) args.shift()
const command = args[0] ?? 'npx'
const serverArgs = args.length > 1 ? args.slice(1) : ['-y', '@modelcontextprotocol/server-filesystem', '/tmp']

// [natural-language query, expected tool name fragment] — 10 plain + 10
// paraphrased/mixed-language phrasings of the same 10 intents
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
  // harder half: paraphrase / Chinese / intent-level
  ['打开一个文件看看内容', 'read_file'],
  ['把这段文字存进去', 'write_file'],
  ['这个目录下有什么', 'list_directory'],
  ['树状结构展示', 'directory_tree'],
  ['给文件改个名字', 'move_file'],
  ['按通配符找文件', 'search_files'],
  ['新建一个目录', 'create_directory'],
  ['看看文件多大', 'get_file_info'],
  ['哪些路径是允许访问的', 'list_allowed_directories'],
  ['对文件局部修改', 'edit_file'],
]

const hub = createHub({ servers: { fs: { command, args: serverArgs } }, log: () => {} })
await hub.refresh()
const entries = [...hub.catalog().entries()].map(([id, t]) => ({
  id,
  text: `${t.server} ${t.name} ${t.description}`,
}))
console.log(`catalog: ${entries.length} tools from ${command} ${serverArgs.join(' ')}\n`)

const engines = [{ name: 'lexical', index: new LexicalIndex() }]
const sidecars = []
if (compare) {
  const [cmd, ...rest] = 'python3 sidecars/zvec_sidecar.py'.split(/\s+/)
  engines.push(
    { name: 'zvec-fts', index: new SidecarIndex({ command: cmd, args: rest, env: { AIPX_LOCAL_EMBEDDINGS: '0' } }) },
    { name: 'zvec-hybrid', index: new SidecarIndex({ command: cmd, args: rest }) },
  )
  sidecars.push(...engines.slice(1).map((e) => e.index))
}

for (const e of engines) await e.index.build(entries)

const header = 'query'.padEnd(32) + engines.map((e) => e.name.padEnd(26)).join('')
console.log(header)
console.log('-'.repeat(header.length))
const hits = Object.fromEntries(engines.map((e) => [e.name, 0]))
for (const [q, expect] of CASES) {
  const cells = []
  for (const e of engines) {
    const r = await e.index.search(q, 3)
    const top = r[0]?.id ?? '(none)'
    const ok = top.includes(expect)
    if (ok) hits[e.name] += 1
    cells.push(`${ok ? 'PASS' : 'miss'} ${(top.split('/')[1] ?? top).slice(0, 20)}`.padEnd(26))
  }
  console.log(q.padEnd(32) + cells.join(''))
}
console.log('-'.repeat(header.length))
console.log('top-1 accuracy: ' + engines.map((e) => `${e.name} ${hits[e.name]}/${CASES.length}`).join('  |  '))
for (const s of sidecars) s.stop()
process.exit(0)
