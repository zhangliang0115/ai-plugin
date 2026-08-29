---
name: deepseek-migration
description: >-
  Migrate an existing coding agent or workflow from OpenAI/Anthropic APIs to
  DeepSeek (deepseek-chat / deepseek-reasoner). Covers endpoint compatibility,
  environment variables, caching behavior, tool-calling differences, cost
  levers, and the DeepSeek Harness (dsh) option. Use when a user wants to
  switch to DeepSeek or cut their LLM bill.
---

# Migrating an agent setup to DeepSeek

DeepSeek is OpenAI-API-compatible, and Anthropic-compatible endpoints exist
for harnesses like Claude Code — so migration is mostly configuration, not
rewrites. What actually breaks is rarely the endpoint; it's caching behavior,
tool calling, and cost assumptions.

## Step 1 — pick the integration path

| Current setup | Path |
|---|---|
| OpenAI SDK / any OpenAI-compatible tool | Point `base_url` to `https://api.deepseek.com`, swap the key, set model ids |
| Claude Code | Use the documented Anthropic-compatible endpoint (env-var style config) |
| Want a native harness | DeepSeek Harness (`dsh`): `npx @deepseek-ai/dsh web` — reads `DEEPSEEK_API_KEY` |
| Editor plugins (Cline etc.) | Custom provider with DeepSeek base URL |

Official per-tool guides: https://api-docs.deepseek.com/guides/coding_agents

Model ids: **`deepseek-chat`** (fast, cheap, non-thinking) and
**`deepseek-reasoner`** (chain-of-thought, slower, pricier).

## Step 2 — the four things that actually differ

1. **Prefix caching is automatic and prefix-sensitive.** DeepSeek bills
   repeated identical prompt prefixes at a steep discount — but the prefix
   must be *identical*. Put the stable system prompt and repo map first;
   never shuffle timestamps or dynamic content in front of them. A reordering
   silently kills your cache-hit rate.
2. **`deepseek-reasoner` thinking tokens bill as output.** A reasoner call
   can cost many multiples of a chat call. Route: routine edits on chat,
   escalate only hard debugging/design to reasoner (see the
   `deepseek-cost-router` skill for the ladder).
3. **Tool calling shape.** OpenAI-style function calling works, but weaker
   harness adherence shows up as missed tool calls. If a tool-heavy workflow
   degrades, simplify tool schemas (fewer optional params) before blaming the
   model. Editor-plugin users report Cline handles DeepSeek tool calls better
   than some alternatives.
4. **Context handling.** Long back-and-forth sessions lose the shared prefix
   and re-bill at full price. For batch/offline work (branch review, doc
   generation), use dedicated sessions so the prefix stays stable.

## Step 3 — verify the migration

```sh
# smoke test the endpoint directly (OpenAI-compatible):
curl https://api.deepseek.com/chat/completions \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"ping"}]}'
```

Then in your agent: one trivial task on `deepseek-chat`, one hard task on
`deepseek-reasoner`, and check the platform dashboard shows both models and
(non-zero) cache-hit tokens. Zero cache hits = your prompt prefix is being
mutated before each call — fix ordering.

## Rollback and hybrid

The API is compatible enough to keep the old provider configured alongside:
route critical-path work to the old provider during the trial week and batch
work to DeepSeek. Compare cost per completed task, not per token — reasoner
tokens cost more but can replace whole retry loops.
