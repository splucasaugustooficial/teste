#!/usr/bin/env python3
"""Tests for forge.py. Standard library only.

    python3 -m unittest discover -s .agents/skills/mcp-forge/tests -v

Set MCP_FORGE_E2E=1 to also build and smoke-test generated TypeScript (needs node/npm)
and Python (needs uv) servers end to end, offline.
"""
from __future__ import annotations

import contextlib
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "scripts"))
import forge  # noqa: E402

FIXTURES = HERE / "fixtures"
FAKE = [sys.executable, str(FIXTURES / "fake_server.py")]
EXAMPLE = ROOT / "examples" / "weather.json"


def run(*argv: str) -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = forge.main(list(argv))
    return code, out.getvalue(), err.getvalue()


def minimal(**over):
    spec = {"name": "demo", "base_url": "https://api.example.com",
            "tools": [{"name": "get_item", "description": "Fetch one item by its id from the API.",
                       "method": "GET", "path": "/items/{id}",
                       "params": {"id": {"type": "string"}, "verbose": {"type": "boolean"}}}]}
    spec.update(over)
    return spec


class SpecTests(unittest.TestCase):
    def test_defaults_and_locations(self):
        spec = forge.normalize_spec(minimal())
        p = {x["name"]: x for x in spec["tools"][0]["params"]}
        self.assertEqual(p["id"]["in"], "path")
        self.assertTrue(p["id"]["required"])
        self.assertEqual(p["verbose"]["in"], "query")
        self.assertTrue(spec["tools"][0]["read_only"])
        self.assertEqual(spec["language"], "typescript")

    def test_post_params_go_to_body(self):
        raw = minimal(tools=[{"name": "make", "description": "Create a new item in the catalog.",
                              "method": "POST", "path": "/items", "params": {"title": {"required": True}}}])
        spec = forge.normalize_spec(raw)
        self.assertEqual(spec["tools"][0]["params"][0]["in"], "body")
        self.assertFalse(spec["tools"][0]["read_only"])

    def test_collects_every_error(self):
        raw = {"name": "Bad Name", "tools": [
            {"name": "BadTool", "description": "short", "method": "GET", "path": "/x/{id}"},
            {"name": "dup", "description": "a description long enough"},
            {"name": "dup", "description": "a description long enough"}]}
        with self.assertRaises(forge.SpecError) as cm:
            forge.normalize_spec(raw)
        msg = str(cm.exception)
        for needle in ("name:", "BadTool", ">= 20 chars", "base_url", "placeholder '{id}'", "duplicate 'dup'"):
            self.assertIn(needle, msg)

    def test_custom_tool_and_identifiers(self):
        raw = minimal(tools=[{"name": "think", "description": "Custom logic tool with no HTTP call.",
                              "params": {"class": {"type": "string"}, "user-id": {"type": "integer"}}}])
        spec = forge.normalize_spec(raw)
        t = spec["tools"][0]
        self.assertEqual(t["kind"], "custom")
        self.assertEqual([p["ident"] for p in t["params"]], ["class_", "user_id"])

    def test_auth_env_default(self):
        spec = forge.normalize_spec(minimal(auth={"type": "bearer"}))
        self.assertEqual(spec["auth"]["env"], "DEMO_API_KEY")
        with self.assertRaises(forge.SpecError):
            forge.normalize_spec(minimal(auth={"type": "header"}))

    def test_example_is_valid(self):
        code, out, _ = run("validate", str(EXAMPLE))
        self.assertEqual(code, 0, out)


class OpenApiTests(unittest.TestCase):
    def setUp(self):
        self.doc = json.loads((FIXTURES / "petstore.json").read_text())

    def test_conversion(self):
        raw = forge.openapi_to_spec(self.doc, None, "python", None, 40)
        self.assertEqual(raw["name"], "pet-store")
        self.assertEqual(raw["base_url"], "https://api.example.com/v1")
        self.assertEqual(raw["auth"], {"type": "header", "name": "X-API-Key"})
        names = [t["name"] for t in raw["tools"]]
        self.assertEqual(names, ["list_pets", "create_pet", "show_pet_by_id", "delete_pet"])  # deprecated skipped
        tools = {t["name"]: t for t in raw["tools"]}
        self.assertNotIn("X-API-Key", tools["list_pets"]["params"])  # auth header is not a tool param
        self.assertEqual(tools["show_pet_by_id"]["params"]["petId"]["type"], "integer")
        body = tools["create_pet"]["params"]
        self.assertTrue(body["name"]["required"])
        self.assertEqual(body["tag"]["enum"], ["dog", "cat"])
        self.assertEqual(body["vaccines"]["items"], {"type": "string"})
        spec = forge.normalize_spec(raw)  # derived spec must be valid
        self.assertTrue(spec["tools"][3]["destructive"])

    def test_include_and_cap(self):
        raw = forge.openapi_to_spec(self.doc, "pets", "typescript", "pet_by_id|delete", 40)
        self.assertEqual([t["name"] for t in raw["tools"]], ["show_pet_by_id", "delete_pet"])
        raw = forge.openapi_to_spec(self.doc, "pets", "typescript", None, 1)
        self.assertEqual(len(raw["tools"]), 1)

    def test_rejects_non_openapi(self):
        with self.assertRaises(forge.SpecError):
            forge.openapi_to_spec({"hello": 1}, None, "typescript", None, 40)


class RenderTests(unittest.TestCase):
    def test_typescript(self):
        spec = forge.normalize_spec(json.loads(EXAMPLE.read_text()))
        files = forge.render_typescript(spec)
        src = files["src/index.ts"]
        self.assertEqual(src.count("server.registerTool("), 3)
        self.assertIn('"latitude": z.number().describe(', src)
        self.assertIn("z.number().int().optional()", src)
        self.assertIn("TODO(mcp-forge): implement clothing_advice", src)
        self.assertNotIn("console.log", src)
        pkg = json.loads(files["package.json"])
        self.assertIn("@modelcontextprotocol/sdk", pkg["dependencies"])

    def test_python_compiles(self):
        for raw in (json.loads(EXAMPLE.read_text()),
                    forge.openapi_to_spec(json.loads((FIXTURES / "petstore.json").read_text()), None, "python", None, 40)):
            spec = forge.normalize_spec({**raw, "language": "python"})
            src = forge.render_python(spec)["server.py"]
            compile(src, "server.py", "exec")
            self.assertIn("from mcp.server.mcpserver import MCPServer", src)
            self.assertNotIn("print(", src.replace("never print()", ""))

    def test_auth_rendering(self):
        spec = forge.normalize_spec(minimal(auth={"type": "query", "name": "key", "env": "DEMO_KEY"}))
        self.assertIn('query.append("key", API_KEY)', forge.render_typescript(spec)["src/index.ts"])
        self.assertIn("query.append(('key', key))", forge.render_python({**spec, "language": "python"})["server.py"])

    def test_new_writes_project_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "srv"
            code, stdout, err = run("new", str(EXAMPLE), "--language", "python", "--out", str(out))
            self.assertEqual(code, 0, err)
            for f in ("server.py", "pyproject.toml", "README.md", "mcp-forge.spec.json", ".gitignore"):
                self.assertTrue((out / f).exists(), f)
            self.assertIn("TODO:", stdout)
            code, _, err = run("new", str(EXAMPLE), "--out", str(out))
            self.assertEqual(code, 2)
            self.assertIn("not empty", err)
            code, _, err = run("new", "--openapi", str(FIXTURES / "petstore.json"), "--out", str(out), "--force",
                               "--emit-spec", str(Path(tmp) / "derived.json"))
            self.assertEqual(code, 0, err)
            self.assertTrue((out / "src" / "index.ts").exists())
            self.assertEqual(json.loads((Path(tmp) / "derived.json").read_text())["name"], "pet-store")


class SmokeTests(unittest.TestCase):
    def test_pass_and_call(self):
        code, out, _ = run("smoke", "--call", "echo", "--args", '{"text":"oi"}', "--", *FAKE)
        self.assertEqual(code, 0, out)
        self.assertIn("fake 9.9.9", out)
        self.assertIn("tools/call echo — oi", out)

    def test_json_report(self):
        code, out, _ = run("smoke", "--json", "--", *FAKE)
        report = json.loads(out)
        self.assertTrue(report["ok"])
        self.assertEqual(report["tools"], ["echo"])

    def test_detects_stdout_pollution(self):
        code, out, _ = run("smoke", "--", *FAKE, "pollute")
        self.assertEqual(code, 1)
        self.assertIn("non-JSON to stdout", out)

    def test_detects_crash(self):
        code, out, _ = run("smoke", "--timeout", "5", "--", *FAKE, "crash")
        self.assertEqual(code, 1)
        self.assertIn("exited with code 3", out)

    def test_detects_bad_schema(self):
        code, out, _ = run("smoke", "--", *FAKE, "badschema")
        self.assertEqual(code, 1)
        self.assertIn("inputSchema.type must be 'object'", out)

    def test_tool_error_handling(self):
        code, _, _ = run("smoke", "--call", "echo", "--args", '{"fail":1}', "--", *FAKE)
        self.assertEqual(code, 1)
        code, _, _ = run("smoke", "--call", "echo", "--args", '{"fail":1}', "--expect-error", "--", *FAKE)
        self.assertEqual(code, 0)

    def test_missing_binary(self):
        code, _, err = run("smoke", "--", "definitely-not-a-real-binary-xyz")
        self.assertEqual(code, 2)
        self.assertIn("cannot start", err)


class RegisterTests(unittest.TestCase):
    def test_print_all_clients(self):
        code, out, _ = run("register", "--name", "demo", "--", "node", "/srv/dist/index.js")
        self.assertEqual(code, 0)
        for client in ("claude-code", "claude-desktop", "codex", "gemini-cli", "cursor", "vscode-copilot", "windsurf"):
            self.assertIn(f"## {client}", out)
        self.assertIn("claude mcp add demo --scope user -- node /srv/dist/index.js", out)
        self.assertIn("[mcp_servers.demo]", out)

    def test_write_merges(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / ".mcp.json").write_text(json.dumps({"mcpServers": {"other": {"command": "x"}}}))
            code, out, _ = run("register", "--name", "demo", "--write", "--root", tmp, "--env", "K=V",
                               "--", "node", "a.js")
            self.assertEqual(code, 0, out)
            data = json.loads((Path(tmp) / ".mcp.json").read_text())
            self.assertEqual(set(data["mcpServers"]), {"other", "demo"})
            self.assertEqual(data["mcpServers"]["demo"], {"command": "node", "args": ["a.js"], "env": {"K": "V"}})
            vscode = json.loads((Path(tmp) / ".vscode" / "mcp.json").read_text())
            self.assertEqual(vscode["servers"]["demo"]["type"], "stdio")
            for f in (".cursor/mcp.json", ".gemini/settings.json"):
                self.assertTrue((Path(tmp) / f).exists(), f)

    def test_rejects_bad_name(self):
        code, _, _ = run("register", "--name", "bad name", "--", "node")
        self.assertEqual(code, 2)


@unittest.skipUnless(os.environ.get("MCP_FORGE_E2E") == "1", "set MCP_FORGE_E2E=1 for end-to-end builds")
class EndToEndTests(unittest.TestCase):
    """Generate, install, build and smoke-test real servers. Offline: only the custom tool is called."""

    def _smoke(self, cmd: list[str]) -> None:
        code, out, _ = run("smoke", "--timeout", "120", "--call", "clothing_advice", "--args",
                           '{"temperature_c": 21}', "--expect-error", "--", *cmd)
        self.assertEqual(code, 0, out)
        self.assertIn("3 tools", out)

    @unittest.skipUnless(shutil.which("npm"), "npm not installed")
    def test_typescript_server(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "ts"
            self.assertEqual(run("new", str(EXAMPLE), "--out", str(out))[0], 0)
            subprocess.run(["npm", "install", "--no-audit", "--no-fund", "--silent"], cwd=out, check=True)
            subprocess.run(["npm", "run", "build", "--silent"], cwd=out, check=True)
            self._smoke(["node", str(out / "dist" / "index.js")])

    @unittest.skipUnless(shutil.which("uv"), "uv not installed")
    def test_python_server(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "py"
            self.assertEqual(run("new", str(EXAMPLE), "--language", "python", "--out", str(out))[0], 0)
            subprocess.run(["uv", "sync", "--quiet"], cwd=out, check=True)
            self._smoke(["uv", "run", "--directory", str(out), "server.py"])


if __name__ == "__main__":
    unittest.main()
