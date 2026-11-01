from __future__ import annotations

import contextlib
import io
import json
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import evalkit as ek  # noqa: E402

EX = ROOT / "examples"


def run(*argv: str) -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = ek.main(list(argv))
    return code, out.getvalue(), err.getvalue()


class GraderTests(unittest.TestCase):
    def g(self, name, out, arg, ctx=None):
        return ek.GRADERS[name](out, arg, ctx or {"input": "q"})[0]

    def test_text_graders(self):
        self.assertTrue(self.g("equals", "  Hello   World ", "hello world"))
        self.assertTrue(self.g("contains", "Prazo de 7 Dias", ["7 dias", "prazo"]))
        self.assertFalse(self.g("contains", "Prazo", ["7 dias"]))
        self.assertTrue(self.g("contains_any", "não posso", ["x", "não posso"]))
        self.assertFalse(self.g("not_contains", "secret key", "SECRET"))
        self.assertTrue(self.g("regex", "Order #42", r"#\d+"))
        self.assertFalse(self.g("max_chars", "abcd", 3))
        self.assertTrue(self.g("min_chars", "abcd", 4))

    def test_json_schema(self):
        schema = {"type": "object", "required": ["a"], "properties": {
            "a": {"type": "integer", "minimum": 1}, "b": {"type": "array", "items": {"enum": ["x", "y"]}}}}
        self.assertTrue(self.g("json_schema", '```json\n{"a": 2, "b": ["x"]}\n```', schema))
        self.assertFalse(self.g("json_schema", '{"a": true}', schema))  # bool is not integer
        self.assertFalse(self.g("json_schema", '{"a": 0}', schema))
        self.assertFalse(self.g("json_schema", '{"b": ["z"]}', schema))
        self.assertFalse(self.g("json_schema", "not json", schema))

    def test_number_close_handles_comma_decimals(self):
        self.assertTrue(self.g("number_close", "Total R$ 37,50", {"value": 37.5, "tolerance": 0.01}))
        self.assertFalse(self.g("number_close", "Total R$ 38", {"value": 37.5, "tolerance": 0.01}))

    def test_llm_judge(self):
        class Judge(ek.Provider):
            name = "judge"
            def complete(self, prompt, system, case_id=None):
                return '{"pass": %s, "reason": "r"}' % ("true" if "GOOD" in prompt else "false")
        self.assertTrue(self.g("llm_judge", "GOOD answer", "be good", {"input": "q", "judge": Judge()}))
        self.assertFalse(self.g("llm_judge", "bad", "be good", {"input": "q", "judge": Judge()}))
        self.assertFalse(self.g("llm_judge", "x", "rubric", {"input": "q"}))  # no judge configured

    def test_wilson(self):
        self.assertEqual(ek.wilson(0, 0), [0.0, 0.0])
        lo, hi = ek.wilson(5, 6)
        self.assertTrue(0.4 < lo < 0.5 and 0.95 < hi <= 1.0)


class RunTests(unittest.TestCase):
    def test_example_v1_v2_regression(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = str(Path(tmp) / "v1.json")
            code, out, _ = run("run", str(EX / "support-bot.json"), "--provider", f"mock:{EX / 'answers-v1.json'}",
                               "--out", base)
            self.assertEqual(code, 0)
            self.assertAlmostEqual(json.loads(Path(base).read_text())["pass_rate"], 4 / 6, places=3)
            md = str(Path(tmp) / "summary.md")
            code, out, err = run("run", str(EX / "support-bot.json"), "--provider", f"mock:{EX / 'answers-v2.json'}",
                                 "--baseline", base, "--fail-on-regression", "--markdown", md)
            self.assertEqual(code, 1)
            self.assertIn("regressions ['language-pt']", out)
            self.assertIn("fixes ['no-prompt-leak', 'tracking-json']", out)
            self.assertIn("| `language-pt` | ❌", Path(md).read_text())

    def test_min_pass_gate(self):
        code, _, err = run("run", str(EX / "support-bot.json"), "--provider", f"mock:{EX / 'answers-v1.json'}",
                           "--min-pass", "0.9")
        self.assertEqual(code, 1)
        self.assertIn("< 90.0%", err)

    def test_flaky_detection_with_repeats(self):
        class Coin(ek.Provider):
            name = "coin"
            def __init__(self):
                self.n = 0
                self.lock = threading.Lock()
            def complete(self, prompt, system, case_id=None):
                with self.lock:
                    self.n += 1
                    return "yes" if self.n % 2 else "no"
        suite = {"cases": [{"id": "c", "input": "?", "expect": {"equals": "yes"}}]}
        rep = ek.run_suite(suite, Coin(), repeats=4, workers=1)
        self.assertEqual(rep["flaky"], ["c"])
        self.assertEqual(rep["results"][0]["passed"], 2)

    def test_provider_errors_are_case_failures(self):
        class Boom(ek.Provider):
            name = "boom"
            def complete(self, prompt, system, case_id=None):
                raise RuntimeError("down")
        rep = ek.run_suite({"cases": [{"id": "c", "input": "?", "expect": {"equals": "x"}}]}, Boom())
        self.assertEqual(rep["pass_rate"], 0.0)
        self.assertIn("provider error: down", rep["results"][0]["failures"][0])

    def test_cmd_provider(self):
        code, out, _ = run("run", str(EX / "support-bot.json"), "--provider",
                           f"cmd:{sys.executable} {EX / 'echo_app.py'}", "--only", "refund|math")
        self.assertEqual(code, 0, out)
        self.assertIn("2/2 cases fully passing", out)

    def test_validate(self):
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / "bad.json"
            bad.write_text(json.dumps({"cases": [{"id": "a", "input": "x", "expect": {"nope": 1}},
                                                 {"id": "a", "expect": {}}]}))
            code, _, err = run("validate", str(bad))
            self.assertEqual(code, 2)
            for needle in ("unknown grader 'nope'", "duplicate case id 'a'", "missing 'input'", "empty 'expect'"):
                self.assertIn(needle, err)
        self.assertEqual(run("validate", str(EX / "support-bot.json"))[0], 0)


class FakeAPI(BaseHTTPRequestHandler):
    requests: list = []

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["content-length"])))
        FakeAPI.requests.append((self.path, {k.lower(): v for k, v in self.headers.items()}, body))
        if self.path.endswith("/chat/completions"):
            res = {"choices": [{"message": {"content": "Você tem 7 dias."}}]}
        else:
            res = {"content": [{"type": "text", "text": "Você tem 7 dias."}]}
        data = json.dumps(res).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass


class HttpProviderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), FakeAPI)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        FakeAPI.requests.clear()

    def test_openai_wire_format(self):
        with unittest.mock.patch.dict("os.environ", {"OPENAI_BASE_URL": self.url + "/v1", "OPENAI_API_KEY": "k"}):
            out = ek.make_provider("openai:m").complete("oi", system="sys")
        self.assertEqual(out, "Você tem 7 dias.")
        path, headers, body = FakeAPI.requests[0]
        self.assertEqual(path, "/v1/chat/completions")
        self.assertEqual(headers["authorization"], "Bearer k")
        self.assertEqual(body["messages"], [{"role": "system", "content": "sys"}, {"role": "user", "content": "oi"}])

    def test_anthropic_wire_format(self):
        with unittest.mock.patch.dict("os.environ", {"ANTHROPIC_BASE_URL": self.url, "ANTHROPIC_API_KEY": "k"}):
            out = ek.make_provider("anthropic:m").complete("oi", system="sys")
        self.assertEqual(out, "Você tem 7 dias.")
        path, headers, body = FakeAPI.requests[0]
        self.assertEqual(path, "/v1/messages")
        self.assertEqual(headers["x-api-key"], "k")
        self.assertEqual(headers["anthropic-version"], "2023-06-01")
        self.assertEqual(body["system"], "sys")
        self.assertEqual(body["max_tokens"], 1024)


import unittest.mock  # noqa: E402

if __name__ == "__main__":
    unittest.main()
