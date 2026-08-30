# Compatibility matrix

Which agent reads which skill root, how it installs plugins, and what aipx
does about it. `official` = documented by the tool itself; `community` =
reported by users, not yet confirmed by official docs (aipx only writes these
roots with `--all` or an explicit `--agents <id>`).

| Agent | User skill root | Project skill root | Plugin install method | Tier |
|---|---|---|---|---|
| DeepSeek Harness (`dsh`) | `~/.agents/skills/` | `<project>/.agents/skills/` | `dsh plugin --profile <p> add "github:o/r#path:/dsh-plugin"` | official |
| Codex CLI | `~/.agents/skills/` | `<project>/.agents/skills/` | skills directories; AGENTS.md ecosystem | official |
| Claude Code | `~/.claude/skills/` | `<project>/.claude/skills/` | `/plugin marketplace add owner/repo` + `/plugin install name@marketplace` | official |
| Gemini CLI | `~/.gemini/skills/` | `<project>/.gemini/skills/` | `gemini extensions` | official |
| GitHub Copilot CLI | `~/.copilot/skills/` | `<project>/.github/skills/` | `copilot plugin marketplace add owner/repo`; `.github/plugin.json` manifest | official |
| Cursor | `~/.cursor/skills/` | `<project>/.cursor/skills/` | rules + skills directories | community |
| OpenCode | `~/.config/opencode/skills/` | `<project>/.opencode/skills/` | config + skills directories | community |
| OpenClaw | `~/.openclaw/skills/` | — | skills directories / ClawHub | community |

## What aipx does with this

- **`aipx install <source>`** (user scope) writes one canonical copy into
  `~/.agents/skills/` — the shared root dsh and Codex read natively.
  Agents without native support for that root need a link from their own
  root (e.g. Claude Code: `ln -s ~/.agents/skills/<name> ~/.claude/skills/<name>`),
  or use `--project` to write team-shared copies into a repo.
- **`aipx doctor`** shows this matrix for *your* machine: which agents it
  found, via binary or config dir, and whether roots are writable.

## Notes and gotchas discovered during research

- dsh scans **only direct children** of a discovery root; nested
  `a/b/SKILL.md` is invisible.
- dsh reads `~/.agents/skills` at tier 500 (user-global); project
  `.agents/skills` (tier 200) shadows it. Tier order matters when names
  collide: lower tier wins outright, no warning.
- Claude Code skills must be `<name>/SKILL.md`; flat `name.md` files are a
  dsh convenience — aipx normalizes them into directories on install.
- dsh git-plugin installs fetch **sources, not builds**: a plugin that needs
  a build step requires the user to allowlist it in `pnpm-workspace.yaml`
  (`allowBuilds`). Ship plain JS to avoid the friction entirely.
- Copilot CLI and VS Code also read `.github/skills/` — a good home for
  project-scoped skills shared across a team.
