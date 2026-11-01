# teste

## REA (Reverse Engineer Anything)

Este repositório usa o REA oficial, publicado em
[github.com/morluto/rea](https://github.com/morluto/rea) (pacote npm
[`rea-agents`](https://www.npmjs.com/package/rea-agents)). Não use cópias ou
forks com nome parecido.

### Claude Code

O arquivo `.claude/settings.json` registra o marketplace `morluto/rea` e ativa o
plugin `rea@rea`. Ao abrir o projeto no Claude Code e confiar na pasta, o Claude
Code oferece a instalação do plugin. Para instalar manualmente:

```text
/plugin marketplace add morluto/rea
/plugin install rea@rea
```

Depois, reinicie o Claude Code e confira com `/mcp`.

### Terminal (CLI)

```bash
npm install --global rea-agents
rea --help
```

Ou configure seus agentes com `npx rea-agents setup`.

Requisitos: Node.js 22.x (>= 22.23.4), 24.x (>= 24.22.1) ou 26.12.1+, com npm.
Análise de binários nativos também precisa de Hopper, Ghidra, IDA ou Kuna; veja o
[guia de instalação](https://github.com/morluto/rea/blob/main/docs/installation.md).

## Skill `craft`

`.claude/skills/craft/` é uma skill do Claude Code que aplica um fluxo de
engenharia de nível sênior a qualquer mudança de código: entender → provar o
bug → planejar → implementar o mínimo → verificar com as checagens reais →
relatar com honestidade. Ela é carregada automaticamente neste projeto; para
forçar, use `/craft`.

O script incluído descobre os comandos de formatação, lint, typecheck, build e
teste do projeto (Node, Deno, Python, Rust, Go, .NET, Java, Elixir, Swift,
Ruby, PHP e Makefile):

```bash
bash .claude/skills/craft/scripts/checks.sh                  # lista, por categoria
bash .claude/skills/craft/scripts/checks.sh --run            # executa todas
bash .claude/skills/craft/scripts/checks.sh --run --only lint,type --fail-fast
bash .claude/skills/craft/scripts/checks.sh --json           # para automação
```

Checagens cuja ferramenta não está instalada aparecem como **puladas**, nunca
como aprovadas. Os testes do script rodam no CI (`.github/workflows/craft.yml`)
e localmente com `bash .claude/skills/craft/tests/test_checks.sh`.

Para usar a skill em todos os seus projetos, copie a pasta para
`~/.claude/skills/craft/`.

## Skill `mcp-forge` — MCP de qualquer coisa, em qualquer IA

`.agents/skills/mcp-forge/` cria servidores **MCP** (Model Context Protocol)
para qualquer coisa: API REST, OpenAPI/Swagger, banco, CLI, arquivos ou lógica
própria. Gera em TypeScript ou Python, testa o protocolo de verdade e registra
nos clientes. Segue o padrão aberto **Agent Skills** (`SKILL.md`), então o mesmo
arquivo funciona no Claude Code, Codex, Gemini CLI, GitHub Copilot, Cursor e em
qualquer agente que leia o `AGENTS.md`.

Peça ao seu agente: *"crie um MCP para a API do meu CRM"*, ou use direto:

```bash
F=.agents/skills/mcp-forge/scripts/forge.py      # só Python 3.9+, sem dependências

python3 $F new .agents/skills/mcp-forge/examples/weather.json --out weather-mcp
python3 $F new --openapi api.json --include 'order|customer' --max-tools 15 --out loja-mcp
python3 $F smoke --call get_forecast --args '{"latitude":-23.5,"longitude":-46.6}' -- node weather-mcp/dist/index.js
python3 $F register --name weather -- node "$PWD/weather-mcp/dist/index.js"   # Claude, Codex, Gemini, Cursor, VS Code...
```

| Comando | O que faz |
|---|---|
| `new` | spec JSON ou OpenAPI → projeto completo (auth, timeout, erros, README) |
| `validate` | mostra todos os erros do spec de uma vez |
| `smoke` | sobe **qualquer** servidor stdio e testa initialize, schemas, stdout limpo e uma chamada real |
| `register` | imprime ou grava (`--write`) a configuração de 7 clientes |

Instalar para todos os agentes da máquina (copia para `~/.agents/skills`,
`~/.claude/skills`, `~/.codex/skills`, `~/.gemini/skills`, `~/.copilot/skills`
e `~/.cursor/skills`, conforme o que estiver instalado):

```bash
bash .agents/skills/mcp-forge/scripts/install.sh            # --all, --dry-run, --uninstall
```

Testes: `python3 -m unittest discover -s .agents/skills/mcp-forge/tests`
(`MCP_FORGE_E2E=1` também gera, compila e testa servidores reais em TS e
Python). Rodam no CI em `.github/workflows/mcp-forge.yml`.

> No Windows, ative `git config core.symlinks true` antes de clonar, ou copie
> `.agents/skills/mcp-forge` para `.claude/skills/`.
