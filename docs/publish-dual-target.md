# Publish once, target every agent

The fragmentation tax in August 2026: one skill, six different install roots,
three packaging formats. This guide shows the layout this repo uses so a
single source tree serves Claude Code, DeepSeek Harness (dsh), Codex CLI,
Gemini CLI, Copilot and Cursor — plus how `aipx` consumes it.

## The dual-target repo layout

```
your-repo/
├── skills/                       # ← single source of truth (SKILL.md folders)
│   ├── my-skill/SKILL.md
│   └── my-other-skill/SKILL.md
├── .claude-plugin/
│   ├── plugin.json               # makes the repo root a Claude Code plugin
│   └── marketplace.json          # makes the repo a Claude Code marketplace
├── dsh-plugin/                   # makes the repo a DeepSeek Harness bundle
│   ├── package.json              # "dsh": {"bundle": {"patch": "./cordis.patch.yml"}}
│   ├── cordis.patch.yml
│   ├── index.js                  # registers skills/ via ctx.skills.register
│   └── skills/                   # copies of skills/ (CI-enforced lockstep)
└── README.md
```

Every target consumes the same skills:

| Consumer | What they do | Install line |
|---|---|---|
| Claude Code | marketplace install | `/plugin marketplace add you/your-repo` |
| dsh | bundle install | `dsh plugin --profile web add "github:you/your-repo#path:/dsh-plugin"` |
| Everyone else (+ Claude/dsh too) | plain skills | `aipx install you/your-repo` |

Plain `skills/` is the lowest common denominator and never stops working —
even agents you've never heard of that read SKILL.md will pick it up via
`aipx install`.

## Keep the copies honest

`dsh-plugin/skills/` mirrors `skills/`. Don't hand-sync:

```sh
npm run sync-dsh-skills     # after editing any SKILL.md
npm run check-drift         # CI runs this; fails on drift
```

## Publish checklist

1. **Skills**: kebab-case names, trigger-style descriptions, < ~500 lines per
   SKILL.md, no nested skills (only direct children of a root are discovered).
2. **Claude manifests**: `plugin.json` name/version stable; `marketplace.json`
   entries carry description + keywords.
3. **dsh bundle**: plain JS (no build step — avoids the pnpm `allowBuilds`
   gate on git installs), `files` includes `skills/`, patch row `name:` must
   equal the bundle's package name.
4. **Discoverability**: GitHub topics `agent-skills`, `claude-code`,
   `claude-plugin`, `dsh-plugin`, `deepseek` (if DS-related). Then PR your
   repo into the [aipx registry](../registry/index.json).
5. **README**: show all three install lines from the table above. Users pick
   their agent; you support all of them.

## Why this wins

- One `git push` ships to every harness.
- Users on any agent get the same behavior — skills are the cross-agent
  format the whole ecosystem converged on.
- `aipx install you/your-repo` is the single command you print in your README;
  it fans out to whatever the reader has installed.
