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

## v0.2 — in progress

- [x] `--project` installs (`.claude/skills/`, `.agents/skills/`, `.github/skills/` …) — official-tier roots by default, `--agents` to narrow
- [x] `aipx upgrade [name]` — re-install from the recorded source (multi-skill payloads fetched once; new upstream skills land automatically)
- [ ] `aipx new <name>` — scaffold a dual-target skill repo
- [ ] Windows junction support for `sync` (CI matrix)
- [ ] `aipx lint` — validate SKILL.md frontmatter, description quality, size limits

## v0.3

- [ ] MCP server config sync across agents (`aipx mcp sync`)
- [ ] npm registry publish (`npm i -g aipx`), Homebrew tap
- [ ] Registry submissions via PR bot checks

## v0.4

- [ ] Quality ratings for registry entries (install smoke tests in CI)
- [ ] Registry website with per-agent install snippets
- [ ] Skill analytics hooks (opt-in)

## Non-goals

- Running arbitrary code at install time (aipx only copies files; dsh bundle
  installs run under dsh's own permission model)
- Star farms / fake metrics — growth comes from usefulness only
