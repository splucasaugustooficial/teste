---
name: mcp-forge
description: Cria servidores MCP (Model Context Protocol) prontos para produção para qualquer coisa — API REST, OpenAPI/Swagger, banco de dados, CLI, arquivos, SaaS ou lógica própria — em TypeScript ou Python, testa o protocolo de verdade e registra no Claude Code, Codex, Gemini CLI, Cursor, VS Code/Copilot, Claude Desktop e Windsurf. Use quando o usuário pedir "crie um MCP", "MCP server para X", "transforme esta API em MCP", "conecte a IA ao meu sistema", "expor ferramentas para o agente", ou mencionar OpenAPI → MCP. Não use para apenas consumir um MCP que já existe.
license: MIT
metadata:
  version: "1.0.0"
  works-with: claude-code codex gemini-cli github-copilot cursor any-agent-reading-AGENTS.md
---

# mcp-forge — MCP de qualquer coisa, verificado

Um servidor MCP bom não é o que tem mais ferramentas: é o que o modelo **usa
certo na primeira tentativa**. Este fluxo gera o esqueleto de forma
determinística (sem dependências, só Python 3.9+), deixa para você só o que
exige julgamento — o desenho das ferramentas e a lógica própria — e prova que
o servidor funciona antes de dizer que terminou.

`FORGE` abaixo é `python3 <pasta desta skill>/scripts/forge.py`. Descubra o
caminho real (ex.: `.agents/skills/mcp-forge`, `.claude/skills/mcp-forge`,
`~/.claude/skills/mcp-forge`) e use-o em todos os comandos.

## 0. Precisa mesmo criar?

Antes de gerar, verifique se já existe um servidor oficial mantido pelo
fornecedor (registro oficial: <https://registry.modelcontextprotocol.io>,
README do produto). Se existir e atender, recomende-o e pare. Crie um novo
quando não houver, quando o oficial não cobrir o caso, ou quando o usuário
pedir explicitamente.

## 1. Entender o alvo

Responda em uma frase: *que tarefas o agente vai conseguir fazer quando eu
terminar?* Depois classifique o alvo — isso decide o caminho:

| Alvo | Caminho |
|---|---|
| API com OpenAPI/Swagger | `FORGE new --openapi spec.json --include 'regex'` (filtre! veja §2) |
| API HTTP sem OpenAPI | escreva um spec a partir da documentação ([spec.md](references/spec.md)) |
| Não-HTTP: banco, CLI, arquivos, SDK, app local, lógica | spec com ferramentas **sem** `method`/`path` → viram stubs que você implementa |
| Misto | um spec só; ferramentas HTTP e custom convivem |

Leia a documentação real do alvo (autenticação, paginação, limites, erros).
Nunca invente endpoints, campos ou formatos: se não conseguir confirmar, diga
isso ao usuário. Pergunte só o que não dá para descobrir — normalmente a
credencial e quais tarefas importam.

Linguagem: TypeScript por padrão (melhor suporte nos clientes, `npx`);
Python se o projeto ou o usuário já usam Python ou se o alvo tem SDK só em
Python.

## 2. Desenhar as ferramentas (a parte que dá estrela)

Leia [references/design.md](references/design.md) antes de escrever o spec. O
resumo que não pode faltar:

- **Tarefas, não endpoints.** Uma ferramenta por coisa que o usuário quer
  fazer. 5–15 ferramentas bem escolhidas vencem 80 espelhando a API. Ao
  importar OpenAPI, use `--include` e `--max-tools`; depois **revise** o spec
  gerado (`--emit-spec`) e corte o que não serve.
- **A descrição é o prompt.** O modelo escolhe a ferramenta só por ela: diga
  o que faz, quando usar, quando *não* usar e o que retorna. Mínimo 20
  caracteres — o gerador recusa menos.
- **Parâmetros óbvios**: `snake_case`, tipos e `enum` exatos, descrição com
  exemplo e unidade, só o essencial como obrigatório.
- **Segurança**: leitura marcada `read_only`; apagar marcado `destructive`;
  credenciais só por variável de ambiente; nada de executar comando ou SQL
  arbitrário vindo do modelo sem lista branca.

## 3. Gerar

```bash
FORGE validate meu-spec.json                      # mostra TODOS os erros de uma vez
FORGE new meu-spec.json --out ./meu-mcp           # ou --language python
FORGE new --openapi api.json --include 'issue|repo' --max-tools 15 --emit-spec spec.json --out ./gh-mcp
```

O projeto sai com servidor, `package.json`/`pyproject.toml`, README com a
tabela de ferramentas e variáveis, e o spec usado. Ferramentas HTTP já
funcionam (timeout, auth, erros HTTP viram `isError` com o corpo, resposta
truncada em 100k caracteres). Exemplo completo:
[examples/weather.json](examples/weather.json).

## 4. Implementar o que é próprio

Procure `TODO(mcp-forge)` e implemente cada stub seguindo
[references/sdk.md](references/sdk.md) (APIs atuais dos SDKs, recursos,
prompts, transporte HTTP remoto, armadilhas de versão). Regras:

- **stdout é do protocolo.** Log só em stderr (`console.error`, `logging`).
  Um `print`/`console.log` quebra o servidor em todos os clientes.
- Erro previsível → retorne erro de ferramenta (`fail(...)` /
  `raise ToolError(...)`) com mensagem que diga ao modelo como corrigir; nunca
  deixe exceção crua vazar segredo ou stack trace.
- Resultados grandes: pagine (`cursor`/`limit`) ou resuma; não despeje MBs.
- Mantenha o estilo do código gerado; edite à vontade, ele é seu.

## 5. Verificar (obrigatório)

```bash
cd meu-mcp && npm install && npm run build        # Python: uv sync
FORGE smoke -- node dist/index.js                 # Python: FORGE smoke -- uv run --directory . server.py
FORGE smoke --call nome_tool --args '{"x":1}' -- node dist/index.js
FORGE smoke --call nome_tool --args '{}' --expect-error -- node dist/index.js   # erro tratado
```

O `smoke` sobe o servidor por stdio, faz `initialize`, lista ferramentas,
recursos e prompts, valida os schemas, detecta lixo no stdout e chama a
ferramenta pedida. Para considerar pronto:

1. `smoke` passa sem `✘`, e os avisos `!` foram resolvidos ou justificados.
2. Pelo menos uma ferramenta de **leitura** foi chamada de verdade com
   sucesso (com a credencial do usuário, se houver). Sem credencial ou rede,
   diga isso claramente em vez de fingir que testou.
3. Um caso de erro (parâmetro inválido, recurso inexistente) volta como
   `isError` com mensagem útil.
4. Ferramentas que escrevem ou apagam **não** são chamadas contra dados reais
   sem o usuário autorizar.

Opcional, visual: `npx @modelcontextprotocol/inspector node dist/index.js`.

## 6. Registrar nos clientes

```bash
FORGE register --name meu --env MEU_API_KEY=... -- node /caminho/absoluto/dist/index.js
FORGE register --name meu --write -- node /caminho/absoluto/dist/index.js   # grava .mcp.json, .cursor/, .vscode/, .gemini/
```

Imprime o comando ou a configuração de Claude Code, Claude Desktop, Codex,
Gemini CLI, Cursor, VS Code/Copilot e Windsurf. Use caminho absoluto. Não
grave segredo em arquivo versionado — prefira a variável de ambiente do
sistema. Detalhes e servidores remotos: [references/clients.md](references/clients.md).

## 7. Relatar

Entregue: o que o servidor faz (tabela de ferramentas), onde está, como rodar,
o que foi verificado e com qual resultado real, o que **não** foi verificado e
por quê, e os próximos passos (credencial a configurar, stubs pendentes,
publicar no npm/PyPI). Nunca diga "funciona" sem o `smoke` ter passado.
