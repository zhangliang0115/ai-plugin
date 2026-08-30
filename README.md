<div align="center">

# ai-plugin

**One command to install any AI agent skill/plugin into every agent.**

Claude Code · DeepSeek Harness (dsh) · Codex CLI · Gemini CLI · GitHub Copilot · Cursor · OpenClaw

[![CI](https://github.com/zhangliang0115/ai-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/zhangliang0115/ai-plugin/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/node/v/aipx.svg)](package.json)
[![GitHub stars](https://img.shields.io/github/stars/zhangliang0115/ai-plugin?style=social)](https://github.com/zhangliang0115/ai-plugin/stargazers)

English | [简体中文](README.zh-CN.md)

</div>

---

Your machine runs 4 different AI agents. Your favorite skill exists as a
GitHub repo. Now what? Copy folders into `~/.claude/skills`, then
`~/.agents/skills`, then `~/.gemini/skills`, then `~/.copilot/skills`… and
re-do it after every upstream update. And once every agent has twenty MCP
servers wired up, their tool definitions eat your context window alive.

**`aipx` fixes both.** One command installs a skill into the shared standard
root (`~/.agents/skills` — read natively by dsh and Codex, linkable by the
rest). And the **aipx MCP hub** fronts ALL your MCP servers with ~4 meta
tools — search, call, status, import — so the model sees one server instead
of fifty. The bundled skills teach you (and your agents) how to publish for
every harness from a single repo.

```bash
npx github:zhangliang0115/ai-plugin install <owner>/<repo>
```

## Why

Every agent harness converged on the same skill format — `SKILL.md` — but
*not* on the same install location:

| Agent | Reads skills from |
|---|---|
| DeepSeek Harness (`dsh`) | `~/.agents/skills/` + `<project>/.agents/skills/` |
| Codex CLI | `~/.agents/skills/` + `<project>/.agents/skills/` |
| Claude Code | `~/.claude/skills/` + `<project>/.claude/skills/` |
| Gemini CLI | `~/.gemini/skills/` + `<project>/.gemini/skills/` |
| GitHub Copilot CLI | `~/.copilot/skills/` + `<project>/.github/skills/` |
| Cursor / OpenCode / OpenClaw | their own roots ([full matrix](docs/compatibility-matrix.md)) |

Plugins fragment even further: Claude Code wants
`/plugin marketplace add`, dsh wants
`dsh plugin --profile web add "github:o/r#path:/dsh-plugin"`, Gemini wants
`gemini extensions`. `aipx` is the missing common denominator: one installer,
one registry, one list, for all of them.

## Commands

```bash
aipx install owner/repo                          # repo root or skills/ auto-detected
aipx install owner/repo#path:/skills/their-skill # subdirectory (same syntax as dsh)
aipx install https://github.com/owner/repo/tree/v1.2/skills/x   # pinned ref
aipx install ./my-skill                          # local directory
aipx install owner/mcp-server                    # .mcp.json repos add MCP servers too
aipx install owner/repo --project                # project-scoped: .claude/skills,
                                                 # .agents/skills, .github/skills, …
                                                 # committed with the repo for the team

aipx upgrade         # re-install recorded skills from their source (--force semantics)
aipx list            # what's installed, per agent
aipx search deepseek # curated registry; add --github for live GitHub topics
aipx lint skills     # validate SKILL.md quality (frontmatter, triggers, links, nesting)
aipx new my-skill    # scaffold a publish-ready dual-target skill repo
aipx mcp list        # inventory MCP servers across every agent's config
aipx mcp import      # register discovered MCP servers into the aipx hub
aipx mcp serve       # run the hub: one MCP server, ~4 tools, zero context bloat
aipx remove <name>   # uninstall everywhere
aipx doctor          # environment + agent detection report
```

Example:

```console
$ aipx install JimmyLv/bibigpt-skill#path:/skills/bibi
✔ detected skill with 1 skill(s):
    bibi — Summarize YouTube, Bilibili videos and podcasts…
✔ target roots:
    /Users/you/.agents/skills   (DeepSeek Harness (dsh))
    /Users/you/.claude/skills   (Claude Code)
✔ installed bibi into 2 root(s)
```

## MCP hub — every server, ~4 tools, one context

Every downstream MCP server dumps its full tool catalog into your context.
With 20 servers × 10 tools that's tens of thousands of tokens of tool
definitions the model must wade through on every turn.

The aipx hub flips it: one MCP server (the hub) fronts all of them and
exposes ~4 meta tools. The model **searches** for a capability, gets the
matching tool's `inputSchema` back, then **calls** it — loading only what it
uses.

```bash
aipx mcp import        # pull every MCP server found in your agent configs
aipx mcp serve         # speak MCP over stdio; wire this into any agent:
#   { "mcpServers": { "aipx": { "command": "aipx", "args": ["mcp", "serve"] } } }
```

| Meta tool | Purpose |
|---|---|
| `mcp_search` | keyword-search every downstream tool; returns id + description + `inputSchema` |
| `mcp_call` | execute a downstream tool by `server/tool` id from `mcp_search` |
| `mcp_status` | registered servers, tool counts, health |
| `mcp_refresh` | re-scan servers after you add or remove one |

Downstream servers are spawned on demand and reused; remote (HTTP) servers
and vector search (pluggable index, e.g. a [zvec](https://github.com/alibaba/zvec)
sidecar) are on the roadmap. Docs: [MCP hub guide](docs/mcp-hub.md) · [vector search design](docs/mcp-hub-vector-search.md).

## What's bundled (the toolkit)

This repo is itself a plugin payload — use it three ways:

```bash
# 1. Plain skills, every agent:
aipx install zhangliang0115/ai-plugin

# 2. Claude Code marketplace:
#    /plugin marketplace add zhangliang0115/ai-plugin
#    /plugin install ai-plugin-toolkit@ai-plugin

# 3. DeepSeek Harness bundle:
dsh plugin --profile web add "github:zhangliang0115/ai-plugin#path:/dsh-plugin"
```

| Skill | Teaches your agent to |
|---|---|
| `skill-author` | write SKILL.md skills that load in every harness — incl. the tier-shadowing and discovery gotchas generic guides miss |
| `skill-portability-audit` | audit "works in Claude but not in dsh" failures: collisions, shadowing, trigger quality, per-agent smoke matrix |
| `dsh-plugin-dev` | package & publish DeepSeek Harness bundles (cordis.patch.yml, ctx.skills.register, the git-install gotchas) |
| `claude-plugin-dev` | publish Claude Code plugins & marketplaces with the dual-target pattern (one repo → every agent) |
| `deepseek-cost-router` | route work between deepseek-chat / deepseek-reasoner to cut API cost |
| `deepseek-migration` | migrate an agent setup from OpenAI/Anthropic to DeepSeek — caching, tool-calling, cost levers, dsh option |

## Design principles

- **Zero dependencies.** One JS file per concern, `node:test` suite, no
  supply-chain surface.
- **Non-destructive.** Installs skip existing targets unless `--force`;
  `--dry-run` previews; removal goes through a manifest.
- **One canonical root.** `~/.agents/skills` is the shared standard (read
  natively by dsh and Codex) — install writes one copy there and nothing else.
  No duplicate trees, no drift.
- **Context-first MCP.** The hub fronts every downstream MCP server with a
  handful of meta tools; the model searches and calls on demand instead of
  loading every tool definition into context.

## Docs

- [Compatibility matrix](docs/compatibility-matrix.md) — every root, every tier
- [Install into DeepSeek Harness (dsh)](docs/install-into-dsh.md) — researched guide: skill roots, tiers, bundle format, gotchas
- [Install into Claude Code](docs/install-into-claude-code.md) — marketplaces & plugins
- [MCP config sync](docs/mcp-sync.md) — 简体中文版：[docs/mcp-sync.zh-CN.md](docs/mcp-sync.zh-CN.md)
- [Publish once, target every agent](docs/publish-dual-target.md) — the dual-target repo layout
- [Troubleshooting](docs/troubleshooting.md) — common failures and fixes

## Requirements

Node.js ≥ 20 and `tar` (built into macOS, Linux, Windows 10+). No `npm install`
step — `npx github:zhangliang0115/ai-plugin` runs straight from the repo.
Optional: `GITHUB_TOKEN` for higher API rate limits.

## Roadmap

- [x] v0.1 — install / list / search / remove / doctor
- [x] v0.2 — project-scope installs, `aipx new` scaffolder, `aipx upgrade`, lint
- [x] v0.3 — MCP server config sync, registry validation bot + website + install smoke
- [x] v0.4 — **MCP hub** (`mcp import` / `mcp serve`), skills toolkit (6 skills)
- [ ] next — vector search for the hub (pluggable index), npm registry publish, registry collections

See [ROADMAP.md](ROADMAP.md) and [CHANGELOG.md](CHANGELOG.md).

## Contributing

PRs welcome — especially new curated registry entries and community-tier root
confirmations. See [CONTRIBUTING.md](CONTRIBUTING.md) and the
[plugin submission template](.github/ISSUE_TEMPLATE/plugin-submission.md).

## License

[MIT](LICENSE) © 2026 zhangliang0115
