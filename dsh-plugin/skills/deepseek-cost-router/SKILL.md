---
name: deepseek-cost-router
description: >-
  Route coding tasks between DeepSeek chat and reasoning models (deepseek-chat
  vs deepseek-reasoner) to minimize API cost while keeping quality. Use when
  configuring an agent to use DeepSeek, choosing a model for a task batch, or
  optimizing token spend.
---

# Routing work to the right DeepSeek model

DeepSeek exposes two behaviors through its OpenAI-compatible API:

- **`deepseek-chat`** — the fast, non-thinking path. Cheap, low latency.
- **`deepseek-reasoner`** — the thinking path (chain-of-thought before the
  final answer). Slower and pricier per call, dramatically better on hard
  reasoning.

The routing skill: run routine volume on chat, escalate only reasoning-heavy
work.

## Escalation heuristics

Default to **chat** for: file edits driven by clear instructions, renames,
boilerplate, doc updates, formatted output, summarization, simple lookups,
bulk repetitive transformations.

Escalate to **reasoner** for: non-obvious bugs (state/caching/async/race),
algorithm design, architecture tradeoffs, tricky merges, math, contract or
spec violations, "the tests fail and the cause is unclear".

A cheap escalation ladder for agent harnesses that support it:

1. Try the task on chat with a tight instruction.
2. If the result fails review/tests, re-run just that unit on reasoner.
3. Feed the reasoner's answer back as the accepted fix; continue on chat.

Escalating *units of failure* instead of whole sessions keeps the premium
model's token share small.

## Cost mechanics worth knowing

- **Context caching**: repeated identical prefixes (system prompt, long file
  context) hit DeepSeek's automatic prefix cache and are billed at the much
  cheaper cache-hit rate. Keep your system prompt and repo map *stable and
  first* in the prompt; don't shuffle dynamic content in front of them.
- **Reasoner output is token-hungry**: thinking tokens bill as output. A
  reasoner call can cost many multiples of a chat call — reserve it.
- **Batch offline work** (code review of a branch, doc generation) into
  dedicated sessions where the shared context prefix is reused.

## Wiring DeepSeek into coding agents

DeepSeek's API is OpenAI-compatible, and Anthropic-compatible endpoints are
documented for harnesses like Claude Code — see the official integration hub:
https://api-docs.deepseek.com/guides/coding_agents (per-tool guides for
Claude Code, OpenCode, OpenClaw, Codex and more). You need:

- `DEEPSEEK_API_KEY` from https://platform.deepseek.com
- The base URL (`https://api.deepseek.com`) and model id set in your tool's
  provider config — follow the per-tool guide for exact env vars.

DeepSeek Harness (`dsh`) reads `DEEPSEEK_API_KEY` directly; if aipx doctor
warns it's missing, export it before launching.

## Verify

- Spot-check 10 recent tasks: would reasoner have changed the outcome? If no,
  your routing is right.
- Watch spend per model in the platform dashboard; a healthy setup keeps
  reasoner tokens a small fraction of total while review pass-rates hold.
