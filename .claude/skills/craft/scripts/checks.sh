#!/usr/bin/env bash
# Descobre os comandos de lint, typecheck, build e teste de um projeto.
#
# Uso:
#   checks.sh [--run] [diretório]
#
# Sem --run, apenas lista os comandos encontrados (um por linha, com a origem).
# Com --run, executa cada um e termina com código != 0 se algum falhar.

set -uo pipefail

run=0
dir="."
for arg in "$@"; do
  case "$arg" in
    --run) run=1 ;;
    -h|--help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) dir="$arg" ;;
  esac
done
cd "$dir" || { echo "diretório não encontrado: $dir" >&2; exit 2; }

declare -a cmds=() sources=()
add() {
  local cmd="$1" src="$2" existing
  for existing in "${cmds[@]+"${cmds[@]}"}"; do
    [[ "$existing" == "$cmd" ]] && return
  done
  cmds+=("$cmd"); sources+=("$src")
}
has() { command -v "$1" >/dev/null 2>&1; }

# --- Node.js ----------------------------------------------------------------
if [[ -f package.json ]]; then
  pm="npm"
  [[ -f pnpm-lock.yaml ]] && pm="pnpm"
  [[ -f yarn.lock ]] && pm="yarn"
  [[ -f bun.lockb || -f bun.lock ]] && pm="bun"

  scripts=""
  if has node; then
    scripts=$(node -e 'const s=require("./package.json").scripts||{};console.log(Object.keys(s).join("\n"))' 2>/dev/null)
  elif has python3; then
    scripts=$(python3 -I -c 'import json;print("\n".join(json.load(open("package.json")).get("scripts",{})))' 2>/dev/null)
  fi
  # Ordem: rápido primeiro, para falhar cedo.
  for name in format:check lint typecheck type-check check build test; do
    if grep -qx -- "$name" <<<"$scripts"; then
      add "$pm run $name" "package.json"
    fi
  done
fi

# --- Python -----------------------------------------------------------------
if [[ -f pyproject.toml || -f setup.py || -f setup.cfg || -f requirements.txt ]]; then
  cfg="$(cat pyproject.toml setup.cfg tox.ini 2>/dev/null)"
  py="python3"; [[ -f uv.lock ]] && py="uv run python"
  if grep -q '\[tool.ruff' <<<"$cfg" || [[ -f ruff.toml || -f .ruff.toml ]]; then
    add "$py -m ruff check ." "ruff"
    add "$py -m ruff format --check ." "ruff"
  elif grep -q 'flake8' <<<"$cfg" || [[ -f .flake8 ]]; then
    add "$py -m flake8" "flake8"
  fi
  grep -q '\[tool.black' <<<"$cfg" && add "$py -m black --check ." "black"
  if grep -q '\[tool.mypy\|\[mypy' <<<"$cfg" || [[ -f mypy.ini ]]; then
    add "$py -m mypy ." "mypy"
  fi
  grep -q '\[tool.pyright' <<<"$cfg" || [[ -f pyrightconfig.json ]] && add "pyright" "pyright"
  if grep -q 'pytest' <<<"$cfg" || [[ -f pytest.ini || -f conftest.py || -d tests ]]; then
    add "$py -m pytest -q" "pytest"
  fi
fi

# --- Rust / Go / outros -------------------------------------------------------
if [[ -f Cargo.toml ]]; then
  add "cargo fmt --check" "Cargo.toml"
  add "cargo clippy --all-targets -- -D warnings" "Cargo.toml"
  add "cargo test" "Cargo.toml"
fi
if [[ -f go.mod ]]; then
  add 'test -z "$(gofmt -l .)"' "go.mod"
  add "go vet ./..." "go.mod"
  add "go test ./..." "go.mod"
fi
[[ -f Gemfile ]] && grep -q rspec Gemfile && add "bundle exec rspec" "Gemfile"
[[ -f composer.json ]] && grep -q '"test"' composer.json && add "composer test" "composer.json"
if [[ -f pom.xml ]]; then add "mvn -q verify" "pom.xml"; fi
if [[ -f gradlew ]]; then add "./gradlew check" "gradlew"; fi

# --- Makefile: alvos convencionais ------------------------------------------
if [[ -f Makefile ]]; then
  for target in lint check typecheck test; do
    grep -qE "^${target}:" Makefile && add "make $target" "Makefile"
  done
fi

# --- CI: só informa, pois os passos podem depender do ambiente ----------------
ci_files=$(ls .github/workflows/*.y*ml .gitlab-ci.yml 2>/dev/null)

if [[ ${#cmds[@]} -eq 0 ]]; then
  echo "Nenhuma checagem automática detectada."
  [[ -n "$ci_files" ]] && echo "Veja os passos de CI em: $ci_files"
  echo "Leia o README/CONTRIBUTING para saber como o projeto é verificado."
  exit 0
fi

if [[ $run -eq 0 ]]; then
  for i in "${!cmds[@]}"; do
    printf '%-50s # %s\n' "${cmds[$i]}" "${sources[$i]}"
  done
  [[ -n "$ci_files" ]] && echo "# CI também roda passos definidos em: $(echo $ci_files)"
  exit 0
fi

failed=()
for cmd in "${cmds[@]}"; do
  echo "==> $cmd"
  if bash -c "$cmd"; then
    echo "<== ok"
  else
    echo "<== FALHOU ($?)"
    failed+=("$cmd")
  fi
done

echo
if [[ ${#failed[@]} -eq 0 ]]; then
  echo "Todas as ${#cmds[@]} checagens passaram."
else
  echo "${#failed[@]} de ${#cmds[@]} checagens falharam:"
  printf '  - %s\n' "${failed[@]}"
  exit 1
fi
