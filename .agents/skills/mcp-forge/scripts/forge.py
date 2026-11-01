#!/usr/bin/env python3
"""mcp-forge: generate, test and register MCP servers. Standard library only.

Subcommands
  new       spec.json | --openapi file  ->  a working MCP server project (TypeScript or Python)
  smoke     start any stdio MCP server and check the protocol for real
  register  print or write the config for Claude Code, Codex, Gemini CLI, Cursor, VS Code ...
  validate  check a spec without generating anything

Run `forge.py <subcommand> --help` for the options.
"""
from __future__ import annotations

import argparse
import json
import keyword
import os
import re
import shlex
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any

VERSION = "1.0.0"
PROTOCOL_VERSION = "2025-06-18"
LOCATIONS = ("query", "path", "body", "header")
JSON_TYPES = ("string", "number", "integer", "boolean", "array", "object")
NAME_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


class SpecError(Exception):
    pass


# --------------------------------------------------------------------------- helpers

def snake(text: str) -> str:
    text = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", text)
    text = re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_").lower()
    text = re.sub(r"_+", "_", text)
    if not text:
        text = "x"
    if text[0].isdigit():
        text = "n_" + text
    return text


def py_ident(name: str) -> str:
    ident = snake(name)
    if keyword.iskeyword(ident) or ident in {"self", "ctx"}:
        ident += "_"
    return ident


def env_prefix(name: str) -> str:
    return snake(name).upper()


def js(value: Any) -> str:
    """JSON literal, safe to paste into TypeScript or Python source."""
    return json.dumps(value, ensure_ascii=False)


# --------------------------------------------------------------------------- spec

def normalize_spec(raw: dict[str, Any]) -> dict[str, Any]:
    """Validate a spec and fill defaults. Raises SpecError with every problem found."""
    errors: list[str] = []
    if not isinstance(raw, dict):
        raise SpecError("the spec must be a JSON object")

    name = raw.get("name")
    if not isinstance(name, str) or not re.match(r"^[a-z][a-z0-9-]{0,63}$", name):
        errors.append("name: required, lowercase letters, digits and '-' (e.g. 'weather')")
        name = "server"
    language = raw.get("language", "typescript")
    if language in ("ts", "node"):
        language = "typescript"
    if language in ("py",):
        language = "python"
    if language not in ("typescript", "python"):
        errors.append("language: 'typescript' or 'python'")

    base_url = raw.get("base_url", "")
    if base_url and not re.match(r"^https?://", base_url):
        errors.append("base_url: must start with http:// or https://")
    base_url = base_url.rstrip("/")

    auth = raw.get("auth") or {"type": "none"}
    if auth.get("type") not in ("none", "bearer", "header", "query"):
        errors.append("auth.type: none | bearer | header | query")
    if auth.get("type") in ("bearer", "header", "query"):
        auth.setdefault("env", env_prefix(name or "server") + "_API_KEY")
        if auth["type"] in ("header", "query") and not auth.get("name"):
            errors.append("auth.name: required for header/query auth (e.g. 'X-API-Key')")

    tools_in = raw.get("tools")
    if not isinstance(tools_in, list) or not tools_in:
        errors.append("tools: a non-empty list is required")
        tools_in = []

    tools: list[dict[str, Any]] = []
    seen: set[str] = set()
    for i, t in enumerate(tools_in):
        where = f"tools[{i}]"
        if not isinstance(t, dict):
            errors.append(f"{where}: must be an object")
            continue
        tname = t.get("name", "")
        if not isinstance(tname, str) or not NAME_RE.match(tname):
            errors.append(f"{where}.name: snake_case, starts with a letter, max 64 chars (got {tname!r})")
        elif tname in seen:
            errors.append(f"{where}.name: duplicate '{tname}'")
        seen.add(str(tname))
        where = f"tool '{tname}'"
        desc = t.get("description", "")
        if not isinstance(desc, str) or len(desc.strip()) < 20:
            errors.append(f"{where}: description must say what it does and when to use it (>= 20 chars)")

        method = t.get("method")
        path = t.get("path")
        kind = "http" if (method or path) else "custom"
        if kind == "http":
            method = (method or "GET").upper()
            if method not in ("GET", "POST", "PUT", "PATCH", "DELETE"):
                errors.append(f"{where}.method: GET | POST | PUT | PATCH | DELETE")
            if not isinstance(path, str) or not (path.startswith("/") or re.match(r"^https?://", path)):
                errors.append(f"{where}.path: must start with '/' (relative to base_url) or be a full URL")
                path = "/"
            if path.startswith("/") and not base_url:
                errors.append(f"{where}: relative path needs a top-level base_url")

        params_in = t.get("params") or {}
        if not isinstance(params_in, dict):
            errors.append(f"{where}.params: must be an object of name -> schema")
            params_in = {}
        params: list[dict[str, Any]] = []
        idents: set[str] = set()
        for pname, p in params_in.items():
            pw = f"{where} param '{pname}'"
            if not isinstance(p, dict):
                errors.append(f"{pw}: must be an object")
                continue
            ptype = p.get("type", "string")
            if ptype not in JSON_TYPES:
                errors.append(f"{pw}.type: one of {', '.join(JSON_TYPES)}")
            loc = p.get("in")
            if loc is None:
                if kind == "http" and "{" + pname + "}" in (path or ""):
                    loc = "path"
                elif kind == "http" and method in ("POST", "PUT", "PATCH"):
                    loc = "body"
                else:
                    loc = "query"
            if loc not in LOCATIONS:
                errors.append(f"{pw}.in: one of {', '.join(LOCATIONS)}")
            required = bool(p.get("required", loc == "path"))
            if loc == "path" and not required:
                errors.append(f"{pw}: path params must be required")
            ident = py_ident(pname)
            while ident in idents:
                ident += "_"
            idents.add(ident)
            enum = p.get("enum")
            if enum is not None and (not isinstance(enum, list) or not enum):
                errors.append(f"{pw}.enum: non-empty list")
                enum = None
            params.append({
                "name": pname, "ident": ident, "type": ptype, "in": loc, "required": required,
                "description": str(p.get("description", "")).strip(), "enum": enum,
                "items": (p.get("items") or {}).get("type") if isinstance(p.get("items"), dict) else None,
                "default": p.get("default"),
            })
        if kind == "http":
            for placeholder in re.findall(r"{([^}]+)}", path or ""):
                if not any(pp["name"] == placeholder and pp["in"] == "path" for pp in params):
                    errors.append(f"{where}: path placeholder '{{{placeholder}}}' has no matching 'in: path' param")

        read_only = t.get("read_only", kind == "http" and method == "GET")
        tools.append({
            "name": tname, "title": t.get("title") or str(tname).replace("_", " ").capitalize(),
            "description": str(desc).strip(), "kind": kind, "method": method, "path": path,
            "params": params, "read_only": bool(read_only),
            "destructive": bool(t.get("destructive", kind == "http" and method == "DELETE")),
            "idempotent": bool(t.get("idempotent", kind == "http" and method in ("GET", "PUT", "DELETE"))),
        })

    if errors:
        raise SpecError("invalid spec:\n  - " + "\n  - ".join(errors))
    return {
        "name": name, "description": str(raw.get("description", "")).strip(),
        "version": str(raw.get("version", "0.1.0")), "language": language,
        "base_url": base_url, "auth": auth, "tools": tools,
        "env_prefix": env_prefix(name),
    }


# --------------------------------------------------------------------------- OpenAPI -> spec

def _resolve(doc: dict, node: Any, depth: int = 0) -> Any:
    if depth > 20 or not isinstance(node, dict):
        return node
    ref = node.get("$ref")
    if isinstance(ref, str) and ref.startswith("#/"):
        target: Any = doc
        for part in ref[2:].split("/"):
            target = target.get(part.replace("~1", "/").replace("~0", "~"), {}) if isinstance(target, dict) else {}
        return _resolve(doc, target, depth + 1)
    return node


def _schema_param(doc: dict, schema: dict, description: str = "") -> dict[str, Any]:
    schema = _resolve(doc, schema or {})
    for combo in ("allOf", "oneOf", "anyOf"):
        if combo in schema and isinstance(schema[combo], list) and schema[combo]:
            schema = {**_resolve(doc, schema[combo][0]), **{k: v for k, v in schema.items() if k != combo}}
    ptype = schema.get("type", "string")
    if isinstance(ptype, list):
        ptype = next((x for x in ptype if x != "null"), "string")
    if ptype not in JSON_TYPES:
        ptype = "string"
    out: dict[str, Any] = {"type": ptype}
    desc = description or schema.get("description", "")
    if desc:
        out["description"] = " ".join(str(desc).split())[:500]
    if isinstance(schema.get("enum"), list) and all(isinstance(e, (str, int, float)) for e in schema["enum"]):
        out["enum"] = schema["enum"]
    if ptype == "array":
        items = _resolve(doc, schema.get("items") or {})
        if items.get("type") in JSON_TYPES:
            out["items"] = {"type": items["type"]}
    return out


def openapi_to_spec(doc: dict[str, Any], name: str | None, language: str,
                    include: str | None, max_tools: int) -> dict[str, Any]:
    if "openapi" not in doc and "swagger" not in doc:
        raise SpecError("not an OpenAPI document (no 'openapi' or 'swagger' key)")
    info = doc.get("info", {})
    base_url = ""
    if doc.get("servers"):
        base_url = str(doc["servers"][0].get("url", ""))
        for var, val in (doc["servers"][0].get("variables") or {}).items():
            base_url = base_url.replace("{" + var + "}", str(val.get("default", "")))
    elif doc.get("host"):
        scheme = (doc.get("schemes") or ["https"])[0]
        base_url = f"{scheme}://{doc['host']}{doc.get('basePath', '')}"

    auth: dict[str, Any] = {"type": "none"}
    schemes = (doc.get("components") or {}).get("securitySchemes") or doc.get("securityDefinitions") or {}
    for sch in schemes.values():
        sch = _resolve(doc, sch)
        if sch.get("type") == "http" and sch.get("scheme", "").lower() == "bearer":
            auth = {"type": "bearer"}
            break
        if sch.get("type") == "apiKey" and sch.get("in") in ("header", "query"):
            auth = {"type": sch["in"], "name": sch.get("name", "X-API-Key")}
            break
        if sch.get("type") == "oauth2":
            auth = {"type": "bearer"}

    server_name = name or snake(info.get("title", "api")).replace("_", "-")[:40].strip("-") or "api"
    pattern = re.compile(include) if include else None
    tools: list[dict[str, Any]] = []
    used: set[str] = set()
    for path, item in (doc.get("paths") or {}).items():
        item = _resolve(doc, item)
        shared = item.get("parameters", [])
        for method in ("get", "post", "put", "patch", "delete"):
            op = item.get(method)
            if not isinstance(op, dict) or op.get("deprecated"):
                continue
            tname = snake(op.get("operationId") or f"{method}_{path}")[:64]
            base, n = tname, 2
            while tname in used:
                tname = f"{base[:60]}_{n}"
                n += 1
            if pattern and not (pattern.search(tname) or pattern.search(path)):
                continue
            used.add(tname)
            desc = " ".join(str(op.get("summary") or "").split())
            long = " ".join(str(op.get("description") or "").split())
            if long and long != desc:
                desc = f"{desc}. {long}" if desc else long
            if len(desc) < 20:
                desc = (desc + f" ({method.upper()} {path})").strip()
            desc = desc[:1000]

            params: dict[str, Any] = {}
            for p in list(shared) + list(op.get("parameters", [])):
                p = _resolve(doc, p)
                if p.get("in") not in ("query", "path", "header") or not p.get("name"):
                    continue
                if auth.get("type") in ("header", "query") and p["name"] == auth.get("name"):
                    continue
                entry = _schema_param(doc, p.get("schema") or {"type": p.get("type", "string")},
                                      p.get("description", ""))
                entry["in"] = p["in"]
                if p.get("required") or p["in"] == "path":
                    entry["required"] = True
                params[p["name"]] = entry
            body = _resolve(doc, op.get("requestBody") or {})
            content = (body.get("content") or {}).get("application/json")
            if content:
                schema = _resolve(doc, content.get("schema") or {})
                required = set(schema.get("required") or [])
                props = schema.get("properties") or {}
                if props:
                    for pname, pschema in props.items():
                        key = pname if pname not in params else f"body_{pname}"
                        entry = _schema_param(doc, pschema)
                        entry["in"] = "body"
                        if pname in required:
                            entry["required"] = True
                        params[key] = entry
                else:
                    params["body"] = {"type": "object", "in": "body", "required": bool(body.get("required")),
                                      "description": "JSON request body"}
            tools.append({"name": tname, "description": desc, "method": method.upper(), "path": path,
                          "params": params})
            if len(tools) >= max_tools:
                break
        if len(tools) >= max_tools:
            break
    if not tools:
        raise SpecError("no operations matched (check --include)")
    return {"name": server_name, "description": " ".join(str(info.get("description", "")).split())[:300],
            "version": "0.1.0", "language": language, "base_url": base_url, "auth": auth, "tools": tools}


# --------------------------------------------------------------------------- TypeScript generator

def _zod(p: dict[str, Any]) -> str:
    t = p["type"]
    if p["enum"] and all(isinstance(e, str) for e in p["enum"]):
        expr = "z.enum([" + ", ".join(js(e) for e in p["enum"]) + "])"
    elif t == "string":
        expr = "z.string()"
    elif t == "integer":
        expr = "z.number().int()"
    elif t == "number":
        expr = "z.number()"
    elif t == "boolean":
        expr = "z.boolean()"
    elif t == "array":
        inner = {"string": "z.string()", "integer": "z.number().int()", "number": "z.number()",
                 "boolean": "z.boolean()"}.get(p["items"] or "", "z.unknown()")
        expr = f"z.array({inner})"
    elif t == "object":
        expr = "z.record(z.string(), z.unknown())"
    else:
        expr = "z.unknown()"
    if not p["required"]:
        expr += ".optional()"
    if p["description"]:
        expr += f".describe({js(p['description'])})"
    return expr


def render_typescript(spec: dict[str, Any]) -> dict[str, str]:
    name, prefix = spec["name"], spec["env_prefix"]
    has_http = any(t["kind"] == "http" for t in spec["tools"])
    lines: list[str] = [
        "#!/usr/bin/env node",
        f"// {name} MCP server. Generated by mcp-forge {VERSION}; edit freely.",
        "// stdout belongs to the MCP protocol: log with console.error only.",
        'import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";',
        'import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";',
        'import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";',
        'import { z } from "zod";',
        "",
        f"const server = new McpServer({{ name: {js(name)}, version: {js(spec['version'])} }});",
        "",
        "const MAX_CHARS = 100_000;",
        "const ok = (text: string): CallToolResult => ({",
        "  content: [{ type: \"text\", text: text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + \"\\n…[truncated]\" : text }],",
        "});",
        "const fail = (text: string): CallToolResult => ({ content: [{ type: \"text\", text }], isError: true });",
        "",
    ]
    if has_http:
        auth = spec["auth"]
        lines += [
            f"const BASE_URL = (process.env.{prefix}_BASE_URL ?? {js(spec['base_url'])}).replace(/\\/$/, \"\");",
            f"const TIMEOUT_MS = Number(process.env.{prefix}_TIMEOUT_MS ?? 30_000);",
        ]
        if auth["type"] != "none":
            lines.append(f"const API_KEY = process.env.{auth['env']};")
        lines += [
            "",
            'type Loc = "query" | "path" | "body" | "header";',
            "",
            "async function callApi(",
            "  method: string,",
            "  path: string,",
            "  args: Record<string, unknown>,",
            "  locs: Record<string, [Loc, string]>,",
            "): Promise<CallToolResult> {",
            "  const headers: Record<string, string> = { accept: \"application/json\" };",
            "  const body: Record<string, unknown> = {};",
            "  let urlPath = path;",
            "  const query = new URLSearchParams();",
            "  for (const [key, value] of Object.entries(args)) {",
            "    if (value === undefined || value === null) continue;",
            "    const [loc, wire] = locs[key] ?? [\"query\", key];",
            "    const text = typeof value === \"object\" ? JSON.stringify(value) : String(value);",
            "    if (loc === \"path\") urlPath = urlPath.replace(`{${wire}}`, encodeURIComponent(text));",
            "    else if (loc === \"header\") headers[wire] = text;",
            "    else if (loc === \"body\") {",
            "      if (wire === \"body\" && typeof value === \"object\" && !Array.isArray(value)) Object.assign(body, value);",
            "      else body[wire] = value;",
            "    } else if (Array.isArray(value)) value.forEach((v) => query.append(wire, String(v)));",
            "    else query.append(wire, text);",
            "  }",
        ]
        if auth["type"] != "none":
            lines += [
                f"  if (!API_KEY) return fail(\"Missing credential: set the {auth['env']} environment variable.\");",
            ]
            if auth["type"] == "bearer":
                lines.append("  headers.authorization = `Bearer ${API_KEY}`;")
            elif auth["type"] == "header":
                lines.append(f"  headers[{js(auth['name'])}] = API_KEY;")
            else:
                lines.append(f"  query.append({js(auth['name'])}, API_KEY);")
        lines += [
            "  const base = /^https?:\\/\\//.test(urlPath) ? urlPath : BASE_URL + urlPath;",
            "  const url = query.size ? `${base}${base.includes(\"?\") ? \"&\" : \"?\"}${query}` : base;",
            "  const init: RequestInit = { method, headers, signal: AbortSignal.timeout(TIMEOUT_MS) };",
            "  if (Object.keys(body).length) {",
            "    headers[\"content-type\"] = \"application/json\";",
            "    init.body = JSON.stringify(body);",
            "  }",
            "  try {",
            "    const res = await fetch(url, init);",
            "    const text = await res.text();",
            "    if (!res.ok) return fail(`HTTP ${res.status} ${res.statusText} from ${method} ${urlPath}\\n${text.slice(0, 4000)}`);",
            "    return ok(text || `HTTP ${res.status}`);",
            "  } catch (err) {",
            "    return fail(`Request failed: ${err instanceof Error ? err.message : String(err)}`);",
            "  }",
            "}",
            "",
        ]
    for t in spec["tools"]:
        shape = ", ".join(f"{js(p['ident'])}: {_zod(p)}" for p in t["params"])
        ann = (f"{{ readOnlyHint: {str(t['read_only']).lower()}, destructiveHint: {str(t['destructive']).lower()}, "
               f"idempotentHint: {str(t['idempotent']).lower()}, openWorldHint: {str(t['kind'] == 'http').lower()} }}")
        lines += [
            "server.registerTool(",
            f"  {js(t['name'])},",
            "  {",
            f"    title: {js(t['title'])},",
            f"    description: {js(t['description'])},",
            f"    inputSchema: {{ {shape} }},",
            f"    annotations: {ann},",
            "  },",
        ]
        if t["kind"] == "http":
            locs = ", ".join(f"{js(p['ident'])}: [{js(p['in'])}, {js(p['name'])}]" for p in t["params"])
            lines += [
                f"  async (args) => callApi({js(t['method'])}, {js(t['path'])}, args, {{ {locs} }}),",
                ");",
                "",
            ]
        else:
            lines += [
                "  async (args) => {",
                f"    // TODO(mcp-forge): implement {t['name']}. Return ok(text) on success, fail(text) on error.",
                f"    return fail(\"{t['name']} is not implemented yet. Received: \" + JSON.stringify(args));",
                "  },",
                ");",
                "",
            ]
    lines += [
        "async function main() {",
        "  await server.connect(new StdioServerTransport());",
        f"  console.error({js(name + ' MCP server running on stdio')});",
        "}",
        "",
        "main().catch((err) => {",
        "  console.error(err);",
        "  process.exit(1);",
        "});",
        "",
    ]
    pkg = {
        "name": f"{name}-mcp", "version": spec["version"], "description": spec["description"] or f"{name} MCP server",
        "type": "module", "bin": {f"{name}-mcp": "dist/index.js"}, "files": ["dist"],
        "scripts": {"build": "tsc", "start": "node dist/index.js", "dev": "tsc --watch",
                    "inspect": "npx @modelcontextprotocol/inspector node dist/index.js"},
        "dependencies": {"@modelcontextprotocol/sdk": "^1.32.0", "zod": "^4.0.0"},
        "devDependencies": {"@types/node": "^22.0.0", "typescript": "^5.6.0"},
        "engines": {"node": ">=20"},
    }
    tsconfig = {"compilerOptions": {"target": "ES2022", "module": "Node16", "moduleResolution": "Node16",
                                    "outDir": "dist", "rootDir": "src", "strict": True, "esModuleInterop": True,
                                    "skipLibCheck": True, "declaration": False}, "include": ["src"]}
    return {
        "src/index.ts": "\n".join(lines),
        "package.json": json.dumps(pkg, indent=2) + "\n",
        "tsconfig.json": json.dumps(tsconfig, indent=2) + "\n",
        ".gitignore": "node_modules/\ndist/\n.env\n",
    }


# --------------------------------------------------------------------------- Python generator

def _pytype(p: dict[str, Any]) -> str:
    t = p["type"]
    if p["enum"] and all(isinstance(e, (str, int)) and not isinstance(e, bool) for e in p["enum"]):
        base = "Literal[" + ", ".join(repr(e) for e in p["enum"]) + "]"
    else:
        base = {"string": "str", "integer": "int", "number": "float", "boolean": "bool",
                "object": "dict[str, Any]"}.get(t, "Any")
        if t == "array":
            inner = {"string": "str", "integer": "int", "number": "float", "boolean": "bool"}.get(p["items"] or "", "Any")
            base = f"list[{inner}]"
    if not p["required"]:
        base += " | None"
    return base


def render_python(spec: dict[str, Any]) -> dict[str, str]:
    name, prefix = spec["name"], spec["env_prefix"]
    has_http = any(t["kind"] == "http" for t in spec["tools"])
    auth = spec["auth"]
    lines = [
        f'"""{name} MCP server. Generated by mcp-forge {VERSION}; edit freely.',
        "",
        "stdout belongs to the MCP protocol: log to stderr (logging does by default), never print().",
        "Requires the official SDK v2 (`mcp>=2`), where FastMCP is called MCPServer.",
        '"""',
        "from __future__ import annotations",
        "",
        "import asyncio",
        "import json",
        "import os",
        "import urllib.error",
        "import urllib.parse",
        "import urllib.request",
        "from typing import Annotated, Any, Literal",
        "",
        "from mcp.server.mcpserver import MCPServer",
        "from mcp.server.mcpserver.exceptions import ToolError",
        "from mcp.types import ToolAnnotations",
        "from pydantic import Field",
        "",
        f"mcp = MCPServer({name!r}, version={spec['version']!r})",
        "MAX_CHARS = 100_000",
        "",
    ]
    if has_http:
        lines += [
            f"BASE_URL = os.environ.get({prefix + '_BASE_URL'!r}, {spec['base_url']!r}).rstrip('/')",
            f"TIMEOUT = float(os.environ.get({prefix + '_TIMEOUT_MS'!r}, '30000')) / 1000",
            "",
            "",
            "def _request(method: str, path: str, args: dict[str, tuple[str, str, Any]]) -> str:",
            '    headers = {"accept": "application/json", "user-agent": "' + name + '-mcp"}',
            "    query: list[tuple[str, str]] = []",
            "    body: dict[str, Any] = {}",
            "    for loc, wire, value in args.values():",
            "        if value is None:",
            "            continue",
            "        text = json.dumps(value) if isinstance(value, (dict, list)) else str(value)",
            "        if isinstance(value, bool):",
            '            text = "true" if value else "false"',
            '        if loc == "path":',
            '            path = path.replace("{" + wire + "}", urllib.parse.quote(text, safe=""))',
            '        elif loc == "header":',
            "            headers[wire] = text",
            '        elif loc == "body":',
            '            if wire == "body" and isinstance(value, dict):',
            "                body.update(value)",
            "            else:",
            "                body[wire] = value",
            "        elif isinstance(value, list):",
            "            query.extend((wire, str(v)) for v in value)",
            "        else:",
            "            query.append((wire, text))",
        ]
        if auth["type"] != "none":
            lines += [
                f"    key = os.environ.get({auth['env']!r})",
                "    if not key:",
                f"        raise ToolError('Missing credential: set the {auth['env']} environment variable.')",
            ]
            if auth["type"] == "bearer":
                lines.append('    headers["authorization"] = f"Bearer {key}"')
            elif auth["type"] == "header":
                lines.append(f"    headers[{auth['name']!r}] = key")
            else:
                lines.append(f"    query.append(({auth['name']!r}, key))")
        lines += [
            '    url = path if path.startswith(("http://", "https://")) else BASE_URL + path',
            "    if query:",
            '        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(query)',
            "    data = None",
            "    if body:",
            '        headers["content-type"] = "application/json"',
            "        data = json.dumps(body).encode()",
            "    req = urllib.request.Request(url, data=data, headers=headers, method=method)",
            "    try:",
            "        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:",
            '            text = res.read().decode("utf-8", "replace")',
            "    except urllib.error.HTTPError as err:",
            '        detail = err.read().decode("utf-8", "replace")[:4000]',
            '        raise ToolError(f"HTTP {err.code} {err.reason} from {method} {path}\\n{detail}") from None',
            "    except (urllib.error.URLError, TimeoutError) as err:",
            '        raise ToolError(f"Request failed: {err}") from None',
            '    return text[:MAX_CHARS] + ("\\n…[truncated]" if len(text) > MAX_CHARS else "") if text else "OK"',
            "",
            "",
            "async def _call(method: str, path: str, args: dict[str, tuple[str, str, Any]]) -> str:",
            "    return await asyncio.to_thread(_request, method, path, args)",
            "",
        ]
    for t in spec["tools"]:
        params = sorted(t["params"], key=lambda p: not p["required"])
        sig = []
        for p in params:
            field = f"Field(description={p['description']!r})" if p["description"] else "Field()"
            item = f"    {p['ident']}: Annotated[{_pytype(p)}, {field}]"
            if not p["required"]:
                item += " = None"
            sig.append(item + ",")
        ann = (f"ToolAnnotations(title={t['title']!r}, readOnlyHint={t['read_only']}, "
               f"destructiveHint={t['destructive']}, idempotentHint={t['idempotent']}, "
               f"openWorldHint={t['kind'] == 'http'})")
        lines += ["", f"@mcp.tool(name={t['name']!r}, description={t['description']!r}, annotations={ann})"]
        lines.append(f"async def {py_ident(t['name'])}(" + ("" if sig else ")") + (" -> str:" if not sig else ""))
        if sig:
            lines += sig
            lines.append(") -> str:")
        if t["kind"] == "http":
            mapping = ", ".join(f"{p['ident']!r}: ({p['in']!r}, {p['name']!r}, {p['ident']})" for p in t["params"])
            lines.append(f"    return await _call({t['method']!r}, {t['path']!r}, {{{mapping}}})")
        else:
            args = ", ".join(f"{p['ident']!r}: {p['ident']}" for p in t["params"])
            lines += [
                f"    # TODO(mcp-forge): implement {t['name']}. Return text; raise ToolError on failure.",
                f"    raise ToolError({t['name'] + ' is not implemented yet. Received: '!r} + json.dumps({{{args}}}))",
            ]
    lines += [
        "",
        "",
        "def main() -> None:",
        "    mcp.run()",
        "",
        "",
        'if __name__ == "__main__":',
        "    main()",
        "",
    ]
    pyproject = "\n".join([
        "[project]",
        f'name = "{name}-mcp"',
        f'version = "{spec["version"]}"',
        f'description = {js(spec["description"] or name + " MCP server")}',
        'requires-python = ">=3.10"',
        'dependencies = ["mcp>=2,<3"]',
        "",
        "[project.scripts]",
        f'{name}-mcp = "server:main"',
        "",
        "[build-system]",
        'requires = ["hatchling"]',
        'build-backend = "hatchling.build"',
        "",
        "[tool.hatch.build.targets.wheel]",
        'only-include = ["server.py"]',
        "",
    ])
    return {"server.py": "\n".join(lines), "pyproject.toml": pyproject,
            ".gitignore": ".venv/\n__pycache__/\n.env\n"}


# --------------------------------------------------------------------------- README

def render_readme(spec: dict[str, Any], run_cmd: list[str], build: str) -> str:
    env_lines = [f"| `{spec['env_prefix']}_BASE_URL` | override the API base URL (default `{spec['base_url'] or '—'}`) |",
                 f"| `{spec['env_prefix']}_TIMEOUT_MS` | request timeout, default 30000 |"]
    if spec["auth"]["type"] != "none":
        env_lines.insert(0, f"| `{spec['auth']['env']}` | **required** credential ({spec['auth']['type']}) |")
    tools = "\n".join(
        f"| `{t['name']}` | {t['description'].replace('|', '/')} |" + (" ⚠️ TODO" if t["kind"] == "custom" else "")
        for t in spec["tools"])
    cmd = " ".join(shlex.quote(c) for c in run_cmd)
    return f"""# {spec['name']} MCP server

{spec['description'] or 'MCP server generated by mcp-forge.'}

## Tools

| Tool | What it does |
|---|---|
{tools}

## Run

```bash
{build}
{cmd}
```

## Configuration

| Variable | Meaning |
|---|---|
{chr(10).join(env_lines)}

## Use it in your AI client

```bash
python3 path/to/mcp-forge/scripts/forge.py register --name {spec['name']} -- {cmd}
```

prints the setup for Claude Code, Claude Desktop, Codex, Gemini CLI, Cursor, VS Code/Copilot and Windsurf.
Add `--write` to write the project-level config files.

## Test

```bash
python3 path/to/mcp-forge/scripts/forge.py smoke -- {cmd}
```
"""


def cmd_new(a: argparse.Namespace) -> int:
    try:
        if a.openapi:
            text = Path(a.openapi).read_text(encoding="utf-8")
            try:
                doc = json.loads(text)
            except json.JSONDecodeError:
                try:
                    import yaml  # type: ignore
                except ImportError:
                    raise SpecError("YAML OpenAPI needs PyYAML (pip install pyyaml) or convert it to JSON") from None
                doc = yaml.safe_load(text)
            raw = openapi_to_spec(doc, a.name, a.language or "typescript", a.include, a.max_tools)
            if a.emit_spec:
                Path(a.emit_spec).write_text(json.dumps(raw, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        else:
            if not a.spec:
                raise SpecError("give a spec file or --openapi")
            raw = json.loads(Path(a.spec).read_text(encoding="utf-8"))
            if a.language:
                raw["language"] = a.language
            if a.name:
                raw["name"] = a.name
        spec = normalize_spec(raw)
    except (SpecError, OSError, json.JSONDecodeError) as err:
        print(f"error: {err}", file=sys.stderr)
        return 2

    out = Path(a.out or f"{spec['name']}-mcp").resolve()
    if out.exists() and any(out.iterdir()) and not a.force:
        print(f"error: {out} is not empty (use --force to overwrite generated files)", file=sys.stderr)
        return 2
    if spec["language"] == "typescript":
        files = render_typescript(spec)
        run_cmd = ["node", str(out / "dist" / "index.js")]
        build = f"cd {shlex.quote(str(out))} && npm install && npm run build"
    else:
        files = render_python(spec)
        run_cmd = ["uv", "run", "--directory", str(out), "server.py"]
        build = f"cd {shlex.quote(str(out))} && uv sync   # or: pip install 'mcp>=2,<3'"
    files["README.md"] = render_readme(spec, run_cmd, build)
    files["mcp-forge.spec.json"] = json.dumps(raw, indent=2, ensure_ascii=False) + "\n"
    for rel, content in files.items():
        dest = out / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(content, encoding="utf-8")
    todo = [t["name"] for t in spec["tools"] if t["kind"] == "custom"]
    print(f"created {out} ({spec['language']}, {len(spec['tools'])} tools)")
    print(f"next:   {build}")
    print(f"test:   python3 {Path(__file__).resolve()} smoke -- {' '.join(shlex.quote(c) for c in run_cmd)}")
    if todo:
        print(f"TODO:   implement {', '.join(todo)} (search for TODO(mcp-forge))")
    return 0


def cmd_validate(a: argparse.Namespace) -> int:
    try:
        spec = normalize_spec(json.loads(Path(a.spec).read_text(encoding="utf-8")))
    except (SpecError, OSError, json.JSONDecodeError) as err:
        print(f"error: {err}", file=sys.stderr)
        return 2
    print(f"ok: {spec['name']} ({spec['language']}), {len(spec['tools'])} tools")
    return 0


# --------------------------------------------------------------------------- smoke test

class StdioClient:
    def __init__(self, argv: list[str], env: dict[str, str] | None, timeout: float):
        self.timeout = timeout
        self.proc = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                     env={**os.environ, **(env or {})}, text=True, encoding="utf-8", bufsize=1)
        self.stderr: list[str] = []
        self.lines: list[str] = []
        self.cond = threading.Condition()
        threading.Thread(target=self._pump, args=(self.proc.stdout, self.lines), daemon=True).start()
        threading.Thread(target=self._pump, args=(self.proc.stderr, self.stderr), daemon=True).start()
        self.next_id = 0

    def _pump(self, stream, sink: list[str]) -> None:
        for line in stream:
            with self.cond:
                sink.append(line.rstrip("\n"))
                self.cond.notify_all()

    def send(self, msg: dict[str, Any]) -> None:
        assert self.proc.stdin
        self.proc.stdin.write(json.dumps(msg) + "\n")
        self.proc.stdin.flush()

    def request(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        self.next_id += 1
        rid = self.next_id
        self.send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params or {}})
        deadline = time.monotonic() + self.timeout
        with self.cond:
            while True:
                while self.lines:
                    line = self.lines.pop(0)
                    if not line.strip():
                        continue
                    try:
                        msg = json.loads(line)
                    except json.JSONDecodeError:
                        raise RuntimeError(f"server wrote non-JSON to stdout (log to stderr instead): {line[:200]!r}")
                    if msg.get("id") == rid and ("result" in msg or "error" in msg):
                        if "error" in msg:
                            raise RuntimeError(f"{method} returned error: {msg['error']}")
                        return msg["result"]
                    if "method" in msg and "id" in msg:  # server->client request (e.g. roots/list)
                        self.send({"jsonrpc": "2.0", "id": msg["id"], "error": {"code": -32601, "message": "unsupported"}})
                if self.proc.poll() is not None:
                    raise RuntimeError(f"server exited with code {self.proc.returncode} during {method}")
                left = deadline - time.monotonic()
                if left <= 0:
                    raise RuntimeError(f"timeout after {self.timeout}s waiting for {method}")
                self.cond.wait(min(left, 0.2))

    def close(self) -> None:
        try:
            if self.proc.stdin:
                self.proc.stdin.close()
            self.proc.wait(timeout=3)
        except Exception:
            self.proc.kill()


def cmd_smoke(a: argparse.Namespace) -> int:
    argv = [x for x in a.command if x != "--"] if a.command else []
    if not argv:
        print("error: pass the server command after --, e.g. smoke -- node dist/index.js", file=sys.stderr)
        return 2
    env = dict(kv.split("=", 1) for kv in a.env)
    report: dict[str, Any] = {"command": argv, "checks": []}
    problems: list[str] = []
    warnings: list[str] = []
    shown = 0  # problems[:shown] were already printed

    def check(name: str, passed: bool, detail: str = "") -> None:
        report["checks"].append({"check": name, "ok": passed, "detail": detail})
        if not a.json:
            print(f"  {'✔' if passed else '✘'} {name}" + (f" — {detail}" if detail else ""))
        if not passed:
            problems.append(name)
            nonlocal shown
            shown = len(problems)

    try:
        client = StdioClient(argv, env, a.timeout)
    except OSError as err:
        print(f"error: cannot start {argv[0]}: {err}", file=sys.stderr)
        return 2
    try:
        if not a.json:
            print(f"smoke: {' '.join(argv)}")
        init = client.request("initialize", {"protocolVersion": PROTOCOL_VERSION, "capabilities": {},
                                             "clientInfo": {"name": "mcp-forge-smoke", "version": VERSION}})
        info = init.get("serverInfo", {})
        check("initialize", True, f"{info.get('name')} {info.get('version')} protocol {init.get('protocolVersion')}")
        client.send({"jsonrpc": "2.0", "method": "notifications/initialized"})
        caps = init.get("capabilities", {})
        tools: list[dict[str, Any]] = []
        if "tools" in caps:
            cursor = None
            while True:
                res = client.request("tools/list", {"cursor": cursor} if cursor else {})
                tools += res.get("tools", [])
                cursor = res.get("nextCursor")
                if not cursor:
                    break
            check("tools/list", bool(tools), f"{len(tools)} tools")
            for t in tools:
                n = t.get("name", "?")
                if not t.get("description") or len(t["description"]) < 20:
                    warnings.append(f"tool '{n}': weak description — the model picks tools by it")
                schema = t.get("inputSchema") or {}
                if schema.get("type") != "object":
                    problems.append(f"tool '{n}': inputSchema.type must be 'object'")
                if not re.match(r"^[A-Za-z0-9_.-]{1,64}$", n):
                    warnings.append(f"tool '{n}': some clients reject names outside [A-Za-z0-9_-]{{1,64}}")
        report["tools"] = [t.get("name") for t in tools]
        if "resources" in caps:
            res = client.request("resources/list")
            check("resources/list", True, f"{len(res.get('resources', []))} resources")
        if "prompts" in caps:
            res = client.request("prompts/list")
            check("prompts/list", True, f"{len(res.get('prompts', []))} prompts")
        if not caps:
            warnings.append("server declares no capabilities")
        if a.call:
            args = json.loads(a.args or "{}")
            res = client.request("tools/call", {"name": a.call, "arguments": args})
            text = " ".join(c.get("text", "") for c in res.get("content", []) if c.get("type") == "text")
            is_err = bool(res.get("isError"))
            report["call"] = {"tool": a.call, "isError": is_err, "text": text[:2000]}
            passed = (not is_err) if not a.expect_error else is_err
            check(f"tools/call {a.call}", passed, ("error: " if is_err else "") + text[:160].replace("\n", " "))
    except (RuntimeError, json.JSONDecodeError) as err:
        problems.append(str(err))
        if not a.json:
            print(f"  ✘ {err}")
            shown = len(problems)
            if client.stderr:
                print("  server stderr (last lines):\n    " + "\n    ".join(client.stderr[-10:]))
    finally:
        client.close()
    for w in warnings:
        if not a.json:
            print(f"  ! {w}")
    if not a.json:
        for p in problems[shown:]:
            print(f"  ✘ {p}")
    report["warnings"], report["problems"], report["ok"] = warnings, problems, not problems
    if a.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print("PASS" if not problems else f"FAIL ({len(problems)} problem(s))")
    return 0 if not problems else 1


# --------------------------------------------------------------------------- register

def client_configs(name: str, argv: list[str], env: dict[str, str]) -> dict[str, Any]:
    entry: dict[str, Any] = {"command": argv[0], "args": argv[1:]}
    if env:
        entry["env"] = env
    toml_env = ""
    if env:
        toml_env = "\nenv = { " + ", ".join(f"{k} = {js(v)}" for k, v in env.items()) + " }"
    env_flags = "".join(f" -e {shlex.quote(k + '=' + v)}" for k, v in env.items())
    codex_env = "".join(f" --env {shlex.quote(k + '=' + v)}" for k, v in env.items())
    cmd = " ".join(shlex.quote(c) for c in argv)
    return {
        "claude-code": {"how": f"claude mcp add {name} --scope user{env_flags} -- {cmd}",
                        "project_file": ".mcp.json", "key": "mcpServers", "entry": entry},
        "claude-desktop": {"how": "Settings → Developer → Edit Config (claude_desktop_config.json), add under mcpServers",
                           "key": "mcpServers", "entry": entry},
        "codex": {"how": f"codex mcp add {name}{codex_env} -- {cmd}",
                  "toml": f"# ~/.codex/config.toml\n[mcp_servers.{name}]\ncommand = {js(argv[0])}\nargs = {js(argv[1:])}{toml_env}"},
        "gemini-cli": {"how": f"gemini mcp add {name} {cmd}", "project_file": ".gemini/settings.json",
                       "key": "mcpServers", "entry": entry},
        "cursor": {"how": "add to .cursor/mcp.json (project) or ~/.cursor/mcp.json (global)",
                   "project_file": ".cursor/mcp.json", "key": "mcpServers", "entry": entry},
        "vscode-copilot": {"how": "add to .vscode/mcp.json, then start it from the MCP view",
                           "project_file": ".vscode/mcp.json", "key": "servers", "entry": {"type": "stdio", **entry}},
        "windsurf": {"how": "add to ~/.codeium/windsurf/mcp_config.json under mcpServers",
                     "key": "mcpServers", "entry": entry},
    }


def cmd_register(a: argparse.Namespace) -> int:
    argv = [x for x in a.command if x != "--"] if a.command else []
    if not argv or not re.match(r"^[A-Za-z0-9_-]{1,64}$", a.name or ""):
        print("error: usage: register --name <name> -- <command> [args...]", file=sys.stderr)
        return 2
    env = dict(kv.split("=", 1) for kv in a.env)
    configs = client_configs(a.name, argv, env)
    chosen = [c for c in configs if not a.client or c in a.client]
    if a.write:
        root = Path(a.root).resolve()
        for c in chosen:
            cfg = configs[c]
            if "project_file" not in cfg:
                continue
            path = root / cfg["project_file"]
            data: dict[str, Any] = {}
            if path.exists():
                try:
                    data = json.loads(path.read_text(encoding="utf-8") or "{}")
                except json.JSONDecodeError:
                    print(f"skip {path}: not valid JSON (comments?) — edit it by hand", file=sys.stderr)
                    continue
            data.setdefault(cfg["key"], {})[a.name] = cfg["entry"]
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"wrote {path} ({c})")
        if env:
            print("note: these files now contain the env values you passed — keep secrets out of git.")
        return 0
    if a.json:
        print(json.dumps({c: configs[c] for c in chosen}, indent=2, ensure_ascii=False))
        return 0
    for c in chosen:
        cfg = configs[c]
        print(f"## {c}\n{cfg['how']}")
        if "toml" in cfg:
            print(cfg["toml"])
        elif "entry" in cfg:
            print(json.dumps({cfg["key"]: {a.name: cfg["entry"]}}, indent=2, ensure_ascii=False))
        print()
    return 0


# --------------------------------------------------------------------------- CLI

def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="forge.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--version", action="version", version=f"mcp-forge {VERSION}")
    sub = p.add_subparsers(dest="cmd", required=True)

    n = sub.add_parser("new", help="generate a server project from a spec or an OpenAPI document")
    n.add_argument("spec", nargs="?", help="mcp-forge spec (JSON)")
    n.add_argument("--openapi", help="OpenAPI 3.x / Swagger 2 file (JSON, or YAML with PyYAML)")
    n.add_argument("--name", help="override the server name")
    n.add_argument("--language", choices=["typescript", "python"], help="override the language")
    n.add_argument("--out", help="output directory (default: ./<name>-mcp)")
    n.add_argument("--include", help="OpenAPI: regex on operation name or path to keep")
    n.add_argument("--max-tools", type=int, default=40, help="OpenAPI: cap on generated tools (default 40)")
    n.add_argument("--emit-spec", help="OpenAPI: also save the derived spec to this file")
    n.add_argument("--force", action="store_true", help="write into a non-empty directory")
    n.set_defaults(fn=cmd_new)

    v = sub.add_parser("validate", help="validate a spec")
    v.add_argument("spec")
    v.set_defaults(fn=cmd_validate)

    s = sub.add_parser("smoke", help="start a stdio MCP server and check it speaks the protocol")
    s.add_argument("--call", help="also call this tool")
    s.add_argument("--args", help="JSON arguments for --call")
    s.add_argument("--expect-error", action="store_true", help="the --call is expected to return isError")
    s.add_argument("--env", action="append", default=[], metavar="KEY=VALUE")
    s.add_argument("--timeout", type=float, default=30.0)
    s.add_argument("--json", action="store_true")
    s.add_argument("command", nargs=argparse.REMAINDER)
    s.set_defaults(fn=cmd_smoke)

    r = sub.add_parser("register", help="print or write the client config for a server")
    r.add_argument("--name", required=True)
    r.add_argument("--env", action="append", default=[], metavar="KEY=VALUE")
    r.add_argument("--client", action="append", help="limit to these clients (repeatable)")
    r.add_argument("--write", action="store_true", help="write/merge project-level config files")
    r.add_argument("--root", default=".", help="project root for --write")
    r.add_argument("--json", action="store_true")
    r.add_argument("command", nargs=argparse.REMAINDER)
    r.set_defaults(fn=cmd_register)

    a = p.parse_args(argv)
    for kv in getattr(a, "env", []) or []:
        if "=" not in kv:
            p.error(f"--env expects KEY=VALUE, got {kv!r}")
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
