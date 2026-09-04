# Custom quick actions & prompt tuning in dsh — use the natives first

Research result (2026-09): DeepSeek Harness already covers most of the
"custom quick actions / prompt optimization" surface natively. We will not
rebuild any of it. This doc records the native mechanisms so users don't have
to reverse-engineer them, then lists the thin increments our plugin adds on
top.

## Native mechanism 1 — quick prompts as skill files (zero code)

Drop a markdown file into a skill root and it appears in the chat `/` panel;
typing `/name` injects the file body into that turn. Files hot-reload — no
restart.

| Rank | Root |
|---|---|
| 100 | `<project>/.dsh/skills/` |
| 200 | `<project>/.agents/skills/` |
| 400 | `~/.dsh/skills/` |
| 500 | `~/.agents/skills/` |

Format — either a flat file or a directory bundle:

```markdown
---
name: review-my-pr
description: 按团队规范审查当前 PR
disable-model-invocation: true
---
（提示词模板正文……）
```

`disable-model-invocation: true` keeps the template out of the model's skill
catalog: it exists only as a user-typed `/name` shortcut, costing zero
catalog tokens. Omit it if you *want* the model to auto-invoke the skill too.

## Native mechanism 2 — standing prompt tuning via AGENTS.md

`~/.dsh/AGENTS.md` (global) plus the project's `AGENTS.md` / `CLAUDE.md` are
injected as a persistent baseline user message on the first request of every
session (64 KiB budget). This is the main zero-code channel for "optimize the
system prompt": put conventions, style rules, and standing instructions there.

## Native mechanism 3 — agent presets

`~/.dsh/.agent-presets/<id>/agent.cordis.yml` defines a full preset (persona,
tools, skills); sessions pick one at start and the UI can switch presets.
Copy an existing preset and edit — e.g. the shipped `standard` preset.

## What our plugin adds (and why it isn't a rebuild)

1. **Invocation policy on bundled skills.** `ctx.skills.register()` defaults
   to `{ modelInvocable: true, userInvocable: true }`. Pure "quick action"
   templates we ship pass `invocation: { modelInvocable: false, userInvocable:
   true }` so the model catalog stays lean.
2. **Real slash commands when a template needs parameters or orchestration.**
   `ctx.commands.register({ name, description, input: { hint }, handler })`
   with the dsh-plan-mode pattern — `agent.steer(createUserMessage(...))` —
   gives one-shot prompt workflows with argument slots and immediate UI
   feedback. Commands never enter model context by themselves; anything the
   model must see goes through steer/inject.
3. **System-prompt sections.** `ctx.systemPrompt.section({ name, order, text })`
   for resident behavior tuning shipped with the plugin (scoped, disposable,
   no user file edits required).

## Deliberately NOT built (natives win)

- A custom slash-command panel — the composer's `/` panel already lists host
  commands and user-invocable skills (`commands/change`, `skills/list` RPCs).
- A template store/manager UI — `~/.agents/skills/` files plus hot reload
  already is the management surface; editing files in the editor you're in
  beats any sidebar CRUD.
- AGENTS.md loading or `/name` injection — built into dsh-base / dsh-tool-skill.
