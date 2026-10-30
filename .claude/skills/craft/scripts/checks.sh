#!/usr/bin/env bash
# Descobre os comandos de formatação, lint, typecheck, build e teste de um projeto.
#
# Uso:
#   checks.sh [opções] [diretório]
#
# Opções:
#   --run          executa as checagens (padrão: só lista)
#   --only LISTA   filtra por categoria: format,lint,type,build,test
#   --fail-fast    com --run, para na primeira falha
#   --json         lista em JSON (categoria, comando, origem, disponível)
#   -h, --help     mostra esta ajuda
#
# Códigos de saída: 0 tudo ok · 1 alguma checagem falhou · 2 uso inválido.
# Checagens cuja ferramenta não está instalada são PULADAS e aparecem no
# resumo — nunca são contadas como aprovadas.

set -uo pipefail

run=0 json=0 fail_fast=0 only="" dir="."
while [[ $# -gt 0 ]]; do
  case "$1" in
    --run) run=1 ;;
    --json) json=1 ;;
    --fail-fast) fail_fast=1 ;;
    --only) only="${2:-}"; shift ;;
    --only=*) only="${1#--only=}" ;;
    -h|--help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "opção desconhecida: $1 (veja --help)" >&2; exit 2 ;;
    *) dir="$1" ;;
  esac
  shift
done
cd "$dir" 2>/dev/null || { echo "diretório não encontrado: $dir" >&2; exit 2; }

declare -a cats=() cmds=() srcs=() reqs=()

# add CATEGORIA COMANDO ORIGEM REQUISITO
# REQUISITO é "bin:<executável>" ou "py:<módulo>" — usado para detectar
# ferramenta ausente antes de rodar, em vez de reportar uma falha enganosa.
add() {
  local existing
  for existing in "${cmds[@]+"${cmds[@]}"}"; do
    [[ "$existing" == "$2" ]] && return
  done
  if [[ -n "$only" && ",$only," != *",$1,"* ]]; then return; fi
  cats+=("$1"); cmds+=("$2"); srcs+=("$3"); reqs+=("$4")
}
has() { command -v "$1" >/dev/null 2>&1; }
available() {
  case "$1" in
    bin:*) has "${1#bin:}" ;;
    py:*)  has python3 && python3 -I -c "import importlib.util,sys;sys.exit(importlib.util.find_spec('${1#py:}') is None)" 2>/dev/null ;;
    *)     return 0 ;;
  esac
}

# --- Node.js / Deno ---------------------------------------------------------
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
  script_cat() {
    case "$1" in
      format*) echo format ;; lint*) echo lint ;; type*) echo type ;;
      build) echo build ;; test) echo test ;; *) echo lint ;;
    esac
  }
  # Ordem: rápido primeiro, para falhar cedo.
  for name in format:check fmt:check lint typecheck type-check check build test; do
    if grep -qx -- "$name" <<<"$scripts"; then
      add "$(script_cat "$name")" "$pm run $name" "package.json" "bin:$pm"
    fi
  done
  # TypeScript sem script de typecheck: o compilador ainda é a fonte da verdade.
  if [[ -f tsconfig.json ]] && ! grep -qxE 'typecheck|type-check|check' <<<"$scripts" \
     && grep -q '"typescript"' package.json; then
    add type "npx --no-install tsc --noEmit" "tsconfig.json" "bin:npx"
  fi
fi
if [[ -f deno.json || -f deno.jsonc ]]; then
  add format "deno fmt --check" "deno.json" "bin:deno"
  add lint "deno lint" "deno.json" "bin:deno"
  add test "deno test" "deno.json" "bin:deno"
fi

# --- Python -----------------------------------------------------------------
if [[ -f pyproject.toml || -f setup.py || -f setup.cfg || -f requirements.txt ]]; then
  cfg="$(cat pyproject.toml setup.cfg tox.ini 2>/dev/null)"
  if [[ -f uv.lock ]]; then
    py="uv run python"; pyreq() { echo "bin:uv"; }
  else
    py="python3"; pyreq() { echo "py:$1"; }
  fi
  if grep -q '\[tool.ruff' <<<"$cfg" || [[ -f ruff.toml || -f .ruff.toml ]]; then
    add format "$py -m ruff format --check ." "ruff" "$(pyreq ruff)"
    add lint "$py -m ruff check ." "ruff" "$(pyreq ruff)"
  elif grep -q 'flake8' <<<"$cfg" || [[ -f .flake8 ]]; then
    add lint "$py -m flake8" "flake8" "$(pyreq flake8)"
  fi
  if grep -q '\[tool.black' <<<"$cfg"; then
    add format "$py -m black --check ." "black" "$(pyreq black)"
  fi
  if grep -q '\[tool.mypy\|\[mypy' <<<"$cfg" || [[ -f mypy.ini ]]; then
    add type "$py -m mypy ." "mypy" "$(pyreq mypy)"
  fi
  if grep -q '\[tool.pyright' <<<"$cfg" || [[ -f pyrightconfig.json ]]; then
    add type "pyright" "pyright" "bin:pyright"
  fi
  if grep -q 'pytest' <<<"$cfg" || [[ -f pytest.ini || -f conftest.py || -d tests ]]; then
    add test "$py -m pytest -q" "pytest" "$(pyreq pytest)"
  fi
fi

# --- Linguagens compiladas --------------------------------------------------
if [[ -f Cargo.toml ]]; then
  add format "cargo fmt --check" "Cargo.toml" "bin:cargo"
  add lint "cargo clippy --all-targets -- -D warnings" "Cargo.toml" "bin:cargo"
  add test "cargo test" "Cargo.toml" "bin:cargo"
fi
if [[ -f go.mod ]]; then
  # shellcheck disable=SC2016 # expandido depois, por bash -c
  add format 'test -z "$(gofmt -l .)"' "go.mod" "bin:gofmt"
  add lint "go vet ./..." "go.mod" "bin:go"
  add test "go test ./..." "go.mod" "bin:go"
fi
if compgen -G '*.sln' >/dev/null || compgen -G '*.csproj' >/dev/null; then
  add format "dotnet format --verify-no-changes" "dotnet" "bin:dotnet"
  add test "dotnet test" "dotnet" "bin:dotnet"
fi
[[ -f pom.xml ]] && add test "mvn -q verify" "pom.xml" "bin:mvn"
[[ -f gradlew ]] && add test "./gradlew check" "gradlew" "bin:bash"
[[ -f Package.swift ]] && add test "swift test" "Package.swift" "bin:swift"
if [[ -f mix.exs ]]; then
  add format "mix format --check-formatted" "mix.exs" "bin:mix"
  add test "mix test" "mix.exs" "bin:mix"
fi
[[ -f Gemfile ]] && grep -q rspec Gemfile && add test "bundle exec rspec" "Gemfile" "bin:bundle"
[[ -f composer.json ]] && grep -q '"test"' composer.json && add test "composer test" "composer.json" "bin:composer"

# --- Makefile: alvos convencionais ------------------------------------------
if [[ -f Makefile ]]; then
  for target in lint check typecheck test; do
    case "$target" in typecheck) c="type" ;; test) c="test" ;; *) c="lint" ;; esac
    grep -qE "^${target}:" Makefile && add "$c" "make $target" "Makefile" "bin:make"
  done
fi

# --- CI: dica, não execução (os passos podem depender do ambiente) ----------
ci_hints() {
  local f
  for f in .github/workflows/*.y*ml .gitlab-ci.yml; do
    [[ -f "$f" ]] || continue
    # Linhas "run: comando" de uma linha só; blocos multilinha ficam de fora.
    sed -nE 's/^[[:space:]-]*run:[[:space:]]*([^|>].*)$/\1/p' "$f" | sed "s|^|  $f: |"
  done | head -20
}

json_str() { local s=${1//\\/\\\\}; s=${s//\"/\\\"}; printf '"%s"' "$s"; }

if [[ $json -eq 1 ]]; then
  printf '['
  for i in "${!cmds[@]}"; do
    [[ $i -gt 0 ]] && printf ','
    if available "${reqs[$i]}"; then ok=true; else ok=false; fi
    printf '\n  {"category":%s,"command":%s,"source":%s,"available":%s}' \
      "$(json_str "${cats[$i]}")" "$(json_str "${cmds[$i]}")" "$(json_str "${srcs[$i]}")" "$ok"
  done
  printf '\n]\n'
  exit 0
fi

if [[ ${#cmds[@]} -eq 0 ]]; then
  echo "Nenhuma checagem automática detectada${only:+ para --only $only}."
  hints=$(ci_hints)
  [[ -n "$hints" ]] && printf 'O CI roda:\n%s\n' "$hints"
  echo "Leia o README/CONTRIBUTING para saber como o projeto é verificado."
  exit 0
fi

if [[ $run -eq 0 ]]; then
  for i in "${!cmds[@]}"; do
    note=""; available "${reqs[$i]}" || note="  [ferramenta ausente: ${reqs[$i]#*:}]"
    printf '%-7s %-46s # %s%s\n' "${cats[$i]}" "${cmds[$i]}" "${srcs[$i]}" "$note"
  done
  hints=$(ci_hints)
  [[ -n "$hints" ]] && printf '\n# O CI também roda (confira se bate com a lista acima):\n%s\n' "$hints"
  exit 0
fi

passed=() failed=() skipped=()
for i in "${!cmds[@]}"; do
  cmd="${cmds[$i]}"
  if ! available "${reqs[$i]}"; then
    echo "--- PULADO: $cmd (ferramenta ausente: ${reqs[$i]#*:})"
    skipped+=("$cmd")
    continue
  fi
  echo "==> [${cats[$i]}] $cmd"
  start=$SECONDS
  bash -c "$cmd"
  status=$?
  took=$((SECONDS - start))
  if [[ $status -eq 0 ]]; then
    echo "<== ok (${took}s)"
    passed+=("$cmd")
  else
    echo "<== FALHOU com código $status (${took}s)"
    failed+=("$cmd")
    [[ $fail_fast -eq 1 ]] && break
  fi
done

echo
echo "Resumo: ${#passed[@]} ok, ${#failed[@]} falharam, ${#skipped[@]} puladas (de ${#cmds[@]})."
[[ ${#failed[@]} -gt 0 ]] && printf '  FALHOU: %s\n' "${failed[@]}"
[[ ${#skipped[@]} -gt 0 ]] && printf '  PULADA: %s\n' "${skipped[@]}" \
  && echo "  Checagens puladas NÃO foram verificadas — diga isso no relatório."
[[ ${#failed[@]} -eq 0 ]]
