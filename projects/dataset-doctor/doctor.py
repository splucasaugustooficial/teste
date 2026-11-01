#!/usr/bin/env python3
"""dataset-doctor: audit and clean JSONL datasets before fine-tuning or evaluation. Stdlib only.

    python3 doctor.py audit data/sample_train.jsonl --test data/sample_test.jsonl
    python3 doctor.py clean data/sample_train.jsonl -o clean.jsonl --redact --dedupe
    python3 doctor.py audit data.jsonl --fields prompt,completion --json

Checks
  exact duplicates · near duplicates (MinHash + LSH, Jaccard on word 5-shingles)
  PII: e-mail, phone (BR/intl), CPF and CNPJ (checksum-validated), credit card (Luhn), IPv4
  empty / too short / length outliers (IQR) · train→test contamination (13-gram overlap)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import statistics
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

__version__ = "1.0.0"


# --------------------------------------------------------------------------- text

def norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return " ".join(re.findall(r"[a-z0-9]+", text))


def record_text(rec: dict, fields: list[str] | None) -> str:
    """Join the text fields. Understands chat format {"messages": [{"role","content"}]}."""
    if fields:
        return "\n".join(str(rec.get(f, "")) for f in fields)
    if isinstance(rec.get("messages"), list):
        return "\n".join(str(m.get("content", "")) for m in rec["messages"] if isinstance(m, dict))
    return "\n".join(str(v) for v in rec.values() if isinstance(v, str))


# --------------------------------------------------------------------------- PII

def _cpf_ok(digits: str) -> bool:
    if len(digits) != 11 or digits == digits[0] * 11:
        return False
    for n in (9, 10):
        s = sum(int(digits[i]) * (n + 1 - i) for i in range(n))
        if (s * 10 % 11) % 10 != int(digits[n]):
            return False
    return True


def _cnpj_ok(digits: str) -> bool:
    if len(digits) != 14 or digits == digits[0] * 14:
        return False
    for n, weights in ((12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]), (13, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])):
        r = sum(int(d) * w for d, w in zip(digits[:n], weights)) % 11
        if (0 if r < 2 else 11 - r) != int(digits[n]):
            return False
    return True


def _luhn_ok(digits: str) -> bool:
    if not 13 <= len(digits) <= 19:
        return False
    total, alt = 0, False
    for d in reversed(digits):
        x = int(d) * (2 if alt else 1)
        total += x - 9 if x > 9 else x
        alt = not alt
    return total % 10 == 0


PII_PATTERNS: list[tuple[str, re.Pattern, Any]] = [
    ("email", re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b"), None),
    ("cpf", re.compile(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b"), _cpf_ok),
    ("cnpj", re.compile(r"\b\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\b"), _cnpj_ok),
    ("credit_card", re.compile(r"\b(?:\d[ -]?){13,19}\b"), _luhn_ok),
    ("phone", re.compile(r"(?<![\w])(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b|\+\d{1,3}[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}\b"), None),
    ("ipv4", re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b"), None),
]


def find_pii(text: str) -> list[tuple[str, str, int, int]]:
    found, taken = [], []
    for kind, rx, validator in PII_PATTERNS:  # order matters: specific (validated) kinds claim spans first
        for m in rx.finditer(text):
            if any(m.start() < e and s < m.end() for s, e in taken):
                continue
            if validator and not validator(re.sub(r"\D", "", m.group(0))):
                continue
            found.append((kind, m.group(0), m.start(), m.end()))
            taken.append((m.start(), m.end()))
    return sorted(found, key=lambda x: x[2])


def redact(text: str) -> str:
    for kind, _, s, e in sorted(find_pii(text), key=lambda x: -x[2]):
        text = text[:s] + f"[{kind.upper()}]" + text[e:]
    return text


def redact_record(rec: Any) -> Any:
    if isinstance(rec, str):
        return redact(rec)
    if isinstance(rec, list):
        return [redact_record(x) for x in rec]
    if isinstance(rec, dict):
        return {k: redact_record(v) for k, v in rec.items()}
    return rec


# --------------------------------------------------------------------------- near-duplicates

def shingles(text: str, k: int = 5) -> set[str]:
    w = norm(text).split()
    return {" ".join(w[i:i + k]) for i in range(max(1, len(w) - k + 1))} if w else set()


def minhash(sh: set[str], num_perm: int = 128) -> list[int]:
    if not sh:
        return [0] * num_perm
    hs = [int.from_bytes(hashlib.blake2b(s.encode(), digest_size=8).digest(), "little") for s in sh]
    mask, prime = (1 << 61) - 1, (1 << 61) - 1
    sig = []
    for i in range(num_perm):
        a, b = 6364136223846793005 * (i + 1) % prime, 1442695040888963407 * (i + 7) % prime
        sig.append(min((a * h + b) % prime & mask for h in hs))
    return sig


def near_duplicates(texts: list[str], threshold: float = 0.8, bands: int = 32, rows: int = 4) -> list[tuple[int, int, float]]:
    """LSH over MinHash candidates, then exact Jaccard to confirm (no false positives reported)."""
    shs = [shingles(t) for t in texts]
    sigs = [minhash(s, bands * rows) for s in shs]
    buckets: dict[tuple, list[int]] = defaultdict(list)
    for i, sig in enumerate(sigs):
        if not shs[i]:
            continue
        for b in range(bands):
            buckets[(b, tuple(sig[b * rows:(b + 1) * rows]))].append(i)
    cands = {(min(x, y), max(x, y)) for ids in buckets.values() if len(ids) > 1 for x in ids for y in ids if x != y}
    out = []
    for i, j in sorted(cands):
        jac = len(shs[i] & shs[j]) / len(shs[i] | shs[j])
        if jac >= threshold:
            out.append((i, j, round(jac, 3)))
    return out


# --------------------------------------------------------------------------- contamination

def ngrams(text: str, n: int = 13) -> set[str]:
    w = norm(text).split()
    return {" ".join(w[i:i + n]) for i in range(len(w) - n + 1)}


def contamination(train: list[str], test: list[str], n: int = 13, min_overlap: float = 0.0) -> list[tuple[int, int, float]]:
    """Test items sharing n-grams with train (GPT-3 style 13-gram check).

    Reports the train item with the MOST shared n-grams and the fraction of the test item's
    n-grams it covers. Boilerplate shared by many items makes "first match" attribution wrong;
    the fraction lets you separate copied items (~1.0) from shared templates (low).
    """
    index: dict[str, list[int]] = defaultdict(list)
    for i, t in enumerate(train):
        for g in ngrams(t, n):
            index[g].append(i)
    hits = []
    for j, t in enumerate(test):
        grams = ngrams(t, n)
        votes: dict[int, int] = defaultdict(int)
        for g in grams:
            for i in index.get(g, ()):
                votes[i] += 1
        if votes:
            best = max(votes, key=lambda i: (votes[i], -i))
            frac = round(votes[best] / len(grams), 3)
            if frac >= min_overlap:
                hits.append((j, best, frac))
    return hits


# --------------------------------------------------------------------------- audit

def load_jsonl(path: str) -> tuple[list[dict], list[str]]:
    recs, errors = [], []
    for n, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            obj = json.loads(line)
            if not isinstance(obj, dict):
                raise ValueError("not an object")
            recs.append(obj)
        except (json.JSONDecodeError, ValueError) as err:
            errors.append(f"line {n}: {err}")
    return recs, errors


def audit(recs: list[dict], fields: list[str] | None = None, test: list[dict] | None = None,
          near_threshold: float = 0.8, min_words: int = 3) -> dict:
    texts = [record_text(r, fields) for r in recs]
    seen: dict[str, int] = {}
    exact = []
    for i, t in enumerate(texts):
        key = hashlib.sha1(norm(t).encode()).hexdigest()
        if key in seen:
            exact.append((seen[key], i))
        else:
            seen[key] = i
    exact_dups = {j for _, j in exact}
    near = [(i, j, s) for i, j, s in near_duplicates(texts, near_threshold) if j not in exact_dups and i not in exact_dups]
    pii = [(i, kind, val) for i, t in enumerate(texts) for kind, val, _, _ in find_pii(t)]
    lengths = [len(t.split()) for t in texts]
    short = [i for i, n in enumerate(lengths) if n < min_words]
    outliers: list[int] = []
    if len(lengths) >= 8:
        q1, _, q3 = statistics.quantiles(lengths, n=4)
        hi = q3 + 3 * (q3 - q1)
        outliers = [i for i, n in enumerate(lengths) if n > hi]
    contam = contamination(texts, [record_text(r, fields) for r in test]) if test else []
    pii_by_kind: dict[str, int] = defaultdict(int)
    for _, kind, _ in pii:
        pii_by_kind[kind] += 1
    return {
        "records": len(recs),
        "exact_duplicates": [{"first": a, "dup": b} for a, b in exact],
        "near_duplicates": [{"a": a, "b": b, "jaccard": s} for a, b, s in near],
        "pii": [{"record": i, "kind": k, "value": v} for i, k, v in pii],
        "pii_by_kind": dict(sorted(pii_by_kind.items())),
        "too_short": short,
        "length_outliers": outliers,
        "length_words": {"min": min(lengths, default=0), "median": statistics.median(lengths) if lengths else 0,
                         "max": max(lengths, default=0)},
        "contaminated_test_items": [{"test": j, "train": i, "overlap": f} for j, i, f in contam],
    }


def health_score(rep: dict) -> int:
    n = max(1, rep["records"])
    bad = (len(rep["exact_duplicates"]) + len(rep["near_duplicates"]) + len({p["record"] for p in rep["pii"]})
           + len(rep["too_short"]) + len(rep["length_outliers"]))
    return max(0, round(100 * (1 - bad / n)) - 10 * bool(rep["contaminated_test_items"]))


def render(rep: dict, path: str) -> str:
    def mask(v: str) -> str:
        return v[:2] + "…" + v[-2:] if len(v) > 6 else "…"
    lines = [f"dataset-doctor · {path} · {rep['records']} records · health {health_score(rep)}/100", ""]
    lines.append(f"  exact duplicates   {len(rep['exact_duplicates'])}" +
                 (f"  e.g. #{rep['exact_duplicates'][0]['dup']} = #{rep['exact_duplicates'][0]['first']}" if rep["exact_duplicates"] else ""))
    lines.append(f"  near duplicates    {len(rep['near_duplicates'])}" +
                 "".join(f"\n    #{d['a']} ~ #{d['b']} (Jaccard {d['jaccard']})" for d in rep["near_duplicates"][:5]))
    lines.append(f"  PII                {len(rep['pii'])} in {len({p['record'] for p in rep['pii']})} records "
                 f"{rep['pii_by_kind'] or ''}" +
                 "".join(f"\n    #{p['record']} {p['kind']}: {mask(p['value'])}" for p in rep["pii"][:6]))
    lines.append(f"  too short          {len(rep['too_short'])} {rep['too_short'][:10] or ''}")
    lines.append(f"  length outliers    {len(rep['length_outliers'])} {rep['length_outliers'][:10] or ''}  "
                 f"(words: min {rep['length_words']['min']}, median {rep['length_words']['median']}, max {rep['length_words']['max']})")
    if "contaminated_test_items" in rep:
        c = rep["contaminated_test_items"]
        lines.append(f"  test contamination {len(c)}" + "".join(
            f"\n    test #{x['test']} overlaps train #{x['train']} ({x['overlap']:.0%} of its 13-grams)" for x in c[:5]))
    return "\n".join(lines)


def cmd_audit(a) -> int:
    recs, errors = load_jsonl(a.data)
    test = load_jsonl(a.test)[0] if a.test else None
    fields = a.fields.split(",") if a.fields else None
    rep = audit(recs, fields, test, a.near)
    rep["parse_errors"] = errors
    rep["health"] = health_score(rep)
    if a.json:
        print(json.dumps(rep, indent=2, ensure_ascii=False))
    else:
        print(render(rep, a.data))
        for e in errors[:5]:
            print(f"  parse error: {e}")
    if a.min_health is not None and rep["health"] < a.min_health:
        print(f"FAIL: health {rep['health']} < {a.min_health}", file=sys.stderr)
        return 1
    return 0


def cmd_clean(a) -> int:
    recs, _ = load_jsonl(a.data)
    fields = a.fields.split(",") if a.fields else None
    rep = audit(recs, fields, None, a.near)
    drop: set[int] = set()
    if a.dedupe:
        drop |= {d["dup"] for d in rep["exact_duplicates"]} | {d["b"] for d in rep["near_duplicates"]}
    if a.drop_short:
        drop |= set(rep["too_short"])
    kept = [redact_record(r) if a.redact else r for i, r in enumerate(recs) if i not in drop]
    Path(a.out).write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in kept), encoding="utf-8")
    print(f"kept {len(kept)}/{len(recs)} records → {a.out}" + (" (PII redacted)" if a.redact else ""))
    return 0


def main(argv: Iterable[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="dataset-doctor", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    au = sub.add_parser("audit")
    au.add_argument("data")
    au.add_argument("--test", help="eval/test JSONL to check for contamination")
    au.add_argument("--fields", help="comma-separated text fields (default: chat messages or all strings)")
    au.add_argument("--near", type=float, default=0.8, help="near-duplicate Jaccard threshold")
    au.add_argument("--min-health", type=int, help="exit 1 below this score (CI gate)")
    au.add_argument("--json", action="store_true")
    au.set_defaults(fn=cmd_audit)
    cl = sub.add_parser("clean")
    cl.add_argument("data")
    cl.add_argument("-o", "--out", required=True)
    cl.add_argument("--fields")
    cl.add_argument("--near", type=float, default=0.8)
    cl.add_argument("--dedupe", action="store_true")
    cl.add_argument("--redact", action="store_true")
    cl.add_argument("--drop-short", action="store_true")
    cl.set_defaults(fn=cmd_clean)
    a = ap.parse_args(list(argv) if argv is not None else None)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
