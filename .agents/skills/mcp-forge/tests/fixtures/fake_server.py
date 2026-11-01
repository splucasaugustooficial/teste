"""Minimal stdio MCP server for tests. Mode via argv[1]: ok | pollute | crash | badschema."""
import json
import sys

mode = sys.argv[1] if len(sys.argv) > 1 else "ok"
if mode == "pollute":
    print("hello from a server that logs to stdout", flush=True)
if mode == "crash":
    sys.exit(3)
for line in sys.stdin:
    msg = json.loads(line)
    if "id" not in msg:
        continue
    method, rid = msg["method"], msg["id"]
    if method == "initialize":
        result = {"protocolVersion": msg["params"]["protocolVersion"], "capabilities": {"tools": {}},
                  "serverInfo": {"name": "fake", "version": "9.9.9"}}
    elif method == "tools/list":
        schema = {"type": "object", "properties": {"text": {"type": "string"}}}
        if mode == "badschema":
            schema = {"type": "string"}
        result = {"tools": [{"name": "echo", "description": "Echo the text back unchanged, for tests.", "inputSchema": schema}]}
    elif method == "tools/call":
        args = msg["params"].get("arguments", {})
        if "fail" in args:
            result = {"content": [{"type": "text", "text": "boom"}], "isError": True}
        else:
            result = {"content": [{"type": "text", "text": args.get("text", "")}]}
    else:
        print(json.dumps({"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": "nope"}}), flush=True)
        continue
    print(json.dumps({"jsonrpc": "2.0", "id": rid, "result": result}), flush=True)
