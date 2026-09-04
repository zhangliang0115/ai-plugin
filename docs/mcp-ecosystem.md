# The MCP management landscape — what we use, what we reference, what we build

Research date: 2026-09-05. Standing rule for this repo: quality over
quantity — if something already solves a problem well, we record it here
instead of rebuilding it.

## Use these instead of building

| need | answer |
|---|---|
| Debug/test **one** MCP server (connect, list tools, call by hand) | [MCP Inspector](https://github.com/modelcontextprotocol/inspector) (~10.8k★, official) |
| A desktop GUI managing MCP servers with per-tool switches + logs | [MCP Router](https://github.com/mcp-router/mcp-router) (~2.1k★) |
| A self-hosted gateway + web panel for a server pool | [MCPHub](https://github.com/samanthappy/mcphub) (~2.4k★) or [MetaMCP](https://github.com/metatool-ai/metamcp) (~2.6k★, MIT, maintenance slowing) |
| Discover servers (registries) | [official registry](https://registry.modelcontextprotocol.io), [Smithery](https://smithery.ai), [Glama](https://glama.ai/mcp/servers), [PulseMCP](https://www.pulsemcp.com) |
| Sync MCP config across Claude/Cursor/VS Code/Cline | [mcp-linker](https://github.com/milisp/mcp-linker), [mcp-dock](https://github.com/OldJii/mcp-dock) |

## dsh-ecosystem projects worth knowing

| project | what it does |
|---|---|
| [dsh-skill-mcp-panel](https://github.com/Fishquito7/dsh-skill-mcp-panel) (~115★) | skills+MCP panels managing `cordis.patch.yml` blocks, connection test, HMR |
| [dsh-mcp](https://github.com/ArvinQi/dsh-mcp) (~10★) | dsh-native settings panel + `mcp_tool_search` hot-injection meta tool; notable ideas: prompt-cache-friendly tool-list stabilization, per-tool toggles |
| [dsh-skills-mcp-manager](https://github.com/zebbkira/dsh-skills-mcp-manager) (~23★) | settings-page skills+MCP management with real connect/disconnect |
| [dsh-config-manager](https://github.com/xiajiajun516/dsh-config-manager) (~77★) | full DSH config backup/restore/sync |

## What was missing — and is now ours to build

Nothing above manages **an aipx-style hub** (N downstream servers behind a
handful of meta tools). Gateways manage their own pool with full tool
exposure; dsh panels manage dsh's native per-server config rows; the official
Inspector tests one server at a time. Nobody can answer "what does the model
actually see when it searches my hub?" — so that is the console we ship: a
dsh settings panel for the aipx hub (server pool, health, tool catalog) with
a search playground that exercises the real `mcp_search` meta tool. Design
notes in [mcp-hub-vector-search.md](mcp-hub-vector-search.md); hub usage in
[mcp-hub.md](mcp-hub.md).
