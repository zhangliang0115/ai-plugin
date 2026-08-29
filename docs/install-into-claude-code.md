# Installing plugins & skills into Claude Code

Research summary — how GitHub projects actually get installed into Claude Code
as of August 2026. Claude Code
([`anthropics/claude-code`](https://github.com/anthropics/claude-code)) reads
the SKILL.md skill format and has first-class plugin/marketplace support.

## Three paths

| You want | Use |
|---|---|
| A skill available everywhere | **Path A: skill root** |
| A curated bundle (skills + commands + agents + hooks) | **Path B: plugin from a marketplace** |
| Publish your own plugin for others | **Path C: build a marketplace repo** |

### Path A — skills into a root (what `aipx` automates)

User-global: `~/.claude/skills/<name>/SKILL.md`
Project-scoped: `<project>/.claude/skills/<name>/SKILL.md`

From any GitHub repo, no clone needed:

```sh
npx github:zhangliang0115/ai-plugin install owner/repo#path:/skills/their-skill
```

New skills load on the next session; `/doctor` if in doubt. Claude Code also
reads project `.claude/skills/` — that's the place for team-shared workflow
skills committed to the repo.

### Path B — install a plugin from a marketplace

Inside Claude Code:

```
/plugin marketplace add owner/repo        # any git repo hosting a marketplace.json
/plugin marketplace add https://github.com/owner/repo
/plugin install <plugin-name>@<marketplace-name>
```

A marketplace repo contains `.claude-plugin/marketplace.json` listing plugins;
each plugin points at a directory holding `.claude-plugin/plugin.json` plus
optional `skills/`, `commands/`, `agents/`, `hooks/`.

This very repo is a marketplace:

```
/plugin marketplace add zhangliang0115/ai-plugin
/plugin install ai-plugin-toolkit@ai-plugin
```

### Path C — publish your own

1. Add `.claude-plugin/plugin.json` to your plugin directory.
2. (Optional) Make the repo a marketplace with
   `.claude-plugin/marketplace.json` — pointing one entry at `"./"` makes the
   repo both at once.
3. Users: `/plugin marketplace add you/your-repo`.
4. Add GitHub topics `claude-plugin` / `claude-code` / `agent-skills` for
   discoverability.

See the bundled `claude-plugin-dev` skill for quality rules and the
[publish-dual-target guide](publish-dual-target.md) to also reach dsh/Codex/
Gemini/Copilot from the same source.

## Cross-agent payoff

`~/.agents/skills/` (the dsh + Codex shared root) and `~/.claude/skills/` are
different directories — keeping them in sync by hand is the #1 papercut. Use
`aipx sync` to link them once. Full table:
[compatibility matrix](compatibility-matrix.md).

## References

- Marketplace mechanics: `/plugin marketplace add` +
  `.claude-plugin/marketplace.json` (see Chris Ayers' "Agent Skills, Plugins
  and Marketplace: The Complete Guide", March 2026)
- Official skills collection: [`anthropics/skills`](https://github.com/anthropics/skills)
