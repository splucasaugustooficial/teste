# AGENTS.md

Instruções para qualquer agente de IA neste repositório (Codex, Gemini CLI,
Copilot, Cursor, Claude Code, Aider, Jules, etc.).

## Skills

As skills seguem o padrão aberto Agent Skills (`SKILL.md` com frontmatter
`name` + `description`). Ficam em `.agents/skills/`; `.claude/skills/` aponta
para lá.

| Skill | Quando usar | Arquivo |
|---|---|---|
| `mcp-forge` | criar um servidor MCP para qualquer API, OpenAPI, banco, CLI ou lógica | `.agents/skills/mcp-forge/SKILL.md` |
| `craft` | qualquer mudança de código não trivial | `.claude/skills/craft/SKILL.md` |

Se o seu agente não carrega skills automaticamente: quando a tarefa bater com
a coluna "Quando usar", **leia o `SKILL.md` correspondente inteiro e siga-o**
antes de agir.

## Checagens

```bash
python3 -m unittest discover -s .agents/skills/mcp-forge/tests      # MCP_FORGE_E2E=1 para builds reais
bash .claude/skills/craft/tests/test_checks.sh
for p in evalkit ragbench injection-guard dataset-doctor; do (cd projects/$p && python3 -m unittest discover -s tests); done
```

## Projetos de pesquisa (`projects/`)

Cada projeto é independente (um arquivo Python, só biblioteca padrão, 3.9+), com
`tests/`, dados e README com números medidos. Ao mudar código ou dados, rode os
testes do projeto e **atualize as tabelas do README com os números novos** — os
testes têm pisos para os resultados publicados.
