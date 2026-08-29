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
re-do it after every upstream update.

**`aipx` fixes this.** One command downloads the payload once and installs it
into every agent it finds on your machine. One `sync` links your skill library
across all of them. The bundled skills teach you (and your agents) how to
publish for every harness from a single repo.

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
one sync, one list, for all of them.

## Commands

```bash
aipx install owner/repo                          # repo root or skills/ auto-detected
aipx install owner/repo#path:/skills/their-skill # subdirectory (same syntax as dsh)
aipx install https://github.com/owner/repo/tree/v1.2/skills/x   # pinned ref
aipx install ./my-skill                          # local directory
aipx install owner/repo --project                # project-scoped: .claude/skills,
                                                 # .agents/skills, .github/skills, …
                                                 # committed with the repo for the team

aipx sync            # link ~/.agents/skills into every other detected agent root
aipx upgrade         # re-install recorded skills from their source (--force semantics)
aipx list            # what's installed, per agent
aipx search deepseek # curated registry; add --github for live GitHub topics
aipx lint skills     # validate SKILL.md quality (frontmatter, triggers, links, nesting)
aipx new my-skill    # scaffold a publish-ready dual-target skill repo
aipx mcp list        # inventory MCP servers across every agent's config
aipx mcp sync fetch  # copy an MCP server definition into all other agents
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
| `skill-author` | write SKILL.md skills that load in every harness |
| `dsh-plugin-dev` | package & publish DeepSeek Harness bundles (cordis.patch.yml, ctx.skills.register, the git-install gotchas) |
| `claude-plugin-dev` | publish Claude Code plugins & marketplaces |
| `deepseek-cost-router` | route work between deepseek-chat / deepseek-reasoner to cut API cost |

## Design principles

- **Zero dependencies.** One JS file per concern, `node:test` suite, no
  supply-chain surface.
- **Non-destructive.** Installs skip existing targets unless `--force`;
  `--dry-run` previews; removal goes through a manifest.
- **Honest tiers.** Officially documented roots are written by default;
  community-reported roots (Cursor, OpenCode, OpenClaw) need `--all` or
  `--agents`.
- **Standards first.** SKILL.md everywhere; symlinks over copies;
  `~/.agents/skills` as the sync primary because dsh and Codex already share it.

## Docs

- [Compatibility matrix](docs/compatibility-matrix.md) — every root, every tier
- [Install into DeepSeek Harness (dsh)](docs/install-into-dsh.md) — researched guide: skill roots, tiers, bundle format, gotchas
- [Install into Claude Code](docs/install-into-claude-code.md) — marketplaces & plugins
- [Publish once, target every agent](docs/publish-dual-target.md) — the dual-target repo layout

## Requirements

Node.js ≥ 20 and `tar` (built into macOS, Linux, Windows 10+). No `npm install`
step — `npx github:zhangliang0115/ai-plugin` runs straight from the repo.
Optional: `GITHUB_TOKEN` for higher API rate limits.

## Roadmap

- [x] v0.1 — install / sync / list / search / remove / doctor
- [ ] v0.2 — project-scope installs (`--project`), `aipx new` skill scaffolder, update flow (`aipx upgrade`)
- [ ] v0.3 — MCP server config sync across agents, npm registry publish
- [ ] v0.4 — quality ratings & skill linting (`aipx lint`), registry website

See [ROADMAP.md](ROADMAP.md) and [CHANGELOG.md](CHANGELOG.md).

## Contributing

PRs welcome — especially new curated registry entries and community-tier root
confirmations. See [CONTRIBUTING.md](CONTRIBUTING.md) and the
[plugin submission template](.github/ISSUE_TEMPLATE/plugin-submission.md).

## License

[MIT](LICENSE) © 2026 zhangliang0115
