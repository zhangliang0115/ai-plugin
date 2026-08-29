# MCP config sync across agents

Every agent that speaks MCP keeps its server list in a different file, in a
different format. `aipx mcp` gives you one inventory and one copy command.

## Where each agent keeps MCP servers

| Agent | Config file | Format | Key | Tier |
|---|---|---|---|---|
| Claude Code | `~/.claude.json` | JSON | `mcpServers` | official |
| Gemini CLI | `~/.gemini/settings.json` | JSON | `mcpServers` | official |
| Codex CLI | `~/.codex/config.toml` | TOML | `[mcp_servers.NAME]` | official |
| Cursor | `~/.cursor/mcp.json` | JSON | `mcpServers` | community |
| GitHub Copilot CLI | `~/.copilot/mcp-config.json` | JSON | `mcpServers` | community |
| OpenCode | `~/.config/opencode/opencode.json` | JSON | `mcp` | community |
| DeepSeek Harness (`dsh`) | bundles / patches | — | — | not applicable* |

\* dsh runs MCP servers through its own everything-is-a-plugin config system —
add MCP servers there with a dsh bundle or a `cordis.patch.yml` overlay (see
`docs/install-into-dsh.md`).

## `aipx mcp list`

```console
$ aipx mcp list
Claude Code (~/.claude.json)
    (no servers configured)

Codex CLI (~/.codex/config.toml)
    node_repl /Applications/Codex.app/…/node_repl
```

`--json` for machine-readable output; `--all` includes community-tier configs.

## `aipx mcp sync <name>`

Copy a server definition from wherever it is already configured into every
other config aipx can write:

```sh
aipx mcp sync fetch                     # from its first found config → all official
aipx mcp sync fetch --from claude-code  # explicit source
aipx mcp sync fetch --agents gemini,codex
aipx mcp sync fetch --dry-run
```

- **JSON targets** are merged, never clobbered: unrelated keys and other
  servers are preserved, the file is rewritten pretty-printed.
- **Codex TOML** is handled by a minimal `[mcp_servers.NAME]` table writer:
  your `[model]`, `[profile]` and other sections are preserved byte-for-byte;
  only the named server table is replaced or appended.
- **Remote (url) servers** are skipped for Codex with a warning — its TOML
  writer supports stdio definitions (command/args/env) so far.
- **OpenCode** uses a different definition shape (`command` as an array);
  it is read-only for now — `mcp sync` prints the definition to add manually.
- Community-tier targets (Cursor, Copilot, OpenCode) need `--all` or
  `--agents` to be written, same policy as skill installs.

## Honesty policy

Same as everywhere else in aipx: officially documented locations are written
by default; community-reported ones stay opt-in, and unsupported shapes are
skipped with a message instead of producing a broken config.
