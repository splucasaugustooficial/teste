#!/usr/bin/env bash
# Testes de scripts/checks.sh. Uso: bash tests/test_checks.sh
#
# Herméticos: o PATH contém só utilitários básicos e stubs, então o resultado
# não depende das ferramentas instaladas na máquina.

set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
script="$here/../scripts/checks.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

bin="$work/bin"
mkdir -p "$bin"
for tool in bash env sed grep cat head; do
  ln -s "$(command -v "$tool")" "$bin/$tool"
done
# node é usado para ler package.json; sem ele, os testes de Node são pulados.
real_node="$(command -v node || true)"

pass=0 fail=0 skip=0
ok()   { pass=$((pass + 1)); echo "ok   - $1"; }
nok()  { fail=$((fail + 1)); echo "FAIL - $1"; printf '%s\n' "$2" | sed 's/^/       | /'; }
skip() { skip=$((skip + 1)); echo "skip - $1"; }

# checks ARGS... — roda o script com o PATH hermético; define $out e $code.
checks() { out="$(PATH="$bin" "$bin/bash" "$script" "$@" 2>&1)"; code=$?; }
has_line()  { if grep -qE -- "$2" <<<"$out"; then ok "$1"; else nok "$1" "$out"; fi; }
lacks()     { if grep -qE -- "$2" <<<"$out"; then nok "$1" "$out"; else ok "$1"; fi; }
exit_is()   { if [[ $code -eq $2 ]]; then ok "$1"; else nok "$1 (código $code, esperado $2)" "$out"; fi; }
fixture()   { local d="$work/$1"; mkdir -p "$d"; echo "$d"; }

# --- Node --------------------------------------------------------------------
if [[ -n "$real_node" ]]; then
  ln -s "$real_node" "$bin/node"

  d=$(fixture node)
  echo '{"scripts":{"lint":"x","test":"x","dev":"x"},"devDependencies":{"typescript":"5"}}' >"$d/package.json"
  touch "$d/pnpm-lock.yaml" "$d/tsconfig.json"
  checks "$d"
  has_line "node: detecta pnpm e o script lint" '^lint +pnpm run lint +# package.json'
  has_line "node: detecta o script test" '^test +pnpm run test'
  lacks    "node: ignora scripts que não são checagens" 'run dev'
  has_line "node: tsc --noEmit quando não há script de typecheck" '^type +npx --no-install tsc --noEmit'
  has_line "node: avisa ferramenta ausente" 'ferramenta ausente: pnpm'

  echo '{"scripts":{"typecheck":"x"},"devDependencies":{"typescript":"5"}}' >"$d/package.json"
  checks "$d"
  lacks "node: não duplica typecheck com tsc" 'tsc --noEmit'

  rm "$bin/node"
else
  skip "node: node não instalado"
fi

# --- Python ------------------------------------------------------------------
d=$(fixture python)
printf '[tool.ruff]\n[tool.mypy]\n' >"$d/pyproject.toml"
mkdir -p "$d/tests"
checks "$d"
has_line "python: ruff format antes de ruff check" '^format +python3 -m ruff format --check'
has_line "python: mypy" '^type +python3 -m mypy'
has_line "python: pytest pela pasta tests/" '^test +python3 -m pytest -q'
has_line "python: módulo ausente é sinalizado" 'ferramenta ausente: mypy'

touch "$d/uv.lock"
checks "$d"
has_line "python: usa uv run quando há uv.lock" 'uv run python -m pytest'

# --- Go, filtros e JSON -------------------------------------------------------
d=$(fixture go)
echo 'module x' >"$d/go.mod"
checks "$d"
has_line "go: gofmt, vet e test" '^format +test -z'
has_line "go: go vet" '^lint +go vet'

checks --only test "$d"
has_line "--only: mantém a categoria pedida" 'go test'
lacks    "--only: remove as outras" 'go vet|gofmt'

checks --only=format,lint "$d"
has_line "--only=: aceita lista" 'go vet'
lacks    "--only=: respeita a lista" 'go test'

checks --json "$d"
has_line "--json: escapa aspas" '"command":"test -z \\"\$\(gofmt -l \.\)\\""'
has_line "--json: marca disponibilidade" '"available":false'
if [[ -n "$real_node" ]]; then
  if "$real_node" -e 'JSON.parse(require("fs").readFileSync(0,"utf8"))' <<<"$out"; then
    ok "--json: saída é JSON válido"
  else
    nok "--json: saída é JSON válido" "$out"
  fi
fi

# --- Execução -------------------------------------------------------------------
d=$(fixture make)
printf 'lint:\n\ttrue\ntypecheck:\n\ttrue\ntest:\n\tfalse\n' >"$d/Makefile"
cat >"$bin/make" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  lint) echo "lint limpo" ;;
  typecheck) exit 4 ;;
  test) echo "testes rodaram" ;;
esac
EOF
chmod +x "$bin/make"

checks --run "$d"
exit_is  "--run: código 1 quando algo falha" 1
has_line "--run: mostra o código de saída da falha" 'FALHOU com código 4'
has_line "--run: resumo conta ok e falhas" 'Resumo: 2 ok, 1 falharam, 0 puladas \(de 3\)'

checks --run --fail-fast "$d"
lacks    "--fail-fast: para na primeira falha" 'testes rodaram'

checks --run --only lint "$d"
exit_is  "--run: código 0 quando tudo passa" 0

d=$(fixture elixir)
touch "$d/mix.exs"
checks --run "$d"
exit_is  "ausente: pular não é falhar" 0
has_line "ausente: aparece como PULADO" 'PULADO: mix test'
has_line "ausente: resumo avisa que não foi verificado" 'NÃO foram verificadas'
lacks    "ausente: nunca conta como ok" 'Resumo: [1-9] ok'

# --- Sem checagens / erros de uso ---------------------------------------------
d=$(fixture vazio)
mkdir -p "$d/.github/workflows"
printf 'jobs:\n  t:\n    steps:\n      - run: ./ci/test.sh --all\n      - run: |\n          echo multi\n' \
  >"$d/.github/workflows/ci.yml"
checks "$d"
has_line "vazio: informa que nada foi detectado" 'Nenhuma checagem automática'
has_line "vazio: mostra os passos do CI" 'ci.yml: \./ci/test\.sh --all'
lacks    "vazio: ignora bloco run multilinha" 'ci.yml: \|'

checks --nao-existe "$d"
exit_is "uso: opção inválida dá código 2" 2

checks "$work/nao-existe"
exit_is "uso: diretório inexistente dá código 2" 2

checks --help
has_line "--help: mostra o uso" '^Uso:'

echo
echo "$pass passaram, $fail falharam, $skip pulados."
[[ $fail -eq 0 ]]
