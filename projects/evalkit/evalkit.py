#!/usr/bin/env python3
"""evalkit: regression tests for LLM apps. Standard library only.

    python3 evalkit.py run suite.json --provider mock:answers.json
    python3 evalkit.py run suite.json --provider openai:gpt-4o-mini --repeats 3 --min-pass 0.9
    python3 evalkit.py run suite.json --provider anthropic:claude-haiku-4-5 --baseline last.json
    python3 evalkit.py run suite.json --provider "cmd:python3 my_app.py"

A suite is JSON: {"name", "system"?, "cases": [{"id", "input", "expect": {grader: arg, ...}}]}.
Every grader in `expect` must pass for the case to pass.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import json
import math
import os
import re
import shlex
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

__version__ = "1.0.0"


# --------------------------------------------------------------------------- graders
# Each grader: (output: str, arg, ctx) -> (passed: bool, detail: str)

def _norm(s: str) -> str:
    return " ".join(s.lower().split())


def g_equals(out: str, arg: Any, ctx: dict) -> tuple[bool, str]:
    return _norm(out) == _norm(str(arg)), f"expected {arg!r}"


def g_contains(out: str, arg: Any, ctx: dict) -> tuple[bool, str]:
    needles = arg if isinstance(arg, list) else [arg]
    missing = [n for n in needles if _norm(str(n)) not in _norm(out)]
    return not missing, f"missing {missing}" if missing else "ok"


def g_contains_any(out: str, arg: list, ctx: dict) -> tuple[bool, str]:
    return any(_norm(str(n)) in _norm(out) for n in arg), f"none of {arg}"


def g_not_contains(out: str, arg: Any, ctx: dict) -> tuple[bool, str]:
    needles = arg if isinstance(arg, list) else [arg]
    found = [n for n in needles if _norm(str(n)) in _norm(out)]
    return not found, f"found forbidden {found}" if found else "ok"


def g_regex(out: str, arg: str, ctx: dict) -> tuple[bool, str]:
    return re.search(arg, out, re.S | re.I) is not None, f"no match for /{arg}/"


def g_max_chars(out: str, arg: int, ctx: dict) -> tuple[bool, str]:
    return len(out) <= int(arg), f"{len(out)} chars > {arg}"


def g_min_chars(out: str, arg: int, ctx: dict) -> tuple[bool, str]:
    return len(out) >= int(arg), f"{len(out)} chars < {arg}"


def _extract_json(out: str) -> Any:
    text = out.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    return json.loads(text)


def _schema_errors(value: Any, schema: dict, path: str = "$") -> list[str]:
    """A practical JSON Schema subset: type, enum, required, properties, items, minimum, maximum."""
    errs: list[str] = []
    types = {"object": dict, "array": list, "string": str, "boolean": bool, "null": type(None)}
    t = schema.get("type")
    if t:
        if t == "integer":
            ok = isinstance(value, int) and not isinstance(value, bool)
        elif t == "number":
            ok = isinstance(value, (int, float)) and not isinstance(value, bool)
        else:
            ok = isinstance(value, types.get(t, object))
        if not ok:
            return [f"{path}: expected {t}, got {type(value).__name__}"]
    if "enum" in schema and value not in schema["enum"]:
        errs.append(f"{path}: {value!r} not in {schema['enum']}")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errs.append(f"{path}: {value} < {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            errs.append(f"{path}: {value} > {schema['maximum']}")
    if isinstance(value, dict):
        for key in schema.get("required", []):
            if key not in value:
                errs.append(f"{path}: missing '{key}'")
        for key, sub in (schema.get("properties") or {}).items():
            if key in value:
                errs += _schema_errors(value[key], sub, f"{path}.{key}")
    if isinstance(value, list) and isinstance(schema.get("items"), dict):
        for i, item in enumerate(value):
            errs += _schema_errors(item, schema["items"], f"{path}[{i}]")
    return errs


def g_json_schema(out: str, arg: dict, ctx: dict) -> tuple[bool, str]:
    try:
        value = _extract_json(out)
    except (json.JSONDecodeError, ValueError) as err:
        return False, f"not JSON: {err}"
    errs = _schema_errors(value, arg)
    return not errs, "; ".join(errs[:3]) or "ok"


def g_number_close(out: str, arg: dict, ctx: dict) -> tuple[bool, str]:
    nums = [float(x.replace(",", ".")) for x in re.findall(r"-?\d+(?:[.,]\d+)?", out)]
    target, tol = float(arg["value"]), float(arg.get("tolerance", 1e-6))
    hit = any(abs(n - target) <= tol for n in nums)
    return hit, f"no number within {tol} of {target} (found {nums[:5]})"


def g_llm_judge(out: str, arg: Any, ctx: dict) -> tuple[bool, str]:
    judge: Provider | None = ctx.get("judge")
    if judge is None:
        return False, "llm_judge needs --judge PROVIDER"
    rubric = arg if isinstance(arg, str) else arg["rubric"]
    prompt = (
        "You are a strict evaluator. Grade the RESPONSE against the RUBRIC.\n"
        f"QUESTION:\n{ctx['input']}\n\nRESPONSE:\n{out}\n\nRUBRIC:\n{rubric}\n\n"
        'Reply with only JSON: {"pass": true|false, "reason": "<one sentence>"}'
    )
    verdict = judge.complete(prompt, system=None)
    try:
        data = _extract_json(verdict)
        return bool(data.get("pass")), str(data.get("reason", ""))[:200]
    except (json.JSONDecodeError, ValueError, AttributeError):
        return False, f"judge returned non-JSON: {verdict[:120]!r}"


GRADERS: dict[str, Callable[[str, Any, dict], tuple[bool, str]]] = {
    "equals": g_equals, "contains": g_contains, "contains_any": g_contains_any,
    "not_contains": g_not_contains, "regex": g_regex, "max_chars": g_max_chars,
    "min_chars": g_min_chars, "json_schema": g_json_schema, "number_close": g_number_close,
    "llm_judge": g_llm_judge,
}


# --------------------------------------------------------------------------- providers

class Provider:
    name = "base"

    def complete(self, prompt: str, system: str | None, case_id: str | None = None) -> str:
        raise NotImplementedError


class MockProvider(Provider):
    """Canned answers keyed by case id: deterministic, offline, ideal for CI of the harness itself."""

    def __init__(self, path: str):
        self.name = f"mock:{path}"
        self.answers = json.loads(Path(path).read_text(encoding="utf-8"))

    def complete(self, prompt, system, case_id=None):
        if case_id in self.answers:
            return self.answers[case_id]
        if prompt in self.answers:
            return self.answers[prompt]
        raise RuntimeError(f"mock has no answer for case {case_id!r}")


class CmdProvider(Provider):
    """Any program: prompt on stdin, answer on stdout. Wraps your real app, not just a model."""

    def __init__(self, command: str, timeout: float):
        self.name, self.argv, self.timeout = f"cmd:{command}", shlex.split(command), timeout

    def complete(self, prompt, system, case_id=None):
        env = {**os.environ, "EVALKIT_CASE_ID": case_id or "", "EVALKIT_SYSTEM": system or ""}
        res = subprocess.run(self.argv, input=prompt, capture_output=True, text=True,
                             timeout=self.timeout, env=env)
        if res.returncode != 0:
            raise RuntimeError(f"exit {res.returncode}: {res.stderr.strip()[:300]}")
        return res.stdout.strip()


def _post_json(url: str, body: dict, headers: dict, timeout: float, retries: int = 3) -> dict:
    data = json.dumps(body).encode()
    for attempt in range(retries + 1):
        req = urllib.request.Request(url, data=data, headers={"content-type": "application/json", **headers})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as res:
                return json.load(res)
        except urllib.error.HTTPError as err:
            if err.code in (429, 500, 502, 503, 529) and attempt < retries:
                time.sleep(min(2 ** attempt, 20))
                continue
            raise RuntimeError(f"HTTP {err.code}: {err.read().decode('utf-8', 'replace')[:300]}") from None
    raise RuntimeError("unreachable")


class OpenAIProvider(Provider):
    """OpenAI-compatible chat completions (OpenAI, Azure-compatible gateways, vLLM, Ollama, LM Studio...)."""

    def __init__(self, model: str, temperature: float, timeout: float):
        self.name, self.model, self.temperature, self.timeout = f"openai:{model}", model, temperature, timeout
        self.base = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        self.key = os.environ.get("OPENAI_API_KEY", "")

    def complete(self, prompt, system, case_id=None):
        msgs = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": prompt}]
        res = _post_json(f"{self.base}/chat/completions",
                         {"model": self.model, "messages": msgs, "temperature": self.temperature},
                         {"authorization": f"Bearer {self.key}"} if self.key else {}, self.timeout)
        return res["choices"][0]["message"]["content"] or ""


class AnthropicProvider(Provider):
    def __init__(self, model: str, temperature: float, timeout: float):
        self.name, self.model, self.temperature, self.timeout = f"anthropic:{model}", model, temperature, timeout
        self.base = os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com").rstrip("/")
        self.key = os.environ.get("ANTHROPIC_API_KEY", "")

    def complete(self, prompt, system, case_id=None):
        body: dict[str, Any] = {"model": self.model, "max_tokens": 1024, "temperature": self.temperature,
                                "messages": [{"role": "user", "content": prompt}]}
        if system:
            body["system"] = system
        res = _post_json(f"{self.base}/v1/messages", body,
                         {"x-api-key": self.key, "anthropic-version": "2023-06-01"}, self.timeout)
        return "".join(b.get("text", "") for b in res.get("content", []) if b.get("type") == "text")


def make_provider(spec: str, temperature: float = 0.0, timeout: float = 60.0) -> Provider:
    kind, _, rest = spec.partition(":")
    if not rest:
        raise ValueError(f"provider must be kind:value, got {spec!r}")
    if kind == "mock":
        return MockProvider(rest)
    if kind == "cmd":
        return CmdProvider(rest, timeout)
    if kind == "openai":
        return OpenAIProvider(rest, temperature, timeout)
    if kind == "anthropic":
        return AnthropicProvider(rest, temperature, timeout)
    raise ValueError(f"unknown provider kind {kind!r} (mock | cmd | openai | anthropic)")


# --------------------------------------------------------------------------- running

@dataclass
class CaseResult:
    id: str
    passed: int = 0
    runs: int = 0
    failures: list[str] = field(default_factory=list)
    latency_ms: list[float] = field(default_factory=list)
    sample: str = ""
    tags: list[str] = field(default_factory=list)

    @property
    def rate(self) -> float:
        return self.passed / self.runs if self.runs else 0.0


def validate_suite(suite: dict) -> list[str]:
    errs = []
    if not isinstance(suite.get("cases"), list) or not suite["cases"]:
        return ["suite needs a non-empty 'cases' list"]
    seen = set()
    for i, c in enumerate(suite["cases"]):
        cid = c.get("id", f"#{i}")
        if cid in seen:
            errs.append(f"duplicate case id {cid!r}")
        seen.add(cid)
        if "input" not in c:
            errs.append(f"{cid}: missing 'input'")
        expect = c.get("expect") or {}
        if not expect:
            errs.append(f"{cid}: empty 'expect'")
        for g in expect:
            if g not in GRADERS:
                errs.append(f"{cid}: unknown grader {g!r} (known: {', '.join(GRADERS)})")
    return errs


def grade(output: str, expect: dict, ctx: dict) -> list[str]:
    failures = []
    for name, arg in expect.items():
        ok, detail = GRADERS[name](output, arg, ctx)
        if not ok:
            failures.append(f"{name}: {detail}")
    return failures


def run_suite(suite: dict, provider: Provider, repeats: int = 1, workers: int = 4,
              judge: Provider | None = None, only: str | None = None) -> dict:
    cases = [c for c in suite["cases"] if not only or re.search(only, c["id"])]
    results = {c["id"]: CaseResult(c["id"], tags=list(c.get("tags", []))) for c in cases}

    def one(case: dict) -> tuple[str, str | None, list[str], float]:
        t0 = time.perf_counter()
        try:
            out = provider.complete(case["input"], case.get("system", suite.get("system")), case["id"])
        except Exception as err:  # provider failures are case failures, not harness crashes
            return case["id"], None, [f"provider error: {err}"], (time.perf_counter() - t0) * 1000
        ms = (time.perf_counter() - t0) * 1000
        ctx = {"input": case["input"], "judge": judge}
        return case["id"], out, grade(out, case["expect"], ctx), ms

    jobs = [c for c in cases for _ in range(repeats)]
    t0 = time.perf_counter()
    with cf.ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        for cid, out, failures, ms in pool.map(one, jobs):
            r = results[cid]
            r.runs += 1
            r.latency_ms.append(ms)
            if failures:
                r.failures.extend(f for f in failures if f not in r.failures)
            else:
                r.passed += 1
            if out is not None and (not r.sample or failures):
                r.sample = out[:500]
    total_runs = sum(r.runs for r in results.values())
    total_pass = sum(r.passed for r in results.values())
    lat = sorted(x for r in results.values() for x in r.latency_ms)
    by_tag: dict[str, list[float]] = {}
    for r in results.values():
        for t in r.tags:
            by_tag.setdefault(t, []).append(r.rate)
    return {
        "suite": suite.get("name", "suite"), "provider": provider.name, "repeats": repeats,
        "evalkit": __version__, "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "duration_s": round(time.perf_counter() - t0, 3),
        "pass_rate": round(total_pass / total_runs, 4) if total_runs else 0.0,
        "pass_rate_ci95": wilson(total_pass, total_runs),
        "cases_fully_passing": sum(1 for r in results.values() if r.passed == r.runs),
        "cases": len(results),
        "flaky": sorted(r.id for r in results.values() if 0 < r.passed < r.runs),
        "latency_ms": {"p50": _pct(lat, 50), "p95": _pct(lat, 95)},
        "by_tag": {t: round(sum(v) / len(v), 4) for t, v in sorted(by_tag.items())},
        "results": [{"id": r.id, "rate": round(r.rate, 4), "passed": r.passed, "runs": r.runs,
                     "failures": r.failures, "sample": r.sample, "tags": r.tags} for r in results.values()],
    }


def wilson(k: int, n: int, z: float = 1.96) -> list[float]:
    """95% Wilson score interval: honest uncertainty for small suites."""
    if n == 0:
        return [0.0, 0.0]
    p = k / n
    den = 1 + z * z / n
    center = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return [round(max(0.0, center - half), 4), round(min(1.0, center + half), 4)]


def _pct(xs: list[float], p: int) -> float:
    if not xs:
        return 0.0
    i = min(len(xs) - 1, max(0, math.ceil(p / 100 * len(xs)) - 1))
    return round(xs[i], 1)


def compare(report: dict, baseline: dict) -> dict:
    base = {r["id"]: r["rate"] for r in baseline.get("results", [])}
    now = {r["id"]: r["rate"] for r in report["results"]}
    return {
        "regressions": sorted(i for i in now if i in base and now[i] < base[i]),
        "fixes": sorted(i for i in now if i in base and now[i] > base[i]),
        "new": sorted(i for i in now if i not in base),
        "delta_pass_rate": round(report["pass_rate"] - baseline.get("pass_rate", 0.0), 4),
    }


# --------------------------------------------------------------------------- output

def render_text(report: dict, diff: dict | None) -> str:
    lines = [f"evalkit · {report['suite']} · {report['provider']} · repeats={report['repeats']}", ""]
    for r in report["results"]:
        mark = "PASS" if r["passed"] == r["runs"] else ("FLAKY" if r["passed"] else "FAIL")
        lines.append(f"  {mark:<5} {r['id']:<28} {r['passed']}/{r['runs']}")
        for f in r["failures"][:3]:
            lines.append(f"        - {f}")
    lo, hi = report["pass_rate_ci95"]
    lines += ["", f"pass rate {report['pass_rate']:.1%} (95% CI {lo:.1%}–{hi:.1%}) · "
                  f"{report['cases_fully_passing']}/{report['cases']} cases fully passing · "
                  f"p50 {report['latency_ms']['p50']}ms p95 {report['latency_ms']['p95']}ms"]
    if report["by_tag"]:
        lines.append("by tag: " + ", ".join(f"{t} {v:.0%}" for t, v in report["by_tag"].items()))
    if report["flaky"]:
        lines.append(f"flaky: {', '.join(report['flaky'])}")
    if diff:
        lines.append(f"vs baseline: {diff['delta_pass_rate']:+.1%} · regressions {diff['regressions'] or 'none'}"
                     f" · fixes {diff['fixes'] or 'none'}")
    return "\n".join(lines)


def render_markdown(report: dict, diff: dict | None) -> str:
    lo, hi = report["pass_rate_ci95"]
    out = [f"## evalkit: {report['suite']}", "",
           f"**{report['pass_rate']:.1%}** pass rate (95% CI {lo:.1%}–{hi:.1%}) · provider `{report['provider']}`", "",
           "| Case | Result | Failures |", "|---|---|---|"]
    for r in report["results"]:
        res = "✅" if r["passed"] == r["runs"] else ("⚠️ flaky" if r["passed"] else "❌")
        fails = "<br>".join(f.replace("|", "\\|") for f in r["failures"][:2])
        out.append(f"| `{r['id']}` | {res} {r['passed']}/{r['runs']} | {fails} |")
    if diff and diff["regressions"]:
        out += ["", f"**Regressions:** {', '.join(diff['regressions'])}"]
    return "\n".join(out) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="evalkit", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--version", action="version", version=f"evalkit {__version__}")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run", help="run a suite")
    r.add_argument("suite")
    r.add_argument("--provider", required=True, help="mock:FILE | cmd:COMMAND | openai:MODEL | anthropic:MODEL")
    r.add_argument("--judge", help="provider used by llm_judge graders")
    r.add_argument("--repeats", type=int, default=1, help="samples per case (detects flakiness)")
    r.add_argument("--workers", type=int, default=4)
    r.add_argument("--temperature", type=float, default=0.0)
    r.add_argument("--timeout", type=float, default=60.0)
    r.add_argument("--only", help="regex on case ids")
    r.add_argument("--baseline", help="previous JSON report to diff against")
    r.add_argument("--out", help="write the JSON report here")
    r.add_argument("--markdown", help="write a Markdown summary here (e.g. $GITHUB_STEP_SUMMARY)")
    r.add_argument("--min-pass", type=float, help="exit 1 if pass rate is below this (0-1)")
    r.add_argument("--fail-on-regression", action="store_true")
    v = sub.add_parser("validate", help="validate a suite")
    v.add_argument("suite")
    a = ap.parse_args(argv)

    try:
        suite = json.loads(Path(a.suite).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as err:
        print(f"error: cannot read suite: {err}", file=sys.stderr)
        return 2
    errs = validate_suite(suite)
    if errs:
        print("invalid suite:\n  - " + "\n  - ".join(errs), file=sys.stderr)
        return 2
    if a.cmd == "validate":
        print(f"ok: {len(suite['cases'])} cases")
        return 0
    try:
        provider = make_provider(a.provider, a.temperature, a.timeout)
        judge = make_provider(a.judge, 0.0, a.timeout) if a.judge else None
    except (ValueError, OSError, json.JSONDecodeError) as err:
        print(f"error: {err}", file=sys.stderr)
        return 2
    report = run_suite(suite, provider, a.repeats, a.workers, judge, a.only)
    diff = None
    if a.baseline and Path(a.baseline).exists():
        diff = compare(report, json.loads(Path(a.baseline).read_text(encoding="utf-8")))
        report["diff"] = diff
    print(render_text(report, diff))
    if a.out:
        Path(a.out).write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if a.markdown:
        with open(a.markdown, "a", encoding="utf-8") as fh:
            fh.write(render_markdown(report, diff))
    if a.min_pass is not None and report["pass_rate"] < a.min_pass:
        print(f"FAIL: pass rate {report['pass_rate']:.1%} < {a.min_pass:.1%}", file=sys.stderr)
        return 1
    if a.fail_on_regression and diff and diff["regressions"]:
        print(f"FAIL: regressions {diff['regressions']}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
