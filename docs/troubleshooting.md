# Troubleshooting

Common problems, their causes, and fixes. Run `aipx doctor` first — it
answers most of these automatically.

## The skill doesn't show up in my agent

1. **Restart the agent session.** Claude Code and most agents scan skill roots
   at session start; dsh's Web UI picks skills up on reload.
2. **Check the name is exactly where the agent looks.** Run `aipx list` —
   it shows every known agent root and what's in them.
3. **Nested skills are invisible.** Agents only discover *direct children* of
   a skill root: `~/.agents/skills/foo/SKILL.md` is found;
   `~/.agents/skills/foo/bar/SKILL.md` is not. `aipx lint` flags this as an
   error.
4. **dsh tier shadowing.** A project-level `.agents/skills/foo` (tier 200)
   shadows a user-level `~/.agents/skills/foo` (tier 500) silently — first
   wins per layer. Rename one of them.
5. **dsh needs credentials.** Export `DEEPSEEK_API_KEY` before launching.

## `install` says "nothing to install"

The payload didn't contain anything aipx recognizes (SKILL.md, a skills/
directory, `.claude-plugin/plugin.json`, a dsh bundle, or an `.mcp.json`).
Check the hints aipx printed — they tell you what kind of repo it thinks this
is. If the repo's skill lives in a subdirectory, use the `#path:` syntax:

```sh
aipx install owner/repo#path:/skills/their-skill
```

## A target says "already exists — skipped unless --force"

The skill is already installed at that root. Re-run with `--force` to
overwrite, or `aipx upgrade` to refresh from the recorded source.

## GitHub API errors

- `403` / rate limit: set `GITHUB_TOKEN` (any token with public read scope)
  to raise the limit from 60 to 5,000 requests/hour.
- `repo not found (or private)`: the repo doesn't exist, was renamed, or is
  private — private repos aren't supported (tarball download requires auth we
  deliberately don't handle).

## dsh plugin installs

- **`allowBuilds` prompt on git installs**: pnpm ≥ 10 runs no build script
  from a git dependency until allowlisted. Best fix: authors ship plain JS
  with no build step (see the bundled `dsh-plugin-dev` skill).
- **Quote the install line**: the `#` in
  `github:owner/repo#path:/dsh-plugin` starts a shell comment otherwise.
- **Bundle installed but nothing changed**: check
  `dsh --profile <name> --dump-config` for a `# == your-bundle` layer; missing
  means the package lacks a `dsh.bundle` declaration.

## MCP sync

- **"not found in any known agent config"**: run `aipx mcp list` — it shows
  every config aipx reads. If your agent isn't listed there, its config isn't
  supported yet (open an issue with the config path).
- **Codex skipped a remote (url) server**: the TOML writer supports stdio
  definitions (command/args/env) so far.
- **OpenCode is read-only**: its definition shape differs (`command` as an
  array); `mcp sync` prints the definition to add manually.

## Windows specifics

- Local paths with drive letters (`C:\...\skill`) are recognized as install
  sources.
- User-scope installs write only `~/.agents/skills` — one copy, shared by dsh
  and Codex. If you mirror skills into other agents' roots yourself, plain
  `.cmd` wrappers or junctions (no admin rights needed) work well.

## Still stuck?

[Open an issue](https://github.com/zhangliang0115/ai-plugin/issues/new?template=bug_report.md)
with the full command output and `aipx doctor` report.
