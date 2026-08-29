# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/); versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Added

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

[0.1.0]: https://github.com/zhangliang0115/ai-plugin/releases/tag/v0.1.0
