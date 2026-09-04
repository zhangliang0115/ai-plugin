# Hub vector search — sidecar design

Status: **shipped**. The hub ships with a deterministic lexical scorer; the
sidecar protocol and the zvec reference engine are implemented — see
[Milestones](#milestones).

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

## Sidecar protocol

Newline-delimited JSON, same framing as MCP stdio:

```jsonc
// hub → sidecar: replace the whole catalog (per refresh)
{"op":"build","id":1,"entries":[{"id":"filesystem/read_file","text":"filesystem read_file Read the complete contents…"}]}
// sidecar → hub:
{"id":1,"result":{"ok":true,"engine":"zvec","entries":1}}

// hub → sidecar: search
{"op":"search","id":2,"query":"read file","limit":8}
// sidecar → hub:
{"id":2,"result":{"results":[{"id":"filesystem/read_file","score":3.34}],"engine":"zvec"}}
```

Every response carries its `engine` string, so clients can observe which
engine actually served the request (`zvec`, `zvec-hybrid`, or `tf`).

Embeddings, when enabled, are the sidecar's business — the hub only ever
sends text.

## Reference sidecar

`sidecars/zvec_sidecar.py` is a protocol-complete Python reference with three
engines, chosen automatically per build:

| engine | needs | what it does |
|---|---|---|
| `zvec` | `pip install zvec` (Python 3.10–3.14) | alibaba/zvec native full-text search — BM25-style scoring, jieba-aware so Chinese descriptions match; each build writes a fresh collection to a private temp dir and swaps it in |
| `zvec-hybrid` | `zvec` + an embeddings endpoint (see below) | dense vectors fused with FTS via Reciprocal-Rank fusion |
| `tf` | nothing | zero-dep idf-weighted term-frequency fallback; keeps the sidecar protocol-complete where zvec is not installed |

Hybrid mode switches on when the sidecar's environment has
`AIPX_EMBEDDING_API_KEY` (any OpenAI-compatible embeddings endpoint;
`AIPX_EMBEDDING_BASE_URL` and `AIPX_EMBEDDING_MODEL` optional, model default
`text-embedding-3-small`).

Which providers actually work: the DeepSeek API (what DSH itself configures)
serves **no `/embeddings` endpoint** — chat models cannot be reused for
vectors. Any OpenAI-compatible embeddings provider does, e.g. Alibaba
DashScope's compatibility mode:

```sh
export AIPX_EMBEDDING_API_KEY=sk-…                       # DashScope key
export AIPX_EMBEDDING_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
export AIPX_EMBEDDING_MODEL=text-embedding-v4
```

Without an embeddings endpoint the `zvec` engine still runs full-text search;
hybrid is an additive upgrade, never a requirement. Entry ids may contain characters zvec rejects —
the engine percent-encodes them and maps back to the originals on every hit,
so `mcp_search` results always carry the hub's own `server/tool` ids.

## Wiring it into the hub

```sh
aipx mcp serve --sidecar "python3 path/to/zvec_sidecar.py"
```

or persist it in the hub config (`mcp-hub.json`):

```json
{ "search": { "sidecar": "python3 path/to/zvec_sidecar.py" } }
```

The CLI flag wins over the config value. Under the hood the hub wraps the
sidecar with `withLexicalFallback`: if the sidecar is missing, errors, or
times out, search degrades to lexical scoring for this hub instance —
search never hard-fails because an optional enhancer is down.

## What vector search buys (and what it doesn't)

- Buys: semantic recall ("make my app fast" → perf/profiling tools), multilingual
  queries (中文查询 → English tool descriptions), tolerance to vocabulary mismatch.
- Doesn't buy: correctness of the downstream tool itself, and it adds a model
  dependency at search time. The lexical scorer stays the default until the
  sidecar demonstrably beats it on real queries.

## Milestones

1. ~~`SidecarIndex` implementing the contract over the draft protocol~~ — shipped (`src/hub/sidecar.js`)
2. ~~Protocol conformance test~~ — `test/hub-sidecar.test.js` (mock sidecar fixture) + real-engine suite `test/hub-zvec.test.js` (auto-skipped where zvec is not installed)
3. ~~Config plumbing + fallback policy~~ — shipped (`withLexicalFallback`, `aipx mcp serve --sidecar`, `mcp-hub.json` `search.sidecar`)
4. Evaluation harness: 20 real queries, lexical vs vector, side-by-side
5. ~~Reference sidecar: zvec engines wired~~ — FTS (jieba-aware) + optional hybrid via Reciprocal-Rank fusion; `tf` stays as the zero-dep fallback
