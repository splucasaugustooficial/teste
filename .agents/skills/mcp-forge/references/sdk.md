# SDKs oficiais: o que usar e as armadilhas

Verificado em novembro de 2026 com `@modelcontextprotocol/sdk` 1.32 + `zod` 4
e `mcp` (Python) 2.3. Se o projeto fixar outra versão, confira a API dela em
vez de supor.

## TypeScript (`@modelcontextprotocol/sdk`)

```ts
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "demo", version: "0.1.0" });

server.registerTool("add", {
  title: "Add",
  description: "Add two numbers and return the sum.",
  inputSchema: { a: z.number(), b: z.number() },            // shape, não z.object(...)
  annotations: { readOnlyHint: true },
}, async ({ a, b }) => ({ content: [{ type: "text", text: String(a + b) }] }));

// Recurso estático e com template
server.registerResource("readme", "docs://readme", { mimeType: "text/markdown" },
  async (uri) => ({ contents: [{ uri: uri.href, text: "# Hello" }] }));
server.registerResource("user", new ResourceTemplate("users://{id}", { list: undefined }), {},
  async (uri, { id }) => ({ contents: [{ uri: uri.href, text: JSON.stringify({ id }) }] }));

// Prompt
server.registerPrompt("review", { argsSchema: { code: z.string() } },
  ({ code }) => ({ messages: [{ role: "user", content: { type: "text", text: `Review:\n${code}` } }] }));

await server.connect(new StdioServerTransport());
```

- `server.tool(...)`, `server.resource(...)`, `server.prompt(...)` estão
  **deprecated** — use `registerTool/registerResource/registerPrompt`.
- Erro de ferramenta: retorne `{ content: [...], isError: true }`. Exceção
  lançada também vira erro, mas com mensagem menos controlada.
- ESM: `"type": "module"` e imports com sufixo `.js`.
- Log: `console.error`. `console.log` corrompe o stdio.

### Remoto (Streamable HTTP)

Para servir na rede (vários usuários, sem instalar nada no cliente):

```ts
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const app = express();
app.use(express.json());
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }); // stateless
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
app.listen(3000);
```

Em produção: HTTPS, autenticação (OAuth ou token), validação de `Origin`,
limite de taxa. Não exponha um servidor local sem auth.

## Python (`mcp`, SDK oficial)

**Atenção:** na versão 2, `FastMCP` virou `MCPServer`. Código antigo com
`from mcp.server.fastmcp import FastMCP` quebra com `mcp>=2`. O gerador já
usa a API nova e fixa `mcp>=2,<3`.

```python
from typing import Annotated
from pydantic import Field
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations

mcp = MCPServer("demo", version="0.1.0")

@mcp.tool(description="Add two numbers and return the sum.",
          annotations=ToolAnnotations(readOnlyHint=True))
async def add(a: Annotated[float, Field(description="first")], b: float) -> str:
    return str(a + b)

@mcp.resource("docs://readme")
def readme() -> str:
    return "# Hello"

@mcp.prompt()
def review(code: str) -> str:
    return f"Review:\n{code}"

if __name__ == "__main__":
    mcp.run()                         # stdio; mcp.run("streamable-http") para remoto
```

- Erro de ferramenta: `raise ToolError("mensagem útil")` → `isError: true`.
- O schema vem dos type hints: use `Annotated[..., Field(description=...)]`,
  `Literal[...]` para enums e `X | None = None` para opcionais.
- Código bloqueante (requests, drivers síncronos) dentro de `async def`:
  envolva em `await asyncio.to_thread(...)`.
- Log: `logging` (vai para stderr). Nunca `print()`.
- Se o projeto exige `mcp<2`, troque o import por
  `from mcp.server.fastmcp import FastMCP` e `ToolError` por
  `mcp.server.fastmcp.exceptions.ToolError`.

## Outras linguagens

Há SDKs oficiais para C#, Go, Java, Kotlin, PHP, Ruby, Rust e Swift
(<https://modelcontextprotocol.io/docs/sdk>). O gerador cobre TS e Python;
para outra linguagem, use o spec como contrato e escreva à mão — o `smoke`
testa qualquer servidor stdio, independentemente da linguagem.
