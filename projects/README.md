# AI research projects

Four small, dependency-free projects on the problems that decide whether an AI system works
in production: **evaluation, retrieval, security and data quality.** Each one has a
reproducible benchmark, published numbers, and stated limits.

| Project | Question it answers | Headline result |
|---|---|---|
| [**evalkit**](evalkit/) | Did this prompt or model change make my app worse? | A change that raises the pass rate by 16.7 points still regresses a case; per-case diffs catch it |
| [**ragbench**](ragbench/) | Which chunking and retriever should I use? | Recall@k flatters big chunks; at equal context budget the gap disappears, while splitting evidence costs 30% of answers |
| [**injection-guard**](injection-guard/) | Is this input or document trying to hijack my agent? | F1 0.955 in-distribution vs 0.571 on unseen phrasings: detectors look stronger than they are |
| [**dataset-doctor**](dataset-doctor/) | Is my fine-tuning data clean and my test set uncontaminated? | Finds exactly the planted issues, zero false alarms on decoys |
| [**rea-browser**](rea-browser/) | Can an agent browse the web the way a coding agent works on a repo? | Read → act → verify loop with a permission gate and REA (CDP) evidence; `done` is refused without evidence IDs. Node + Playwright, not stdlib |

The first four run on Python 3.9+ with the standard library, offline (CI: `.github/workflows/projects.yml`). `rea-browser` is Node 22 with Playwright and REA (CI: `.github/workflows/rea-browser.yml`; `cd projects/rea-browser && npm ci && npm test`).

```bash
for p in evalkit ragbench injection-guard dataset-doctor; do (cd projects/$p && python3 -m unittest discover -s tests); done
```
