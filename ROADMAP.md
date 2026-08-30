# Roadmap

Releases are small and frequent. Star the repo / watch releases to follow along.

## v0.1 — shipped 2026-08

- [x] `aipx install` — GitHub (repo / `#path:` subdir / pinned ref URL) and local payloads
- [x] Payload detection: single skill, skills collection, flat-skill normalization,
      Claude plugin, dsh bundle
- [x] Multi-agent install into detected official-tier roots; `--agents`, `--all`,
      `--force`, `--dry-run`
- [x] `aipx sync` — `~/.agents/skills` as primary, symlinks (or `--copy`) into other roots
- [x] `aipx list` / `aipx remove` / `aipx search` (+ `--github`) / `aipx doctor`
- [x] Bundled toolkit: skill-author, dsh-plugin-dev, claude-plugin-dev, deepseek-cost-router
- [x] Repo doubles as a Claude Code marketplace and a dsh bundle
- [x] Curated registry (`registry/index.json`)

## v0.2 — complete

All five v0.2 items shipped. Next up: v0.3 (MCP config sync, npm publish, registry bot checks).

- [x] `--project` installs (`.claude/skills/`, `.agents/skills/`, `.github/skills/` …) — official-tier roots by default, `--agents` to narrow
- [x] `aipx upgrade [name]` — re-install from the recorded source (multi-skill payloads fetched once; new upstream skills land automatically)
- [x] `aipx lint [path]` — validate SKILL.md frontmatter (name/description, kebab-case, trigger quality, size limits), nested-skill detection, broken relative links; runs on bundled skills in CI
- [x] `aipx new <name>` — scaffold a dual-target skill repo (skills/ + Claude marketplace + dsh bundle + drift-checked copies + CI, README with ready install lines)
- [x] Windows junction support for `sync` — NTFS junctions need no admin rights or Developer Mode, so linking works on stock Windows (doctor reports the fallback)

## v0.3 — in progress

- [x] MCP server config sync across agents (`aipx mcp list` / `aipx mcp sync <name>`) — JSON merge + minimal TOML writer for Codex, community targets opt-in
- [x] MCP-config payloads: `aipx install` also works on repos that ship only `.mcp.json` / `mcp.json`
- [x] Registry submissions via PR bot checks — CI validates every entry against the GitHub API (repo exists, schema coherent, no duplicates)
- [ ] npm registry publish (`npm i -g aipx`), Homebrew tap

## v0.4 — MCP hub (flagship) — in progress

- [x] `aipx mcp import` — register every MCP server found in the known agent configs
- [x] `aipx mcp serve` — the hub over stdio: 4 meta tools (search / call / status / refresh); downstream stdio servers spawned on demand, respawn on crash; tool failures surfaced as isError results the model can read
- [x] `sync` removed — `~/.agents/skills` is the shared standard (read natively by dsh & Codex); install writes one canonical copy and nothing else
- [x] Skills toolkit grown to 6 (added `skill-portability-audit`, `deepseek-migration`; sharpened the other four around cross-agent angles)
- [x] pluggable search index for the hub — `SidecarIndex` speaking the sidecar protocol (build/search over JSON lines) with permanent lexical fallback on missing/crashing/slow sidecars; Python zvec reference sidecar still open
- [x] remote (streamable HTTP) downstream servers — session capture/replay, JSON + SSE responses

## Later

- [x] Registry collections — curated best-of bundles (`aipx collection` / `--run` installs the whole stack; starters: deepseek-coding, getting-started)
- [ ] npm registry publish (`npm i -g aipx`), Homebrew tap
- [ ] Skill analytics hooks (opt-in)

## Non-goals

- Running arbitrary code at install time (aipx only copies files; dsh bundle
  installs run under dsh's own permission model; the MCP hub spawns only
  servers the user explicitly registered in its config)
- Star farms / fake metrics — growth comes from usefulness only
