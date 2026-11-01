#!/usr/bin/env bash
# Testes de scripts/install.sh. Uso: bash tests/test_install.sh
#
# As condições de expect_true vão entre aspas simples de propósito: eval as expande.
# shellcheck disable=SC2016

set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
installer="$here/../scripts/install.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

pass=0 fail=0
ok()  { pass=$((pass + 1)); echo "ok   - $1"; }
nok() { fail=$((fail + 1)); echo "FAIL - $1"; printf '%s\n' "$2" | sed 's/^/       | /'; }
run() { out="$(HOME="$work/home" bash "$installer" "$@" 2>&1)"; code=$?; }
expect_code() { if [[ $code -eq $2 ]]; then ok "$1"; else nok "$1 (código $code, esperado $2)" "$out"; fi; }
expect_true() { if eval "$2"; then ok "$1"; else nok "$1" "$out"; fi; }

proj="$work/proj"
mkdir -p "$proj" "$work/home"

# --- Projeto ---------------------------------------------------------------
run --check --dir "$proj"
expect_code "check: falha antes de instalar" 1

run --dir "$proj"
expect_code "project: instala sem erro" 0
expect_true "project: Claude Code em .claude/skills" '[[ -f $proj/.claude/skills/craft/SKILL.md ]]'
expect_true "project: padrão aberto em .agents/skills" '[[ -f $proj/.agents/skills/craft/SKILL.md ]]'
expect_true "project: scripts continuam executáveis" '[[ -x $proj/.agents/skills/craft/scripts/checks.sh ]]'
expect_true "project: cria AGENTS.md com o bloco" 'grep -q "craft:begin" $proj/AGENTS.md'
expect_true "project: não deixa pasta temporária" '! compgen -G "$proj/.claude/skills/*.tmp.*" >/dev/null'

run --check --dir "$proj"
expect_code "check: passa logo após instalar" 0

run --dir "$proj"
expect_true "idempotente: um único bloco no AGENTS.md" '[[ $(grep -c "craft:begin" $proj/AGENTS.md) -eq 1 ]]'

echo "mudança local" >>"$proj/.claude/skills/craft/SKILL.md"
run --check --dir "$proj"
expect_code "check: detecta cópia desatualizada" 1
expect_true "check: aponta qual cópia" 'grep -q "DIFERENTE.*\.claude/skills/craft" <<<"$out"'
run --dir "$proj"
run --check --dir "$proj"
expect_code "reinstalar: corrige a cópia" 0

# --- AGENTS.md existente é preservado ----------------------------------------
proj2="$work/proj2"
mkdir -p "$proj2"
printf '# Regras da casa\n\nUse tabs.\n' >"$proj2/AGENTS.md"
run --dir "$proj2" --target agents-md
expect_true "agents-md: preserva conteúdo existente" 'grep -q "Use tabs." $proj2/AGENTS.md'
expect_true "agents-md: acrescenta o bloco" 'grep -q "craft:end" $proj2/AGENTS.md'
sed -i 's/siga/LEIA/' "$proj2/AGENTS.md"
run --dir "$proj2" --target agents-md
expect_true "agents-md: atualiza bloco antigo no lugar" '! grep -q LEIA $proj2/AGENTS.md && grep -q "Use tabs." $proj2/AGENTS.md'
expect_true "agents-md: só um bloco após atualizar" '[[ $(grep -c "craft:begin" $proj2/AGENTS.md) -eq 1 ]]'

# --- Segurança -----------------------------------------------------------------
proj3="$work/proj3"
mkdir -p "$proj3/.claude/skills/craft"
echo "outra coisa" >"$proj3/.claude/skills/craft/SKILL.md"
run --dir "$proj3" --target claude
expect_code "recusa sobrescrever pasta de outra skill" 1
expect_true "pasta alheia continua intacta" 'grep -q "outra coisa" $proj3/.claude/skills/craft/SKILL.md'
run --dir "$proj3" --target claude --force
expect_code "--force sobrescreve" 0

# --- Usuário -------------------------------------------------------------------
run --scope user
expect_code "user: instala sem erro" 0
expect_true "user: ~/.claude/skills" '[[ -f $work/home/.claude/skills/craft/SKILL.md ]]'
expect_true "user: ~/.agents/skills" '[[ -f $work/home/.agents/skills/craft/SKILL.md ]]'
expect_true "user: não cria AGENTS.md no home" '[[ ! -e $work/home/AGENTS.md ]]'

# --- Uso -------------------------------------------------------------------------
run --target nada --dir "$proj"
expect_code "uso: destino desconhecido dá código 2" 2
run --scope global
expect_code "uso: escopo inválido dá código 2" 2

echo
echo "$pass passaram, $fail falharam."
[[ $fail -eq 0 ]]
