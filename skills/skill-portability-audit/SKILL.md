---
name: skill-portability-audit
description: >-
  Audit whether an agent skill works across every harness (Claude Code,
  DeepSeek Harness dsh, Codex, Gemini CLI, Copilot, Cursor) before publishing
  or after a "my skill loads in Claude but not in dsh" report. Checks name
  collisions across roots, tier shadowing, discovery rules, and trigger
  quality per agent.
---

# Auditing a skill for cross-agent portability

A skill that works in one agent frequently breaks silently in another. The
failure modes are specific and checkable — run this audit before publishing,
and whenever a user reports "it loads in X but not in Y".

## The five silent failure modes

1. **Name collision + tier shadowing.** dsh and Codex read *both*
   `<project>/.agents/skills` (tier 200) and `~/.agents/skills` (tier 500).
   The same skill name at both levels: the project copy wins **silently** —
   no warning, ever. If a user's project has an unrelated skill with your
   name, yours never loads.
2. **Nested SKILL.md.** Every harness scans only the *direct children* of a
   skill root. `skills/a/SKILL.md` loads; `skills/a/b/SKILL.md` is invisible
   in all of them. Monorepos that nest skills under product directories hit
   this constantly.
3. **Name mangling.** Frontmatter `name: My Skill!` gets normalized
   differently by different tools — some mangle, some reject. The safe form
   is kebab-case matching the directory name exactly.
4. **Trigger starvation or flooding.** The `description` is the only thing
   agents match requests against. "A collection of helpers" never triggers;
   a description listing every keyword triggers on everything and dilutes
   routing.
5. **Format assumptions.** Flat `my-skill.md` files are a dsh convenience —
   Claude Code only reads `<dir>/SKILL.md`. And relative links to files
   outside the skill folder break the moment the skill is copied.

## The audit procedure

Run these in order; stop and fix at the first red flag.

```sh
# 1. Structural lint (frontmatter, nesting, links, orphans)
aipx lint skills/

# 2. Where does each agent actually see it?
aipx list            # user-scope view, per agent root
aipx list --project  # project-scope view

# 3. Collision check across ALL roots — the shadowing trap:
#    does the same skill name exist in more than one root?
#    (compare the output of `aipx list` against the project roots)
```

Manual checks the tooling can't do for you:

- [ ] `name` is kebab-case AND equals the directory name
- [ ] `description` answers "when should I fire?" in one sentence — read it
      and ask: would an agent route a real user request here? Too broad?
      Too vague?
- [ ] SKILL.md body ≤ ~500 lines; deep material moved to `references/`
- [ ] No skill references files outside its own folder
- [ ] If a project root also has this skill name: renamed or intentional?

## Cross-agent smoke matrix

Install once with aipx, then verify in each agent the user cares about:

| Agent | Verify how |
|---|---|
| Claude Code | skill appears in `/doctor` output; new session needed |
| dsh | `/` command palette → Skills group; needs `DEEPSEEK_API_KEY` |
| Codex | appears in skill listing on next run |
| Gemini CLI | next session; check `aipx list` root exists |

## Fix priority

When multiple issues exist, fix in this order — discovery problems first
(invisible skills), then trigger problems (loads but never fires), then
cosmetics:

1. naming/collision/shadowing → 2. description trigger → 3. size/structure →
4. links → 5. style.
