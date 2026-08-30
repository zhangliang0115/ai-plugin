# MCP hub — every server, ~4 tools, one context

Every downstream MCP server dumps its full tool catalog into your model's
context. With 20 servers × 10 tools each, that's tens of thousands of tokens
of tool definitions consumed on every single turn — before the model has even
read your code.

The aipx hub flips the model: one MCP server (the hub) fronts all of them and
exposes ~4 meta tools. The model **searches** for a capability, receives the
matched tool's `inputSchema`, then **calls** it — paying context only for
tools actually used.

## Wire it up

```sh
# 1. register every MCP server found in your agent configs:
aipx mcp import

# 2. run the hub (speaks MCP over stdio):
aipx mcp serve
```

Then replace your agent's long MCP server list with a single entry:

```json
{ "mcpServers": { "aipx": { "command": "aipx", "args": ["mcp", "serve"] } } }
```

Hub config lives at `~/.config/aipx/mcp-hub.json` (override with
`AIPX_CONFIG_DIR`) — a plain `{"servers": {name: {command, args, env}}}` map
you can edit by hand.

## Verified end-to-end

Real session against the official
[@modelcontextprotocol/server-filesystem](https://www.npmjs.com/package/@modelcontextprotocol/server-filesystem)
(stdout only; logs on stderr):

```console
$ aipx mcp import && aipx mcp serve
hub config: 1 server(s) imported, 1 registered total

→ tools/call mcp_search {"query": "read file", "limit": 2}
← [
     { "id": "filesystem/read_file",      "description": "Read the complete contents of a file…" },
     { "id": "filesystem/read_text_file", "description": "Read the complete contents of a file fro…" }
   ]                                    + each tool's full inputSchema

→ tools/call mcp_call {"tool": "filesystem/read_file", "arguments": {"path": "…/hello.txt"}}
← "hello from aipx mcp hub"

→ tools/call mcp_status
← [{ "name": "filesystem", "ready": true, "tools": 14 }]
```

Four meta-tool definitions in context — while 14 downstream tools (and any
number of further servers) stay out of it until searched for.

## The meta tools

| Tool | Purpose |
|---|---|
| `mcp_search` | keyword-search all downstream tools; returns id, description and the exact `inputSchema` |
| `mcp_call` | execute a downstream tool by its `"<server>/<tool>"` id from `mcp_search` |
| `mcp_status` | registered servers, tool counts, health |
| `mcp_refresh` | re-scan servers after adding/removing/restarting one |

The descriptions of these four tools are the model's entire manual — they
teach the search-then-call loop explicitly, because that's the part that
makes or breaks a gateway.

## How it works

- Downstream **stdio** servers are spawned on first use and reused;
  if one crashes, the next request respawns it.
- `tools/call` failures from downstream servers are surfaced as `isError`
  results (not JSON-RPC errors) so the model can read the failure and adjust.
- Search is a deterministic lexical scorer (name matches > description
  matches, relevance-ranked). The interface is intentionally pluggable:
  swap the scorer for a vector index (e.g. a
  [zvec](https://github.com/alibaba/zvec) sidecar speaking the same
  query-in/ranked-tools-out contract) without changing anything else.
- Remote (HTTP/SSE) downstream servers are not proxied yet.

## Design boundary

The hub spawns only servers you registered in its config, and only when
serving. It executes downstream tools on the model's behalf — that's the
point — so register servers you trust, same as you would in any agent.
