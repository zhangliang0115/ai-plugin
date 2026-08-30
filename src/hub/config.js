import path from 'node:path'
import { listMcp } from '../mcp.js'
import { configDir, ensureDir, exists, readJson, writeJson } from '../util.js'

function hubConfigPath() {
  return path.join(configDir(), 'mcp-hub.json')
}

export async function loadHubConfig() {
  const p = hubConfigPath()
  if (!(await exists(p))) return { servers: {} }
  try {
    const parsed = await readJson(p)
    if (parsed && typeof parsed.servers === 'object' && parsed.servers) return parsed
  } catch {
    // corrupt config — start clean rather than refusing to serve
  }
  return { servers: {} }
}

export async function saveHubConfig(config) {
  const p = hubConfigPath()
  await ensureDir(path.dirname(p))
  await writeJson(p, config)
}

/**
 * Import every MCP server definition aipx can find in the known agent
 * configs into the hub config — the hub's whole point is managing all of
 * them. Returns { added, total }.
 */
export async function importFromAgents({ home } = {}) {
  const found = await listMcp({ home, all: true, includeCommunity: true })
  const config = await loadHubConfig()
  if (!config.servers || typeof config.servers !== 'object') config.servers = {}

  let added = 0
  for (const entry of Object.values(found)) {
    if (!entry.servers) continue
    for (const { name, def } of entry.servers) {
      if (config.servers[name]) continue
      // only stdio servers are supported downstream for now
      if (!def.command) continue
      config.servers[name] = { command: def.command, args: def.args ?? [], env: def.env ?? {} }
      added += 1
    }
  }
  if (added > 0) await saveHubConfig(config)
  return { added, total: Object.keys(config.servers).length }
}
