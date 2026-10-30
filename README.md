# teste

## Tino, o banco de IA (site conceitual)

`site/` é a landing page da Tino, um banco digital brasileiro fictício gerido
por IA. A tese de negócio: o lucro vem do custo de servir perto de zero (IA no
lugar de agência e call center), não de tarifa. Por isso a Tino cobra R$ 0 e
ainda tem margem, e mostra a cada cliente um "recibo de lucro" mensal.

O que tem na página:

- **Chat de demonstração** com a cliente de exemplo Marina: compra cabe no
  bolso?, negociação de contas, rendimento, rotativo, quanto a Tino lucra.
- **Simulador** de quanto o banco atual custa por ano (tarifas, saldo parado,
  juros do rotativo com o teto da Lei 14.690/2023) contra o que a Tino lucraria.
- **Modelo de negócio**: receita por cliente em 7 linhas, custo para servir,
  unit economics (ARPU, margem, LTV, CAC, payback) e seis ideias de receita
  fora da caixa (compra coletiva, dividendo de dados, Tino Inside, etc.).
- Planos (Tino, Tino Pro, Tino Negócios), segurança e lista de espera.

HTML, CSS e JS puros, sem build. Para abrir:

```bash
python3 -m http.server -d site 8000   # depois acesse http://localhost:8000
```

Os cálculos ficam em `site/calc.js` (funções puras, usadas pela página e pelos
testes). Premissas como CDI, spread e CET estão em `PREMISSAS` no topo do
arquivo. Testes:

```bash
npm test
```

Todos os números, taxas e projeções são ilustrativos. A Tino não é instituição
financeira.

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
