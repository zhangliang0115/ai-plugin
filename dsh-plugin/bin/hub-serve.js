#!/usr/bin/env node
// Self-hosted MCP hub serve — a drop-in for `aipx mcp serve` that the dsh
// bundle ships itself, so the dsh profile needs no `aipx` CLI and no npx
// reach a published @zhangliang0115/aipx package.
//
// Speaks MCP over stdio (newline-delimited JSON-RPC), exactly like the hub an
// agent client talks to. An MCP server config can point at this entry:
//
//   {"command":"node","args":["<path>/dsh-plugin/bin/hub-serve.js"]}
//
// (stdout carries ONLY JSON-RPC; every diagnostic goes to stderr.)
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHub } from '../lib/hub/index.js'
import { serveStdio } from '../lib/hub/server.js'
import { buildSearchIndex } from '../lib/hub/search.js'

function hubConfigPath() {
  const base =
    process.env.AIPX_CONFIG_DIR ??
    path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'aipx')
  return path.join(base, 'mcp-hub.json')
}

async function loadConfig() {
  const file = hubConfigPath()
  let raw
  try {
    raw = await readFile(file, 'utf8')
  } catch {
    raw = null
  }
  if (raw === null) return { file, servers: {}, disabledTools: [], search: null }
  try {
    const parsed = JSON.parse(raw)
    return {
      file,
      servers: parsed?.servers ?? {},
      disabledTools:
        Array.isArray(parsed.disabledTools) && parsed.disabledTools.every((t) => typeof t === 'string')
          ? parsed.disabledTools
          : [],
      search: parsed?.search ?? null,
    }
  } catch {
    return { file, servers: {}, disabledTools: [], search: null }
  }
}

const log = (msg) => console.error(msg)

const config = await loadConfig()
const names = Object.keys(config.servers)
if (names.length === 0) {
  console.error(`aipx hub: no MCP servers registered (${config.file})`)
  console.error('aipx hub: use the dsh Hub Console to add servers, or edit mcp-hub.json directly')
  process.exit(1)
}

log(`aipx hub: ${names.length} server(s) registered — ${config.file}`)
const searchIndex = buildSearchIndex(config.search?.sidecar, log)
if (searchIndex) log('aipx hub: search sidecar — vector hybrid enabled')
const hub = createHub({
  servers: config.servers,
  log,
  searchIndex,
  disabledTools: config.disabledTools,
})

await serveStdio(hub, { log })
