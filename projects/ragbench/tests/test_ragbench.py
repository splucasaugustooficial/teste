from __future__ import annotations

import contextlib
import io
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import ragbench as rb  # noqa: E402

DATA = ROOT / "data"


class TextTests(unittest.TestCase):
    def test_normalize_and_tokenize(self):
        self.assertEqual(rb.normalize("Devolução ÀS"), "devolucao as")
        self.assertEqual(rb.tokenize("As devoluções dos produtos"), ["devolucao", "produto"])

    def test_chunkers(self):
        text = "# T\n\nUm dois três. Quatro cinco seis.\n\nSete oito nove dez."
        fixed = rb.chunk_fixed("d", text, 4, 1)
        self.assertTrue(all(len(c.text.split()) <= 4 for c in fixed))
        self.assertEqual(fixed[1].text.split()[0], fixed[0].text.split()[-1])  # overlap of 1 word
        paras = rb.chunk_paragraphs("d", text, 0, 0)
        self.assertEqual([c.text for c in paras], ["T: Um dois três. Quatro cinco seis.", "T: Sete oito nove dez."])
        sents = rb.chunk_sentences("d", text, 4, 0)
        self.assertIn("Um dois três.", sents[1].text)


class RetrievalTests(unittest.TestCase):
    def setUp(self):
        self.chunks = [rb.Chunk("a", "reembolso em sete dias"), rb.Chunk("b", "frete grátis acima de 299"),
                       rb.Chunk("c", "pontos expiram em doze meses")]

    def test_each_retriever_finds_the_obvious_chunk(self):
        for name, cls in rb.RETRIEVERS.items():
            s = cls(self.chunks).scores("quando o frete é grátis")
            self.assertEqual(max(range(3), key=lambda i: s[i]), 1, name)

    def test_char_tfidf_handles_inflection(self):
        s = rb.CharTfidf(self.chunks).scores("reembolsos")
        self.assertEqual(max(range(3), key=lambda i: s[i]), 0)

    def test_metrics_perfect_and_split_evidence(self):
        qs = [{"query": "frete grátis", "evidence": "frete grátis acima"}]
        m = rb.evaluate(self.chunks, rb.BM25(self.chunks), qs, k=1, budget=50)
        self.assertEqual((m["recall@1"], m["mrr"], m["ndcg@1"], m["recall@50w"]), (1.0, 1.0, 1.0, 1.0))
        split = [{"query": "x", "evidence": "dias frete"}]  # spans two chunks -> unanswerable
        m = rb.evaluate(self.chunks, rb.BM25(self.chunks), split, k=3)
        self.assertEqual((m["answerable"], m["recall@3"]), (0.0, 0.0))

    def test_budget_truncates(self):
        chunks = [rb.Chunk("a", "palavra " * 10 + "alvo final")]
        q = {"query": "palavra", "evidence": "alvo final"}
        self.assertFalse(rb._within_budget(chunks, [0], q, 10))
        self.assertTrue(rb._within_budget(chunks, [0], q, 12))


class DatasetTests(unittest.TestCase):
    def test_every_evidence_exists_in_corpus(self):
        corpus = rb.load_corpus(str(DATA / "corpus"))
        flat = rb.normalize(" ".join(" ".join(t.split()) for t in corpus.values()))
        for q in json.loads((DATA / "queries.json").read_text(encoding="utf-8")):
            self.assertIn(rb.normalize(q["evidence"]), flat, q["query"])

    def test_paragraph_chunking_never_splits_evidence(self):
        corpus = rb.load_corpus(str(DATA / "corpus"))
        chunks = rb.build_chunks(corpus, "paragraph", 0, 0)
        qs = json.loads((DATA / "queries.json").read_text(encoding="utf-8"))
        m = rb.evaluate(chunks, rb.BM25(chunks), qs, k=3)
        self.assertEqual(m["answerable"], 1.0)

    def test_grid_cli(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = rb.main(["grid", str(DATA / "corpus"), str(DATA / "queries.json"), "--json"])
        rows = json.loads(out.getvalue())
        self.assertEqual(code, 0)
        self.assertEqual(len(rows), len(rb.DEFAULT_GRID) * len(rb.RETRIEVERS))


if __name__ == "__main__":
    unittest.main()
