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
  - "zvec-hybrid-local": same RRF fusion, with vectors from a small LOCAL
    embedding model — no API, no cost, no configuration. Default model
    paraphrase-multilingual-MiniLM-L12-v2 (~220 MB, EN/ZH) auto-downloads on
    first build via fastembed (ONNX, no torch). Set AIPX_LOCAL_EMBEDDINGS=0
    to keep pure FTS. Model source: HF_ENDPOINT defaults to
    https://hf-mirror.com when unset — reachable from mainland China and a
    faithful HF proxy elsewhere.
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
        # deterministic tie-break keeps search output stable across rebuilds
        scored.sort(key=lambda x: (-x["score"], x["id"]))
        return scored[: max(limit, 0)]


class LocalEmbedder:
    """Dense embeddings from a small model that auto-installs and
    auto-downloads — zero configuration, zero API cost.

    Default model sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
    (~220 MB ONNX, 384 dims, EN/ZH). Measured against BAAI/bge-small-zh-v1.5
    (~90 MB) on mixed-language tool-catalog queries it was decisively better —
    bge-small-zh's similarities came out nearly flat ("make my app fast" ranked
    a memory tool above a profiler), MiniLM-L12 ranked every eval query
    correctly with wide margins. AIPX_LOCAL_EMBEDDING_MODEL overrides.

    First use installs the fastembed package into the running interpreter's
    environment and downloads the model weights; both are one-time and cached.
    HF_ENDPOINT defaults to https://hf-mirror.com when unset — a faithful
    Hugging Face proxy reachable from mainland China (direct huggingface.co
    times out there, and fastembed's own fallback source measured ~50 KB/s vs
    ~MB/s on the mirror).
    """

    DEFAULT_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

    def __init__(self, log):
        self._log = log
        os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
        self._model = self._load()

    def _load(self):
        try:
            from fastembed import TextEmbedding
        except ImportError:
            self._log("fastembed not installed — installing (`%s -m pip install fastembed`)" % sys.executable)
            import subprocess
            try:
                subprocess.run(
                    [sys.executable, "-m", "pip", "install", "--quiet", "--disable-pip-version-check", "fastembed"],
                    check=True, timeout=600,
                )
            except Exception as exc:
                self._log(f"fastembed install failed ({exc}) — staying full-text")
                return None
            try:
                from fastembed import TextEmbedding  # noqa: F811
            except ImportError:
                self._log("fastembed still unimportable after install — staying full-text")
                return None
        model_name = os.environ.get("AIPX_LOCAL_EMBEDDING_MODEL") or self.DEFAULT_MODEL
        try:
            return TextEmbedding(model_name)
        except Exception as exc:
            self._log(f"local model {model_name} unavailable ({exc}) — staying full-text")
            return None

    @property
    def available(self):
        return self._model is not None

    def probe_dim(self):
        if self._model is None:
            return None
        return len(self.embed("dimension probe"))

    def embed(self, text):
        return list(next(iter(self._model.embed([text]))))


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
        if api_key:
            embedder = zvec.OpenAIDenseEmbedding(
                model=os.environ.get("AIPX_EMBEDDING_MODEL") or "text-embedding-3-small",
                api_key=api_key,
                base_url=os.environ.get("AIPX_EMBEDDING_BASE_URL"),
            )
            return embedder, int(embedder.dimension)
        if os.environ.get("AIPX_LOCAL_EMBEDDINGS", "").strip().lower() not in ("0", "false", "off"):
            local = LocalEmbedder(self._log)
            if local.available:
                return local, local.probe_dim()
            self._log("local embeddings unavailable — staying full-text (zvec FTS)")
        return None, None

    def build(self, entries):
        texts = [e.get("text", "") for e in entries]
        vectors = None
        if self._embedder is not None:
            try:
                vectors = [list(self._embedder.embed(t)) for t in texts]
            except Exception as exc:
                self._log(f"embedding failed ({exc}) — building full-text only")
                self._embedder = None
                vectors = None
        fresh = os.path.join(tempfile.mkdtemp(prefix="aipx-zvec-"), "coll")
        vector_schema = None
        if vectors is not None:
            vector_schema = [zvec.VectorSchema("embedding", zvec.DataType.VECTOR_FP32, self._dim)]
        schema = zvec.CollectionSchema(
            name="aipx-mcp-tools",
            fields=[zvec.FieldSchema("text", zvec.DataType.STRING, index_param=zvec.FtsIndexParam())],
            vectors=vector_schema,
        )
        collection = zvec.create_and_open(path=fresh, schema=schema)
        self._ids = {}
        docs = []
        for e, text in zip(entries, texts):
            encoded = encode_id(e["id"])
            self._ids[encoded] = e["id"]
            doc = zvec.Doc(id=encoded, fields={"text": text})
            if vectors is not None:
                doc.vectors = {"embedding": vectors[len(docs)]}
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
                # hybrid = both signals in one query list, fused by RRF
                result = self._collection.query(
                    queries=[fts_query, vector_query], topk=topk, reranker=zvec.RrfReRanker()
                )
            except Exception as exc:
                self._log(f"zvec hybrid query failed, FTS only: {exc}")
        if result is None:
            result = self._collection.query(queries=fts_query, topk=topk)
        rows = [
            {"id": self._ids.get(d.id, d.id), "score": round(float(d.score), 4)}
            for d in result
        ]
        # deterministic tie-break: same scores keep id order across rebuilds
        rows.sort(key=lambda x: (-x["score"], x["id"]))
        return rows


def make_engine():
    if zvec is None:
        print("zvec not importable (`pip install zvec`) — using the tf engine", file=sys.stderr)
        return TfEngine(), "tf"
    try:
        engine = ZvecEngine()
        if engine._embedder is None:
            return engine, "zvec"
        name = "zvec-hybrid-local" if isinstance(engine._embedder, LocalEmbedder) else "zvec-hybrid"
        return engine, name
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
