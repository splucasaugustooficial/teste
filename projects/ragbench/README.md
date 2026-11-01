# ragbench

**How much do chunking and retrieval choices change RAG quality?** A small, reproducible
lab that measures it, with no dependencies and no API keys.

```bash
python3 ragbench.py grid data/corpus data/queries.json
python3 ragbench.py search data/corpus "posso devolver camiseta personalizada?"
```

## Method

- **Corpus:** 8 documents of a fictional store's help center (Portuguese, synthetic, written for this lab).
- **Queries:** 30 questions phrased the way customers write, deliberately *not* reusing the documents' wording.
- **Labels are evidence strings**, not chunk ids: a chunk is relevant if it contains the
  evidence text. Labels stay valid for every chunking strategy, so strategies are comparable.
- **Retrievers:** BM25 · TF-IDF over character 4-grams (a cheap stand-in for dense retrieval) · hybrid with Reciprocal Rank Fusion.
- **Main metric: recall at a fixed context budget (120 words).** Recall@k alone is biased:
  bigger chunks put more text in the top-k and look better for free. A fixed word budget
  compares strategies at equal cost to the LLM.

## Results

| chunking | retriever | **recall@120w** | recall@3 | MRR | answerable |
|---|---|---|---|---|---|
| fixed 128w (= whole doc) | char-tfidf | **0.867** | 0.900 | 0.883 | 100% |
| sentence ~80w | char-tfidf | **0.867** | 0.933 | 0.872 | 100% |
| paragraph | char-tfidf | **0.867** | 0.867 | 0.811 | 100% |
| paragraph | bm25 | **0.800** | 0.767 | 0.678 | 100% |
| fixed 128w (= whole doc) | bm25 | **0.767** | 0.867 | 0.789 | 100% |
| fixed 32w, no overlap | char-tfidf | **0.633** | 0.633 | 0.578 | **70%** |

Full grid: `python3 ragbench.py grid data/corpus data/queries.json`.

## Findings

1. **Recall@k flatters big chunks.** At k=3, whole-document chunks reach 0.900; at an equal
   120-word budget, their advantage disappears.
2. **Splitting evidence is the largest effect in the grid.** Small fixed windows without
   overlap cut 30% of the answers in half; no retriever can recover them.
3. **Character n-grams beat BM25 on Portuguese paraphrases** (0.867 vs 0.767–0.800),
   because inflection (*devolver/devolução*) defeats exact-term matching.
4. **Hybrid RRF did not help here.** Fusing a strong retriever with a weaker one diluted the
   strong one's ranking. A negative result, reported as such.

## Limits

30 queries means each query is 3.3 points; differences under ~10 points are within noise.
The corpus is small and synthetic. Treat the findings as hypotheses to re-test on your own
data, which is what the tool is for: point `grid` at your documents and questions.

## Tests

`python3 -m unittest discover -s tests` — 9 tests, including a check that every evidence string exists in the corpus.
