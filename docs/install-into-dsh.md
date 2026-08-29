# Installing plugins & skills into DeepSeek Harness (dsh)

Research summary — how GitHub projects actually get installed into DeepSeek
Harness as of August 2026. DeepSeek Harness (`dsh`,
[`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness))
is DeepSeek AI's open-source agent harness with an everything-is-a-plugin
architecture built on Cordis. It reads the same `SKILL.md` skill format as
Claude Code.

## Two paths, pick by need

| You want | Use |
|---|---|
| A skill (instructions the model loads on demand) | **Path A: skill root** — copy/symlink a `<name>/SKILL.md` folder |
| Code that extends the harness (tools, services, config layers) | **Path B: dsh bundle** — an npm package with a `dsh.bundle` manifest |

### Path A — skills into a discovery root (what `aipx` automates)

dsh discovers skills from several roots with a fixed tier order; the two you
use most:

| Tier | Root | Scope |
|---|---|---|
| 200 | `<project>/.agents/skills/` | nearest ancestor with `.git` |
| 500 | `~/.agents/skills/` | user-global (shared with Codex CLI) |

Install a skill from any GitHub repo (flat, no clone needed):

```sh
npx github:zhangliang0115/ai-plugin install owner/repo#path:/skills/their-skill
```

Manual equivalent, if you enjoy `git clone` + `cp`:

```sh
git clone https://github.com/owner/repo
mkdir -p ~/.agents/skills
cp -r repo/skills/their-skill ~/.agents/skills/
```

Rules that bite people:

- **Only direct children are discovered** — `~/.agents/skills/a/SKILL.md` is
  found, `~/.agents/skills/a/b/SKILL.md` is silently invisible.
- Project tier (200) **shadows** the user tier (500) on name collision —
  first-wins per layer, no warning.
- dsh needs `DEEPSEEK_API_KEY` exported before launch.
- Verify: in the Web UI, skills show up in the `/` command palette under the
  Skills group and in "Context injection · skill-catalog".

### Path B — install a bundle into a profile

A bundle is an npm package whose `package.json` declares:

```json
"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
```

and whose patch inserts plugin rows:

```yaml
- insert:
    - id: my-plugin
      name: my-dsh-plugin
```

Install from GitHub into the `web` profile:

```sh
dsh plugin --profile web add "github:owner/repo#path:/dsh-plugin"
# ^ quote it; # starts a shell comment otherwise
```

What happens: `dsh plugin` forwards to pnpm inside the profile directory
(`$DSH_HOME/profiles/<name>`), pnpm links the package, dsh appends the bundle
to `dsh.profile.bundles`, and the patch layer applies on boot after
`@deepseek-ai/dsh-base`.

The famous catch: **git installs fetch sources, not builds.** pnpm ≥ 10 runs
no `prepare` script from a git dependency until you allowlist it in the
profile's `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  my-dsh-plugin: true
```

…and re-run the `add`. Treat that as permission to run the package's code on
your machine; pin a commit (`github:owner/repo#<sha>`) for safety. Authors:
ship plain JS with no build step and users never see this.

Inspect the composed tree without booting:

```sh
dsh --profile web --dump-config   # shows a "# == owner-bundle" layer
```

Remove:

```sh
dsh plugin --profile web remove my-dsh-plugin
```

## Cross-agent payoff

The same skill folder works in Claude Code (`~/.claude/skills/`), dsh and
Codex (`~/.agents/skills/`), Gemini CLI (`~/.gemini/skills/`), and Copilot
(`~/.copilot/skills/`). Rather than maintaining N copies, use
`aipx sync` to link one copy into every root — see the
[compatibility matrix](compatibility-matrix.md).

## References

- Official plugin packaging tutorial:
  `deepseek-ai/deepseek-harness` → `docs/user/develop/basic/publish.md`
- Skill system (tiers, runtime registration):
  `packages/skill/skill/README.md` in the same repo
- Worked example: [`JimmyLv/bibigpt-skill`](https://github.com/JimmyLv/bibigpt-skill)
  (skills/ + dsh-plugin/ dual-target repo)
- Ecosystem index: GitHub topic [`dsh-plugin`](https://github.com/topics/dsh-plugin)
