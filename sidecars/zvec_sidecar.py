#!/usr/bin/env python3
"""Reference vector-search sidecar for the aipx MCP hub.

Implements the sidecar protocol from docs/mcp-hub-vector-search.md:
newline-delimited JSON over stdin/stdout with two request ops —

  {"op":"build","id":1,"entries":[{"id":"…","text":"…"},…]}
  → {"id":1,"result":{"ok":true,"engine":"zvec|tf","entries":N}}

  {"op":"search","id":2,"query":"…","limit":8}
  → {"id":2,"result":{"results":[{"id":"…","score":0.83},…]}}

Engines:
  - "tf": dependency-free idf-weighted term-frequency scorer. Deterministic;
    good for protocol demos and A/B baselines.
  - "zvec": vector engine over alibaba/zvec. The zvec Python API is still
    stabilizing — wire embeddings + ANN queries inside the two hooks in
    ZvecEngine; until then construction falls back to "tf" automatically.

This is a REFERENCE implementation: the protocol is the contract, the engine
is yours to swap. The hub never depends on this file.
"""

import json
import math
import re
import sys

TOKEN_RE = re.compile(r"[a-z0-9\u4e00-\u9fff]+")


def tokenize(text):
    return [t for t in TOKEN_RE.findall(str(text).lower()) if t]


class TfEngine:
    """Dependency-free idf-weighted term-frequency engine."""

    def __init__(self):
        self.docs = {}
        self.idf = {}

    def build(self, entries):
        self.docs = {}
        df = {}
        for e in entries:
            tokens = tokenize(e.get("text", ""))
            tf = {}
            for t in tokens:
                tf[t] = tf.get(t, 0) + 1
            self.docs[e["id"]] = (e.get("text", ""), tf)
            for t in tf:
                df[t] = df.get(t, 0) + 1
        n = max(len(self.docs), 1)
        self.idf = {t: math.log(n / c + 1) for t, c in df.items()}
        return len(self.docs)

    def search(self, query, limit):
        scored = []
        for doc_id, (_, tf) in self.docs.items():
            score = 0.0
            for t in tokenize(query):
                if t in tf:
                    score += (1 + math.log(tf[t])) * self.idf.get(t, 1.0)
            if score > 0:
                scored.append({"id": doc_id, "score": round(score, 4)})
        scored.sort(key=lambda x: -x["score"])
        return scored[: max(limit, 0)]


class ZvecEngine:
    """Vector engine over alibaba/zvec (https://github.com/alibaba/zvec).

    TODO: the zvec Python API is stabilizing. Wire it in two places:
      - build(): embed each entry text (local sentence-transformers build or
        an embedding API), upsert into a zvec collection keyed by entry id
      - search(): embed the query, ANN search, map hits back to entry ids

    Until wired, sidecar construction falls back to TfEngine.
    """

    def __init__(self):
        raise NotImplementedError(
            "zvec engine not wired yet — see the TODO in this class; "
            "the sidecar falls back to the tf engine automatically"
        )


def make_engine():
    try:
        engine = ZvecEngine()
        return engine, "zvec"
    except NotImplementedError:
        return TfEngine(), "tf"


def main():
    engine = None
    engine_name = None

    def send(obj):
        sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
        sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue

        op = msg.get("op")
        rid = msg.get("id")

        try:
            if op == "build":
                if engine is None:
                    engine, engine_name = make_engine()
                n = engine.build(msg.get("entries", []))
                send({"id": rid, "result": {"ok": True, "engine": engine_name, "entries": n}})
            elif op == "search":
                if engine is None:
                    engine, engine_name = make_engine()
                results = engine.search(msg.get("query", ""), int(msg.get("limit", 8)))
                send({"id": rid, "result": {"results": results, "engine": engine_name}})
            elif rid is not None:
                send({"id": rid, "error": {"message": f"unknown op: {op}"}})
        except Exception as exc:  # keep the sidecar alive; report per-request
            if rid is not None:
                send({"id": rid, "error": {"message": str(exc)}})


if __name__ == "__main__":
    main()
