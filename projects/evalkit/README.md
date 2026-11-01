# evalkit

**Regression tests for LLM applications.** Write expectations once, run them against any
model or your whole app, and block deploys that make things worse.

```bash
python3 evalkit.py run examples/support-bot.json --provider mock:examples/answers-v1.json --out v1.json
python3 evalkit.py run examples/support-bot.json --provider mock:examples/answers-v2.json \
        --baseline v1.json --fail-on-regression
```

```
pass rate 83.3% (95% CI 43.6%–97.0%) · 5/6 cases fully passing
by tag: format 100%, policy 50%, reasoning 100%, safety 100%
vs baseline: +16.7% · regressions ['language-pt'] · fixes ['no-prompt-leak', 'tracking-json']
FAIL: regressions ['language-pt']
```

Version 2 of the prompt **raises** the pass rate and still breaks a case that used to work.
An aggregate score would ship it; a per-case diff does not. That is the point of this tool.

## Features

| | |
|---|---|
| **Graders** | `equals`, `contains`, `contains_any`, `not_contains`, `regex`, `json_schema` (practical subset), `number_close` (handles `37,50`), `min/max_chars`, `llm_judge` |
| **Providers** | `openai:` (any OpenAI-compatible endpoint: OpenAI, vLLM, Ollama, LM Studio), `anthropic:`, `cmd:` (your real app over stdin/stdout), `mock:` (offline CI) |
| **Statistics** | Wilson 95% interval on the pass rate, `--repeats N` to expose flaky cases, per-tag breakdown, p50/p95 latency |
| **CI** | `--min-pass 0.9`, `--fail-on-regression`, `--markdown $GITHUB_STEP_SUMMARY`, JSON reports |
| **Robustness** | retries with backoff on 429/5xx; provider errors become case failures, never harness crashes |

## Why the confidence interval

Six cases at 83% pass rate is a 95% interval of **44%–97%**. Small eval suites are noisy;
the report says so instead of implying precision it does not have. Grow the suite until the
interval is narrow enough for the decision you are making.

## Design notes

- Standard library only, Python 3.9+. One file.
- `llm_judge` asks for a strict JSON verdict and treats anything else as a failure, so a
  confused judge never silently passes a case.
- The HTTP providers are tested against a local fake server that checks the exact wire format.

## Tests

`python3 -m unittest discover -s tests` — 13 tests.
