---
name: claude-plugin-dev
description: >-
  Package and publish a Claude Code plugin and marketplace (.claude-plugin/
  manifests, skills, commands, agents, hooks). Use when creating a Claude Code
  plugin, setting up a marketplace repo, or installing plugins into Claude Code.
---

# Building a Claude Code plugin & marketplace

A Claude Code **plugin** bundles skills, slash commands, subagents, hooks and
MCP servers into one installable unit. A **marketplace** is a git repo that
lists plugins so users can add it by name and install from it with one
command.

## Repo layouts

Single plugin:

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json         # {"name": "my-plugin", "version": "1.0.0", "description": "…"}
├── skills/                 # <name>/SKILL.md folders
├── commands/               # <command>.md slash commands
├── agents/                 # subagent definitions
└── hooks/                  # lifecycle hooks
```

Marketplace repo (can list many plugins, including its own subdirectories):

```
my-marketplace/
└── .claude-plugin/
    └── marketplace.json
```

```json
{
  "name": "my-marketplace",
  "owner": { "name": "you" },
  "plugins": [
    {
      "name": "my-plugin",
      "source": "./plugins/my-plugin",
      "description": "What it does",
      "category": "productivity",
      "keywords": ["skills", "automation"]
    }
  ]
}
```

A repo can be **both** marketplace and plugin: point the plugin entry at
`"./"` and put a `.claude-plugin/plugin.json` at the repo root (this is the
`zhangliang0115/ai-plugin` pattern).

## How users install

```sh
# inside Claude Code:
/plugin marketplace add you/my-marketplace     # git URL or owner/repo
/plugin install my-plugin@my-marketplace
```

Skills can also be dropped straight into `~/.claude/skills/<name>/SKILL.md`
without any plugin packaging — use `aipx install owner/repo` to do that plus
every other agent in one shot.

## Quality rules

1. **Plugin `name`**: kebab-case, stable — it's the namespace for commands.
2. **Skill descriptions are routing triggers** — say *when* to fire, not just
   *what* it is.
3. **Version your plugin.json** and keep a CHANGELOG; users update via
   `/plugin marketplace update`.
4. **Dual-manifest for reach**: adding a `.github/plugin.json` makes the same
   repo installable by GitHub Copilot CLI/VS Code tooling too.
5. **Hooks**: keep them narrow and fast; document exactly what they run —
   hooks execute shell on the user's machine, so earn trust explicitly.

## Distribution checklist

- [ ] `.claude-plugin/plugin.json` (plugin) or `marketplace.json` (marketplace)
- [ ] Skills validated: kebab-case names, trigger-style descriptions
- [ ] README shows the exact `/plugin marketplace add` line
- [ ] GitHub topics: `claude-code`, `claude-plugin`, `agent-skills`
- [ ] Cross-agent story (optional but high-leverage): also ship a
      `dsh-plugin/` bundle and plain `skills/` — see the `dsh-plugin-dev`
      skill and `zhangliang0115/ai-plugin/docs/publish-dual-target.md`
