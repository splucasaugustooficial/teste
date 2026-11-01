# Registrar o servidor em cada cliente

`FORGE register --name X -- <comando>` imprime tudo isto já preenchido. Use
sempre caminho **absoluto** para o servidor. Formato e locais podem mudar
entre versões dos clientes; em caso de dúvida, confira a documentação atual
do cliente.

| Cliente | Como | Arquivo (projeto / usuário) | Chave |
|---|---|---|---|
| Claude Code | `claude mcp add X --scope user -- cmd args` | `.mcp.json` / `~/.claude.json` | `mcpServers` |
| Claude Desktop | Settings → Developer → Edit Config | `claude_desktop_config.json` | `mcpServers` |
| Codex (CLI/IDE) | `codex mcp add X -- cmd args` | — / `~/.codex/config.toml` | `[mcp_servers.X]` |
| Gemini CLI | `gemini mcp add X cmd args` | `.gemini/settings.json` / `~/.gemini/settings.json` | `mcpServers` |
| Cursor | Settings → MCP | `.cursor/mcp.json` / `~/.cursor/mcp.json` | `mcpServers` |
| VS Code + Copilot | MCP view / `MCP: Add Server` | `.vscode/mcp.json` | `servers` (+ `"type": "stdio"`) |
| Windsurf | Cascade → MCP | — / `~/.codeium/windsurf/mcp_config.json` | `mcpServers` |

Entrada padrão (JSON):

```json
{ "mcpServers": { "X": { "command": "node", "args": ["/abs/dist/index.js"], "env": { "X_API_KEY": "..." } } } }
```

Codex (TOML):

```toml
[mcp_servers.X]
command = "node"
args = ["/abs/dist/index.js"]
env = { X_API_KEY = "..." }
```

`--write` grava/mescla os arquivos **de projeto** (`.mcp.json`,
`.cursor/mcp.json`, `.vscode/mcp.json`, `.gemini/settings.json`) sem apagar
outros servidores. Se um arquivo tiver comentários (JSONC), ele é pulado com
aviso para você editar à mão.

## Segredos

- Arquivos de projeto costumam ir para o git. Não passe `--env` com segredo
  junto de `--write`; deixe a variável no ambiente do sistema ou use a
  sintaxe de variável do cliente (ex.: `${env:X_API_KEY}` no VS Code,
  `${X_API_KEY}` no Claude Code).

## Depois de registrar

- Claude Code: `/mcp` mostra status e ferramentas.
- Codex: `codex mcp list`.
- Gemini CLI: `/mcp`.
- Cursor / VS Code: painel MCP, indicador verde.
- Se não aparecer: rode o comando registrado no terminal; ele deve ficar
  parado esperando stdin, sem imprimir nada no stdout. Depois
  `FORGE smoke -- <mesmo comando>`.

## Publicar (opcional)

- npm: ajuste `name` no `package.json`, `npm run build && npm publish`;
  usuários rodam com `npx -y <pacote>`.
- PyPI: `uv build && uv publish`; usuários rodam com `uvx <pacote>`.
- Registro oficial de servidores: <https://registry.modelcontextprotocol.io>.
