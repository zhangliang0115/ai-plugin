# Hub vector search — sidecar design

Status: **design** (not yet implemented). The hub ships with a deterministic
lexical scorer; this document specifies how a vector index slots in without
changing anything else.

## The contract

Everything funnels through one function shape:

```
search(query: string, limit: number) → [{ id, server, name, description, inputSchema }]
```

`createHub({ servers, downstreamFactory, searchIndex })` accepts an optional
`searchIndex` implementing:

```js
{
  async build(entries)   // entries: [{ id, server, name, description }]; called per refresh
  async search(query, limit)  // → [{ id, score }] ranked best-first
}
```

The default `LexicalIndex` (shipped, zero-dep) implements exactly this. Any
implementation that honors the contract can replace it — the hub, the meta
tools, and the MCP transport are untouched.

## Why a sidecar, not an in-process dependency

The candidate vector engine, [alibaba/zvec](https://github.com/alibaba/zvec)
(15k+ stars), is C++ with no Node binding today. The project is also
committed to zero runtime dependencies — the CLI must keep working as
`npx github:…` with no build step.

So the vector index runs as a **separate process** the hub talks to:

```
┌─────────────┐  JSON lines over   ┌──────────────┐
│ aipx mcp    │  stdin/stdout or   │ zvec sidecar │
│ serve       │ ─────────────────► │ (python)     │
└─────────────┘   localhost HTTP    └──────────────┘
```

## Sidecar protocol (draft)

Newline-delimited JSON, same framing as MCP stdio:

```jsonc
// hub → sidecar: replace the whole catalog (per refresh)
{"op":"build","entries":[{"id":"filesystem/read_file","text":"read file Read the complete contents…"}]}
{"op":"ready"}                      // sidecar → hub: {"ok":true}

// hub → sidecar: search
{"op":"search","id":1,"query":"read file","limit":8}
// sidecar → hub:
{"id":1,"result":[{"id":"filesystem/read_file","score":0.83}, …]}
```

Embeddings for the catalog come from a local model (e.g. a small
sentence-transformers build) or an embedding API — the sidecar owns that
choice; the hub only ever sends text.

## Selection policy

The hub prefers the sidecar when configured (`mcp-hub.json`:
`"search": {"sidecar": "python path/to/zvec_sidecar.py"}`) and falls back to
the lexical index when the sidecar is missing, slow (>2s to first token), or
erroring — search must never hard-fail because an optional enhancer is down.

## What vector search buys (and what it doesn't)

- Buys: semantic recall ("make my app fast" → perf/profiling tools), multilingual
  queries (中文查询 → English tool descriptions), tolerance to vocabulary mismatch.
- Doesn't buy: correctness of the downstream tool itself, and it adds a model
  dependency at search time. The lexical scorer stays the default until the
  sidecar demonstrably beats it on real queries.

## Milestones

1. `SidecarIndex` implementing the contract over the draft protocol
2. Fixture sidecar (python, zvec) + contract conformance tests shared with `LexicalIndex`
3. Config plumbing + fallback policy
4. Evaluation harness: 20 real queries, lexical vs vector, side-by-side
