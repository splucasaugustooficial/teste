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

## Skill `craft` (multi-IA)

`craft` é uma skill no padrão aberto [Agent Skills](https://agentskills.io) que
aplica um fluxo de engenharia de nível sênior a qualquer mudança de código:
entender → provar o bug → planejar → implementar o mínimo → verificar com as
checagens reais → relatar com honestidade.

A fonte da verdade é `.agents/skills/craft/`. Neste repositório ela já está
instalada para:

| Agente | Onde lê |
|---|---|
| Claude Code | `.claude/skills/craft/` (cópia sincronizada) |
| Codex, Gemini CLI, GitHub Copilot, Cursor e outros do padrão Agent Skills | `.agents/skills/craft/` |
| Agentes que só leem `AGENTS.md` (Windsurf, Zed, Aider, Jules…) | bloco `craft` no `AGENTS.md` |

### Instalar em outro projeto ou para o seu usuário

```bash
git clone https://github.com/splucasaugustooficial/teste.git
bash teste/.agents/skills/craft/scripts/install.sh --dir /caminho/do/projeto
bash teste/.agents/skills/craft/scripts/install.sh --scope user   # ~/.claude e ~/.agents
```

`--target claude,agents,agents-md` escolhe os destinos e `--check` só confere
se as cópias estão em dia. O instalador nunca sobrescreve uma pasta de outra
skill sem `--force`, e reinstalar atualiza o bloco do `AGENTS.md` sem duplicar.

Depois de editar a skill, rode `install.sh` de novo para atualizar a cópia do
Claude Code. O CI (`.github/workflows/craft.yml`) falha se elas divergirem.

### Descobrir as checagens de um projeto

```bash
bash .agents/skills/craft/scripts/checks.sh                  # lista, por categoria
bash .agents/skills/craft/scripts/checks.sh --run            # executa todas
bash .agents/skills/craft/scripts/checks.sh --run --only lint,type --fail-fast
bash .agents/skills/craft/scripts/checks.sh --json           # para automação
```

Reconhece Node, Deno, Python, Rust, Go, .NET, Java, Elixir, Swift, Ruby, PHP e
Makefile. Checagens cuja ferramenta não está instalada aparecem como
**puladas**, nunca como aprovadas.
