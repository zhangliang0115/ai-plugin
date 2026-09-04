#!/usr/bin/env python3
"""Reference vector-search sidecar for the aipx MCP hub.

Implements the sidecar protocol from docs/mcp-hub-vector-search.md:
newline-delimited JSON over stdin/stdout with two request ops —

  {"op":"build","id":1,"entries":[{"id":"…","text":"…"},…]}
  → {"id":1,"result":{"ok":true,"engine":"zvec|zvec-hybrid|tf","entries":N}}

  {"op":"search","id":2,"query":"…","limit":8}
  → {"id":2,"result":{"results":[{"id":"…","score":0.83},…],"engine":"…"}}

Engines:
  - "zvec": full-text search over alibaba/zvec (https://github.com/alibaba/zvec,
    `pip install zvec`, Python 3.10–3.14). BM25-style scoring with a jieba-aware
    analyzer, so Chinese tool descriptions match properly. Each build creates a
    fresh collection in a private temp dir and swaps it in — readers never see
    a half-built index.
  - "zvec-hybrid": same, plus dense vectors fused with FTS via Reciprocal-Rank
    fusion. Enabled by env (any OpenAI-compatible embeddings endpoint):
      AIPX_EMBEDDING_API_KEY   (required to switch this on)
      AIPX_EMBEDDING_BASE_URL  (optional, e.g. a self-hosted endpoint)
      AIPX_EMBEDDING_MODEL     (optional, default text-embedding-3-small)
  - "tf": dependency-free idf-weighted term-frequency scorer. The fallback when
    zvec is not importable — the sidecar stays protocol-complete either way.

This is a REFERENCE implementation: the protocol is the contract, the engine
is yours to swap. The hub never depends on this file.
"""

import json
import math
import os
import re
import shutil
import sys
import tempfile

try:
    import zvec
except ImportError:  # engine choice degrades to "tf" in make_engine()
    zvec = None

TOKEN_RE = re.compile(r"[a-z0-9\u4e00-\u9fff]+")

# zvec doc ids only accept [A-Za-z0-9_.-]; hub ids are "<server>/<tool>". The
# engine percent-encodes everything outside the whitelist on the way in and
# keeps the exact original ids in a map — collisions are impossible because
# "%" itself is encoded.
_ID_ALLOWED = re.compile(r"[^A-Za-z0-9_.-]")


def encode_id(raw):
    return _ID_ALLOWED.sub(lambda m: f"%{ord(m.group()):x}", str(raw))


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
    """Full-text / hybrid engine over alibaba/zvec.

    Schema per build: one FTS-indexed `text` field holding "<server> <name>
    <description>", optionally a dense `embedding` vector when an embedder is
    configured. Each build writes a fresh collection under a new temp path and
    swaps it in atomically; the previous directory is removed afterwards.
    """

    def __init__(self, log=None):
        self._log = log or (lambda msg: print(msg, file=sys.stderr))
        self._embedder, self._dim = self._make_embedder()
        self._collection = None
        self._dir = None
        self._ids = {}

    def _make_embedder(self):
        api_key = os.environ.get("AIPX_EMBEDDING_API_KEY")
        if not api_key:
            return None, None
        embedder = zvec.OpenAIDenseEmbedding(
            model=os.environ.get("AIPX_EMBEDDING_MODEL") or "text-embedding-3-small",
            api_key=api_key,
            base_url=os.environ.get("AIPX_EMBEDDING_BASE_URL"),
        )
        return embedder, int(embedder.dimension)

    def build(self, entries):
        fresh = os.path.join(tempfile.mkdtemp(prefix="aipx-zvec-"), "coll")
        vectors = None
        if self._embedder is not None:
            vectors = [zvec.VectorSchema("embedding", zvec.DataType.VECTOR_FP32, self._dim)]
        schema = zvec.CollectionSchema(
            name="aipx-mcp-tools",
            fields=[zvec.FieldSchema("text", zvec.DataType.STRING, index_param=zvec.FtsIndexParam())],
            vectors=vectors,
        )
        collection = zvec.create_and_open(path=fresh, schema=schema)
        self._ids = {}
        docs = []
        for e in entries:
            text = e.get("text", "")
            encoded = encode_id(e["id"])
            self._ids[encoded] = e["id"]
            doc = zvec.Doc(id=encoded, fields={"text": text})
            if self._embedder is not None:
                doc.vectors = {"embedding": list(self._embedder.embed(text))}
            docs.append(doc)
        collection.upsert(docs)
        previous = self._dir
        self._collection, self._dir = collection, fresh
        if previous is not None:
            shutil.rmtree(os.path.dirname(previous), ignore_errors=True)
        return len(docs)

    def search(self, query, limit):
        if self._collection is None:
            return []
        topk = max(limit, 0)
        fts_query = zvec.Query(field_name="text", fts=zvec.Fts(query_string=query))
        result = None
        if self._embedder is not None:
            try:
                vector_query = zvec.Query(
                    field_name="embedding", vector=list(self._embedder.embed(query))
                )
                result = self._collection.query(
                    queries=[fts_query], vectors=[vector_query], topk=topk, reranker=zvec.RrfReRanker()
                )
            except Exception as exc:
                self._log(f"zvec hybrid query failed, FTS only: {exc}")
        if result is None:
            result = self._collection.query(queries=fts_query, topk=topk)
        return [
            {"id": self._ids.get(d.id, d.id), "score": round(float(d.score), 4)}
            for d in result
        ]


def make_engine():
    if zvec is None:
        print("zvec not importable (`pip install zvec`) — using the tf engine", file=sys.stderr)
        return TfEngine(), "tf"
    try:
        engine = ZvecEngine()
        return engine, "zvec-hybrid" if engine._embedder is not None else "zvec"
    except Exception as exc:
        print(f"zvec engine unavailable ({exc}) — using the tf engine", file=sys.stderr)
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
