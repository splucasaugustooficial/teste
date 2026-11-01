#!/usr/bin/env python3
"""ragbench: measure how chunking and retrieval choices change RAG quality. Standard library only.

    python3 ragbench.py grid data/corpus data/queries.json            # full experiment grid
    python3 ragbench.py search data/corpus "prazo de reembolso" -k 3  # try one query

Relevance is labelled by *evidence strings*, not chunk ids: a chunk is relevant to a
query if it contains the query's evidence text. Labels therefore stay valid for every
chunking strategy, which is what makes chunking experiments comparable.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
import unicodedata
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

__version__ = "1.0.0"

STOP = set("""a o as os um uma uns umas de da do das dos em na no nas nos por para pra com sem e ou que se
ao aos à às é são ser foi como mais menos muito qual quais quando onde quem eu você voce ele ela nós
meu minha seu sua isso isto esse essa este esta lhe me te the of and or to in on for is are be with
what how when where who can do does i my your it at by an""".split())


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in text if not unicodedata.combining(c))


def tokenize(text: str) -> list[str]:
    toks = re.findall(r"[a-z0-9]+", normalize(text))
    return [_stem(t) for t in toks if t not in STOP and len(t) > 1]


def _stem(tok: str) -> str:
    """Tiny light stemmer (plural/gender suffixes). Deliberately simple and documented."""
    for suf in ("coes", "soes", "mente", "s"):
        if tok.endswith(suf) and len(tok) - len(suf) >= 4:
            return tok[: -len(suf)] + ("cao" if suf == "coes" else "sao" if suf == "soes" else "")
    return tok


# --------------------------------------------------------------------------- chunking

@dataclass
class Chunk:
    doc: str
    text: str


def chunk_fixed(doc: str, text: str, size: int, overlap: int) -> list[Chunk]:
    """Fixed-size windows over words (size/overlap in words)."""
    words = text.split()
    step = max(1, size - overlap)
    out = []
    for i in range(0, len(words), step):
        out.append(Chunk(doc, " ".join(words[i:i + size])))
        if i + size >= len(words):
            break
    return out


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n{2,}", text) if s.strip()]


def chunk_sentences(doc: str, text: str, size: int, overlap: int) -> list[Chunk]:
    """Pack whole sentences up to ~size words; overlap = number of sentences carried over."""
    sents = split_sentences(text)
    out, cur, n = [], [], 0
    for s in sents:
        w = len(s.split())
        if cur and n + w > size:
            out.append(Chunk(doc, " ".join(cur)))
            cur = cur[-overlap:] if overlap else []
            n = sum(len(x.split()) for x in cur)
        cur.append(s)
        n += w
    if cur:
        out.append(Chunk(doc, " ".join(cur)))
    return out


def chunk_paragraphs(doc: str, text: str, size: int, overlap: int) -> list[Chunk]:
    """One chunk per paragraph, with the document title prepended (cheap contextual chunking)."""
    paras = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    title = paras[0].lstrip("# ").strip() if paras and paras[0].startswith("#") else doc
    return [Chunk(doc, f"{title}: {p}") for p in paras if not p.startswith("#")]


CHUNKERS = {"fixed": chunk_fixed, "sentence": chunk_sentences, "paragraph": chunk_paragraphs}


# --------------------------------------------------------------------------- retrievers

class BM25:
    name = "bm25"

    def __init__(self, chunks: list[Chunk], k1: float = 1.5, b: float = 0.75):
        self.docs = [tokenize(c.text) for c in chunks]
        self.k1, self.b = k1, b
        self.avg = sum(map(len, self.docs)) / max(1, len(self.docs))
        df = Counter(t for d in self.docs for t in set(d))
        n = len(self.docs)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}
        self.tf = [Counter(d) for d in self.docs]

    def scores(self, query: str) -> list[float]:
        q = tokenize(query)
        out = []
        for tf, d in zip(self.tf, self.docs):
            s = 0.0
            for t in q:
                if t in tf:
                    f = tf[t]
                    s += self.idf[t] * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * len(d) / self.avg))
            out.append(s)
        return out


class CharTfidf:
    """TF-IDF over character 4-grams + cosine: robust to inflection and typos, a cheap stand-in for dense retrieval."""
    name = "char-tfidf"

    def __init__(self, chunks: list[Chunk], n: int = 4):
        self.n = n
        grams = [self._grams(c.text) for c in chunks]
        df = Counter(g for gs in grams for g in set(gs))
        self.idf = {g: math.log((1 + len(grams)) / (1 + f)) + 1 for g, f in df.items()}
        self.vecs = [self._vec(gs) for gs in grams]

    def _grams(self, text: str) -> list[str]:
        t = " " + " ".join(tokenize(text)) + " "
        return [t[i:i + self.n] for i in range(len(t) - self.n + 1)]

    def _vec(self, grams: list[str]) -> dict[str, float]:
        tf = Counter(grams)
        v = {g: c * self.idf.get(g, 0.0) for g, c in tf.items()}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        return {g: x / norm for g, x in v.items()}

    def scores(self, query: str) -> list[float]:
        q = self._vec(self._grams(query))
        return [sum(w * v.get(g, 0.0) for g, w in q.items()) for v in self.vecs]


class Hybrid:
    """Reciprocal Rank Fusion of BM25 and char-TF-IDF (k=60, Cormack et al. 2009)."""
    name = "hybrid-rrf"

    def __init__(self, chunks: list[Chunk], k: int = 60):
        self.parts, self.k = [BM25(chunks), CharTfidf(chunks)], k

    def scores(self, query: str) -> list[float]:
        fused = None
        for p in self.parts:
            s = p.scores(query)
            order = sorted(range(len(s)), key=lambda i: -s[i])
            rank = {i: r for r, i in enumerate(order)}
            contrib = [1.0 / (self.k + rank[i] + 1) for i in range(len(s))]
            fused = contrib if fused is None else [a + b for a, b in zip(fused, contrib)]
        return fused or []


RETRIEVERS = {"bm25": BM25, "char-tfidf": CharTfidf, "hybrid-rrf": Hybrid}


# --------------------------------------------------------------------------- metrics

def relevant(chunk: Chunk, query: dict) -> bool:
    return normalize(query["evidence"]) in normalize(" ".join(chunk.text.split()))


def _within_budget(chunks: list[Chunk], order: list[int], query: dict, budget: int) -> bool:
    """Is the evidence inside the first `budget` words handed to the LLM? Fair across chunk sizes."""
    left = budget
    for i in order:
        words = chunks[i].text.split()
        if normalize(query["evidence"]) in normalize(" ".join(words[:left])):
            return True
        left -= len(words)
        if left <= 0:
            return False
    return False


def evaluate(chunks: list[Chunk], retriever, queries: list[dict], k: int, budget: int = 120) -> dict:
    hits = mrr = ndcg = in_budget = 0.0
    answerable = 0
    for q in queries:
        rels = [relevant(c, q) for c in chunks]
        if not any(rels):
            continue  # evidence split across chunks: counted separately as "unanswerable"
        answerable += 1
        s = retriever.scores(q["query"])
        order = sorted(range(len(chunks)), key=lambda i: (-s[i], i))
        in_budget += _within_budget(chunks, order, q, budget)
        top = order[:k]
        first = next((r for r, i in enumerate(top) if rels[i]), None)
        if first is not None:
            hits += 1
            mrr += 1 / (first + 1)
        dcg = sum(1 / math.log2(r + 2) for r, i in enumerate(top) if rels[i])
        ideal = sum(1 / math.log2(r + 2) for r in range(min(k, sum(rels))))
        ndcg += dcg / ideal if ideal else 0.0
    n = len(queries)
    return {
        f"recall@{budget}w": round(in_budget / n, 4),
        f"recall@{k}": round(hits / n, 4),  # over ALL queries: a split evidence is a miss, as it is in production
        "mrr": round(mrr / n, 4),
        f"ndcg@{k}": round(ndcg / n, 4),
        "answerable": round(answerable / n, 4),
        "chunks": len(chunks),
        "avg_words": round(sum(len(c.text.split()) for c in chunks) / max(1, len(chunks)), 1),
    }


# --------------------------------------------------------------------------- io / cli

def load_corpus(path: str) -> dict[str, str]:
    p = Path(path)
    files = sorted(p.glob("*.md")) + sorted(p.glob("*.txt")) if p.is_dir() else [p]
    corpus = {f.stem: f.read_text(encoding="utf-8") for f in files}
    if not corpus:
        raise SystemExit(f"no .md/.txt files in {path}")
    return corpus


def build_chunks(corpus: dict[str, str], strategy: str, size: int, overlap: int) -> list[Chunk]:
    return [c for doc, text in corpus.items() for c in CHUNKERS[strategy](doc, text, size, overlap)]


DEFAULT_GRID = [("fixed", 32, 0), ("fixed", 64, 16), ("fixed", 128, 32), ("fixed", 256, 64),
                ("sentence", 40, 0), ("sentence", 80, 1), ("paragraph", 0, 0)]


def cmd_grid(a) -> int:
    corpus = load_corpus(a.corpus)
    queries = json.loads(Path(a.queries).read_text(encoding="utf-8"))
    rows = []
    for strategy, size, overlap in DEFAULT_GRID:
        chunks = build_chunks(corpus, strategy, size, overlap)
        for rname in a.retrievers:
            m = evaluate(chunks, RETRIEVERS[rname](chunks), queries, a.k, a.budget)
            rows.append({"chunking": f"{strategy}" + (f"/{size}w+{overlap}" if strategy != "paragraph" else ""),
                         "retriever": rname, **m})
    bkey = f"recall@{a.budget}w"
    rows.sort(key=lambda r: (-r[bkey], -r["mrr"]))
    if a.json:
        print(json.dumps(rows, indent=2))
        return 0
    k = a.k
    print(f"ragbench · {len(corpus)} docs · {len(queries)} queries · k={k} · budget={a.budget} words\n")
    print(f"| chunking | retriever | recall@{a.budget}w | recall@{k} | MRR | nDCG@{k} | answerable | chunks | avg words |")
    print("|---|---|---|---|---|---|---|---|---|")
    for r in rows:
        print(f"| {r['chunking']} | {r['retriever']} | **{r[bkey]:.3f}** | {r[f'recall@{k}']:.3f} | {r['mrr']:.3f} | "
              f"{r[f'ndcg@{k}']:.3f} | {r['answerable']:.0%} | {r['chunks']} | {r['avg_words']} |")
    return 0


def cmd_search(a) -> int:
    chunks = build_chunks(load_corpus(a.corpus), a.chunking, a.size, a.overlap)
    r = RETRIEVERS[a.retriever](chunks)
    s = r.scores(a.query)
    for i in sorted(range(len(chunks)), key=lambda i: -s[i])[:a.k]:
        print(f"[{s[i]:.3f}] {chunks[i].doc}: {chunks[i].text[:160]}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="ragbench", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("grid", help="run the chunking x retriever experiment grid")
    g.add_argument("corpus")
    g.add_argument("queries")
    g.add_argument("-k", type=int, default=3)
    g.add_argument("--budget", type=int, default=120, help="context budget in words (fair metric across chunk sizes)")
    g.add_argument("--retrievers", nargs="+", default=list(RETRIEVERS), choices=list(RETRIEVERS))
    g.add_argument("--json", action="store_true")
    g.set_defaults(fn=cmd_grid)
    s = sub.add_parser("search", help="retrieve for one query")
    s.add_argument("corpus")
    s.add_argument("query")
    s.add_argument("-k", type=int, default=3)
    s.add_argument("--retriever", default="hybrid-rrf", choices=list(RETRIEVERS))
    s.add_argument("--chunking", default="paragraph", choices=list(CHUNKERS))
    s.add_argument("--size", type=int, default=80)
    s.add_argument("--overlap", type=int, default=1)
    s.set_defaults(fn=cmd_search)
    a = ap.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
