# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/); versioning: [SemVer](https://semver.org/).

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
