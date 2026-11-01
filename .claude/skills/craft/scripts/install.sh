#!/usr/bin/env bash
# Instala a skill craft para vários agentes de IA a partir desta pasta.
#
# Uso:
#   install.sh [opções]
#
# Opções:
#   --scope project|user  onde instalar (padrão: project)
#   --dir DIRETÓRIO       raiz do projeto, com --scope project (padrão: .)
#   --target LISTA        claude,agents,agents-md ou all (padrão: all)
#   --check               não muda nada; sai com 1 se alguma cópia estiver
#                         ausente ou desatualizada
#   --force               sobrescreve uma pasta que não é desta skill
#   -h, --help            mostra esta ajuda
#
# Destinos:
#   claude     .claude/skills/craft   Claude Code
#   agents     .agents/skills/craft   Codex, Gemini CLI, GitHub Copilot, Cursor e
#                                     outros agentes do padrão Agent Skills
#   agents-md  bloco no AGENTS.md     agentes que só leem AGENTS.md (só project)
# Com --scope user, as pastas ficam em ~/.claude/skills e ~/.agents/skills.

set -uo pipefail

name="craft"
scope="project" dir="." targets="all" check=0 force=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope) scope="${2:-}"; shift ;;
    --dir) dir="${2:-}"; shift ;;
    --target) targets="${2:-}"; shift ;;
    --check) check=1 ;;
    --force) force=1 ;;
    -h|--help) sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "opção desconhecida: $1 (veja --help)" >&2; exit 2 ;;
  esac
  shift
done

case "$scope" in
  project) root="$(cd "$dir" 2>/dev/null && pwd -P)" \
             || { echo "diretório não encontrado: $dir" >&2; exit 2; } ;;
  user) root="$HOME" ;;
  *) echo "--scope deve ser project ou user" >&2; exit 2 ;;
esac
[[ "$targets" == "all" ]] && targets="claude,agents,agents-md"
[[ "$scope" == "user" ]] && targets="${targets//agents-md/}"

src="$(cd "$(dirname "$0")/.." && pwd -P)"
problems=0

# install_dir DESTINO — copia a skill inteira; troca a pasta de uma vez só,
# para nunca deixar uma instalação pela metade.
install_dir() {
  local dest="$1" real
  if [[ -d "$dest" ]]; then
    real="$(cd "$dest" && pwd -P)"
    if [[ "$real" == "$src" ]]; then
      echo "ok         $dest (é a origem)"; return
    fi
  fi
  if [[ $check -eq 1 ]]; then
    if [[ ! -d "$dest" ]]; then
      echo "AUSENTE    $dest"; problems=$((problems + 1))
    elif ! diff -rq "$src" "$dest" >/dev/null 2>&1; then
      echo "DIFERENTE  $dest — rode install.sh para atualizar"; problems=$((problems + 1))
    else
      echo "ok         $dest"
    fi
    return
  fi
  if [[ -e "$dest" && $force -eq 0 ]] \
     && ! grep -q "^name: $name\$" "$dest/SKILL.md" 2>/dev/null; then
    echo "RECUSADO   $dest já existe e não é a skill $name (use --force)" >&2
    problems=$((problems + 1)); return
  fi
  mkdir -p "$(dirname "$dest")"
  local tmp="$dest.tmp.$$"
  rm -rf "$tmp"
  if cp -R "$src/." "$tmp" && rm -rf "$dest" && mv "$tmp" "$dest"; then
    echo "instalado  $dest"
  else
    echo "FALHOU     $dest" >&2; rm -rf "$tmp"; problems=$((problems + 1))
  fi
}

# Bloco entre marcadores: reinstalar substitui, nunca duplica.
begin="<!-- $name:begin -->" end="<!-- $name:end -->"
block() {
  cat <<EOF
$begin
## Skill $name

Para qualquer mudança de código não trivial (feature, bug, refatoração, falha
de CI ou de teste), siga \`.agents/skills/$name/SKILL.md\`: entender antes de
editar, provar o bug, mudar o mínimo, verificar com
\`bash .agents/skills/$name/scripts/checks.sh --run\` e relatar o que foi e o
que não foi verificado.
$end
EOF
}
install_agents_md() {
  local file="$root/AGENTS.md" current=""
  [[ -f "$file" ]] && current="$(cat "$file")"
  local wanted
  if grep -qF "$begin" <<<"$current"; then
    # Substitui o bloco existente, preservando o resto do arquivo.
    wanted="$(BLK="$(block)" awk -v b="$begin" -v e="$end" '
      $0 == b { print ENVIRON["BLK"]; skip = 1; next }
      $0 == e { skip = 0; next }
      !skip' <<<"$current")"
  elif [[ -n "$current" ]]; then
    wanted="$current"$'\n\n'"$(block)"
  else
    wanted="# AGENTS.md"$'\n\n'"$(block)"
  fi
  if [[ "$current" == "$wanted" ]]; then
    echo "ok         $file"
  elif [[ $check -eq 1 ]]; then
    echo "DIFERENTE  $file — bloco $name ausente ou desatualizado"; problems=$((problems + 1))
  else
    printf '%s\n' "$wanted" >"$file" && echo "atualizado $file"
  fi
}

IFS=',' read -ra list <<<"$targets"
for t in "${list[@]}"; do
  case "$t" in
    claude) install_dir "$root/.claude/skills/$name" ;;
    agents) install_dir "$root/.agents/skills/$name" ;;
    agents-md) install_agents_md ;;
    "") ;;
    *) echo "destino desconhecido: $t (use claude, agents, agents-md ou all)" >&2; exit 2 ;;
  esac
done

[[ $problems -eq 0 ]]
