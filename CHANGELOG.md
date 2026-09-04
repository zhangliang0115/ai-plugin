# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/); versioning: [SemVer](https://semver.org/).

## [0.5.2] — 2026-09-05

### Added

- **Prompt-cache stabilization for the hub** — the index builds from an
  id-sorted catalog (config order no longer leaks into what the model sees),
  unchanged catalogs skip rebuilds entirely (sidecar embed caches survive
  `mcp_refresh`), and score ties break deterministically by id in every
  engine. Reordered configs and repeated rebuilds now produce identical
  model-visible result order.
- **Console shows the live search engine** — the Search engine section reads
  "serving: zvec-hybrid-local" (or "lexical" after a fallback), reported by
  the sidecar through `mcp_status` (`{servers, searchEngine}`).
- **`aipx doctor` gained an mcp hub section** — registered server count,
  search sidecar configuration, and zvec availability in one place.
- **Registry** — three curated batches: five gh-api-verified dsh-ecosystem
  entries + collection, three first-party MCP servers (github, notion,
  supabase) + official-mcp-servers collection, and four high-star repos from
  the dsh-plugin topic (archify, ruflo, OpenViking, DeepSeek-Reasonix).
  22 entries, all verified at submission; the Pages site now renders
  collections too.
- Release pages embed the curated CHANGELOG section for the tagged version.

### Fixed

- Console copy referenced nonexistent `aipx hub start/status` commands.
- npm package omitted `sidecars/zvec_sidecar.py` — the documented
  `--sidecar` flow was unusable from an npm install.

## [0.5.1] — 2026-09-05

### Added

- **Prompt-cache stabilization for the hub** — the index builds from an
  id-sorted catalog (config order no longer leaks into what the model sees),
  unchanged catalogs skip rebuilds entirely (sidecar embed caches survive
  `mcp_refresh`), and score ties break deterministically by id in every
  engine. Reordered configs and repeated rebuilds now produce identical
  model-visible result order.
- **Console shows the live search engine** — the Search engine section reads
  "serving: zvec-hybrid-local" (or "lexical" after a fallback), reported by
  the sidecar through `mcp_status` (`{servers, searchEngine}`).
- Registry: five gh-api-verified dsh-ecosystem entries + a dsh-ecosystem
  collection; three first-party MCP servers (github, notion, supabase) + an
  official-mcp-servers collection. 18 entries, all verified at submission.
- Release notes are now extracted from this CHANGELOG into the release page.

## [0.5.0] — 2026-09-05

### Added

- **Hub console (dsh plugin)** — a "Hub Console" tab in dsh's Settings →
  Plugins: server pool with live health, add/remove servers, per-tool
  enable/disable (disabled tools leave the model-visible catalog), the full
  tool catalog with filtering, and a search playground that exercises the
  real `mcp_search` from the model's perspective. Backed by same-origin
  routes bridging to a lazily-spawned `aipx mcp serve` child; tui profiles
  skip the console and keep plain skills.
- **Search engines with a zero-config local hybrid** — the hub's search
  index auto-upgrades to zvec full-text (jieba-aware) or zvec hybrid when
  available. The local hybrid embeds with
  paraphrase-multilingual-MiniLM-L12-v2 (~220 MB ONNX via fastembed;
  auto-installed, auto-downloaded via hf-mirror, no API key) and RRF-fuses
  with full-text. `AIPX_EMBEDDING_*` selects a remote embeddings endpoint
  instead; `AIPX_LOCAL_EMBEDDINGS=0` stays pure full-text.
  Eval (`scripts/eval-search.mjs --compare`, 20 queries × 3 engines):
  lexical 8/20, full-text 7/20, hybrid-local 14/20 top-1 — Chinese
  phrasings 0/10 → 9/10.
- `aipx mcp serve --sidecar "<cmd> [args…]"` (or `mcp-hub.json`
  `search.sidecar`) wires a search sidecar; any failure falls back to
  lexical, never interrupting service.
- `disabledTools` in mcp-hub.json (editable from the console) removes tools
  from the model-visible catalog without unregistering the server.
- dsh bundle registers `deepseek-migration` and `skill-portability-audit`
  (they shipped in 0.4.2 but were never registered — regression test added);
  bundled quick-action-style skills can now declare invocation policy.

### Fixed

- dsh hybrid search wire shapes between console halves (status map, tools/
  results envelopes) and a runtime ReferenceError in status normalization.
- Docs: install-into-dsh documents a local-clone path for SSH-blocked
  networks; new docs record dsh-native quick-action mechanisms we
  deliberately don't rebuild (docs/dsh-quick-actions.md) and the MCP
  ecosystem reference list (docs/mcp-ecosystem.md).


## [0.4.2] — 2026-08-31

### Fixed

- **`aipx --version` reported 0.1.0 since v0.1.0** — the CLI's hardcoded
  VERSION was never bumped across releases. Version now lives in one place
  (`src/version.js`), a regression test pins package.json to it, and
  `aipx doctor` compares against the latest GitHub release.

## [0.4.1] — 2026-08-31

### Fixed

- MCP hub: the serve-time index refresh raced early client requests —
  `mcp_search`/`mcp_call` could hit an empty index. Input handling now starts
  only after the initial refresh, and search/call self-heal with a lazy
  refresh if needed.
- MCP hub: the startup banner went to stdout, violating the stdio transport
  (stdout carries only JSON-RPC). All serve logs now go to stderr.
- Verified end-to-end against `@modelcontextprotocol/server-filesystem`
  (search ranking, real file read via `mcp_call`, 14 tools discovered);
  real transcript added to docs/mcp-hub.md.

## [0.4.0] — 2026-08-31

### Added

- **MCP hub** (`aipx mcp import` / `aipx mcp serve`) — one MCP server that
  fronts every registered downstream server with ~4 meta tools (`mcp_search`,
  `mcp_call`, `mcp_status`, `mcp_refresh`). The model searches for a
  capability, receives the matched tool's `inputSchema`, then calls it —
  context cost stays flat no matter how many servers are registered.
  Downstream stdio servers spawn on demand and respawn after crashes; tool
  failures surface as `isError` results the model can read and adjust.
- Skills toolkit grown to six: new `skill-portability-audit` (cross-agent
  failure modes — tier shadowing, nesting, name mangling, trigger starvation —
  and a fix-priority audit procedure) and `deepseek-migration`
  (OpenAI/Anthropic → DeepSeek: endpoint compat, caching prefix sensitivity,
  reasoner token economics, tool-calling, dsh). `skill-author` /
  `claude-plugin-dev` repositioned around the cross-agent / dual-target
  angles.
- Troubleshooting guide (docs/troubleshooting.md).

### Removed

- **`aipx sync`** and the multi-root install fan-out. `~/.agents/skills` is
  the shared standard — read natively by DeepSeek Harness (dsh) and Codex
  CLI — so user-scope installs now write exactly one canonical copy there.
  (Mirror it to agents lacking support yourself; the compatibility matrix
  documents each agent's root.)

## [0.3.0] — 2026-08-30

### Added

- MCP-config payloads: `aipx install` now recognizes repos that ship a
  `.mcp.json` / `mcp.json` (pure MCP server repos) and adds their server
  definitions to the target agents' MCP configs (JSON merge + Codex TOML
  writer). Tier policy applies: official configs by default, community with
  `--all`/`--agents`.
- MCP server uninstall: `aipx remove <name>` recognizes mcp-config entries and
  removes the definition from each recorded config (JSON delete preserving
  other keys/servers; Codex TOML section removal preserving other tables).
- `mcp list/sync --project [path]` — team-shared project MCP configs
  (Claude Code's `.mcp.json`, community: `.cursor/mcp.json`).
- `list --project [path]` — project-scoped skill inventory.
- `remove` also scans manifest-recorded roots, so project-scoped installs are
  removable via the CLI (legacy dest-path entries normalized).
- Registry website: `scripts/build-site.mjs` renders the registry into a
  dependency-free static page, auto-deployed to GitHub Pages.
- Registry install smoke: a weekly CI run executes every registry `aipx install`
  line in dry-run mode against live GitHub (isolated config, no writes) and
  posts a per-entry summary — dead install lines are caught before users hit
  them.
- `sync --prune` removes dangling links whose primary skill is gone; a broken
  link at a destination no longer blocks re-linking (cleared instead of failing
  with EEXIST), and links self-heal when a primary skill reappears.
- npm publish workflow (`.github/workflows/npm-publish.yml`), gated on the
  `NPM_TOKEN` secret.
- Troubleshooting guide (docs/troubleshooting.md) and Chinese translation of
  the MCP sync guide (docs/mcp-sync.zh-CN.md).
- Install hints now render the concrete owner/repo (and `#path:` subdirectory)
  instead of placeholders.

### Changed

- CI test step retries per test file (3 attempts) to absorb the node:test
  child-runner IPC deserialization flake seen on shared runners.

## [0.2.0] — 2026-08-29

### Added

- Registry install smoke: a weekly CI run executes every registry `aipx install`
  line in dry-run mode against live GitHub (isolated config, no writes) and
  posts a per-entry summary — dead install lines are caught before users hit
  them.
- Registry validation bot: CI (and `npm run validate-registry`) checks every
  `registry/index.json` entry against the GitHub API — repo exists and is
  public, schema fields present, install lines on installable kinds, no
  duplicate listings. PRs adding entries fail fast with per-entry errors.
- `mcp list [--json]` and `mcp sync <name>` — cross-agent MCP server config
  inventory and sync. Reads `~/.claude.json`, `~/.gemini/settings.json`,
  `~/.cursor/mcp.json`, `~/.copilot/mcp-config.json`, OpenCode's
  `opencode.json`, and Codex's TOML `config.toml`. JSON targets are merged
  (unrelated keys preserved); Codex gets a minimal `[mcp_servers.NAME]` table
  writer that leaves the rest of the file untouched; remote (url) servers are
  skipped for Codex and OpenCode stays read-only (shape differs), both with
  explicit messages. Community-tier targets need `--all`/`--agents`.
- `new <name>` — scaffold a publish-ready dual-target skill repo: `skills/`
  source of truth, `.claude-plugin/` marketplace manifests, `dsh-plugin/`
  bundle (with runtime skill registration), drift-check + sync scripts, CI
  workflow that dogfoods `aipx lint`, and a README with the three install
  lines pre-filled (`--owner` bakes your username; author from git config).
- `lint [path] [--json]` — validate SKILL.md quality: frontmatter presence,
  kebab-case names (and directory-name mismatch), trigger-style descriptions
  (missing = error, short/over-limit = warning), body size (progressive
  disclosure), nested-skill detection (spec violation), broken relative links,
  orphan directories without SKILL.md. Exit code 1 on errors; CI runs it on
  the bundled skills.
- `install --project [path]` — project-scoped installs: writes skills into
  `.claude/skills/`, `.agents/skills/`, `.gemini/skills/`, `.github/skills/` (and
  community roots with `--all`/`--agents`) inside the given directory so a repo
  carries its own skills for the whole team. Project mode targets official-tier
  agents with a project root regardless of what is installed locally; `--agents`
  narrows the set. Installs are recorded with a `project` scope in the manifest.
- `upgrade [name]` — re-install recorded skills from their recorded source with
  force semantics; entries are grouped by source so a multi-skill payload is
  fetched once, and skills added upstream land automatically. Skills removed
  upstream are left on disk (use `remove`). `AIPX_CONFIG_DIR` env var isolates
  the manifest for tests/CI.

### Fixed

- `sync` now uses NTFS junctions on Windows instead of directory symlinks —
  junctions need no admin rights or Developer Mode, so linking works on stock
  Windows; `doctor` reports the fallback it detected.
- `sync --prune` removes dangling links whose primary skill is gone; a broken
  link at a destination no longer blocks re-linking (it is cleared instead of
  failing with EEXIST), and links self-heal when a primary skill reappears.
- GitHub installs crashed with ENOENT between payload detection and the copy
  step — the download temp directory is now cleaned up only after the install
  body finishes.
- The install manifest recorded per-skill destination paths in `roots` instead
  of the containing agent root, which would have broken re-install flows
  (nested `<root>/<skill>/<skill>`). New installs record true roots; `upgrade`
  normalizes old entries.

## [0.1.0] — 2026-08-29

### Added

- `aipx` CLI (`bin/aipx.js`, zero runtime dependencies, Node ≥ 20):
  - `install <source>` — GitHub (`owner/repo`, `owner/repo#path:/sub`, URLs with
    pinned ref) and local payloads; detects single skills, skill collections,
    flat skills (normalized to `<name>/SKILL.md`), Claude plugins and dsh
    bundles; installs into all detected agents; `--agents`, `--all`, `--force`,
    `--dry-run`; manifest-backed.
  - `sync` — mirrors `~/.agents/skills` into every other detected agent root
    via symlinks (`--copy` supported); `--dry-run`.
  - `list [--json]`, `remove <name>`, `search <query> [--github]`, `doctor`.
- Bundled toolkit skills: `skill-author`, `dsh-plugin-dev`,
  `claude-plugin-dev`, `deepseek-cost-router`.
- Repo as plugin payload: `.claude-plugin/marketplace.json` (Claude Code
  marketplace) + `dsh-plugin/` (DeepSeek Harness bundle registering all four
  skills, plain JS, no build step).
- Curated registry `registry/index.json` (verified entries only).
- Docs: compatibility matrix, install-into-dsh, install-into-claude-code,
  publish-dual-target guides; English + Chinese READMEs.
- CI: `node --test` on Node 20/22/24, syntax lint, dsh-skill drift check.

[0.3.0]: https://github.com/zhangliang0115/ai-plugin/releases/tag/v0.3.0
[0.4.1]: https://github.com/zhangliang0115/ai-plugin/releases/tag/v0.4.1
[0.4.0]: https://github.com/zhangliang0115/ai-plugin/releases/tag/v0.4.0
[0.3.0]: https://github.com/zhangliang0115/ai-plugin/releases/tag/v0.3.0
[0.2.0]: https://github.com/zhangliang0115/ai-plugin/releases/tag/v0.2.0
[0.1.0]: https://github.com/zhangliang0115/ai-plugin/releases/tag/v0.1.0
