---
name: skill-author
description: >-
  Write, structure, and publish a high-quality SKILL.md agent skill that works
  across Claude Code, DeepSeek Harness (dsh), Codex CLI, Gemini CLI, Copilot and
  Cursor. Use when creating a new skill, fixing a skill that fails to load, or
  preparing a skill repo for distribution.
---

# Authoring a cross-agent SKILL.md skill

A skill is a folder with a `SKILL.md` file inside. The file starts with a YAML
frontmatter block (name + description) followed by Markdown instructions the
agent loads on demand. Because Claude Code, DeepSeek Harness (dsh), Codex CLI,
Gemini CLI, Copilot and Cursor all read this same format, one well-authored
skill serves every agent.

## Anatomy

```
my-skill/
├── SKILL.md            # required: frontmatter + instructions
├── references/         # optional: long-form docs the model reads on demand
└── scripts/            # optional: helper scripts the skill may run
```

```markdown
---
name: my-skill
description: >-
  One or two sentences: what it does AND when to use it. This is the trigger
  the agent matches against the user's request — write it like a routing rule.
---

# My skill

Step-by-step instructions. Assume a competent engineer; be concrete, not vague.
```

## Rules that decide whether a skill works

1. **`name` must be kebab-case** — lowercase letters, digits, hyphens; max 64
   chars. Agents reject or mangle other names. `aipx` normalizes for you, but
   ship it correct.
2. **`description` is the trigger, not documentation.** Bad: "Utilities for
   working with things." Good: "Summarize YouTube/Bilibili videos and podcasts
   from a URL. Use when the user pastes a video or audio link."
3. **Keep SKILL.md under ~500 lines.** Put depth in `references/*.md` and link
   to them ("see references/schema.md"). Agents load the body only when the
   skill triggers; huge bodies waste context and dilute behavior.
4. **No nested skills.** Discovery scans only the *direct* children of a skill
   root — `skills/a/SKILL.md` is found, `skills/a/b/SKILL.md` is not.
5. **Relative links must stay relative.** If SKILL.md references
   `scripts/x.py`, the whole folder travels together — never link outside the
   skill directory.

## Where skills live (user roots)

| Root | Read by |
|---|---|
| `~/.agents/skills/<name>/SKILL.md` | DeepSeek Harness (dsh), Codex CLI |
| `~/.claude/skills/<name>/SKILL.md` | Claude Code |
| `~/.gemini/skills/<name>/SKILL.md` | Gemini CLI |
| `~/.copilot/skills/<name>/SKILL.md` | GitHub Copilot CLI |

Project-scoped equivalents exist too (e.g. `.claude/skills/`, `.agents/skills/`
in the repo). Don't copy by hand — use `aipx sync` to link one copy into every
agent root.

## Test before publishing

```sh
# does it parse and get discovered?
aipx install ./my-skill --dry-run
aipx install ./my-skill
aipx list
```

Then open your agent and confirm the skill appears (Claude Code: it shows in
the skill list; dsh: `/` command palette → Skills group).

## Publishing checklist

- [ ] Repo contains the skill folder at a stable path, e.g. `skills/my-skill/`
- [ ] `description` states trigger conditions, not just features
- [ ] Works from a clean install (`aipx install owner/repo#path:/skills/my-skill`)
- [ ] Add GitHub topics so discovery works: `agent-skills`, `claude-code`,
      `dsh-plugin` (if it also ships a dsh bundle), `deepseek` (if DS-related)
- [ ] Optional: dual-target packaging — see the `dsh-plugin-dev` and
      `claude-plugin-dev` skills
