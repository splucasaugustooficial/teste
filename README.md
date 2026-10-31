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

## NEON VIPER

Arena local de serpentes para Android, sem anúncios e sem servidor externo.
Até quatro celulares na mesma rede Wi-Fi se encontram automaticamente. Vagas
livres viram bots.

- **Dupla:** dois aliados sobrevivem a ondas de bots.
- **Contra:** dois times de até duas pessoas jogam até restar um time.
- **Treino:** uma serpente, sem rede.
- **Controle:** joystick virtual ou arrastar o dedo, com impulso.

O primeiro aparelho que não encontra uma sala torna-se o host autoritativo.
Os outros enviam apenas a direção. Para gerar o APK de depuração:

```bash
./gradlew assembleDebug
```

O pacote fica em `app/build/outputs/apk/debug/app-debug.apk`. O roteiro de teste
está em `docs/testing/neon-viper-smoke-test.md`.
