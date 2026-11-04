# rea-browser — um navegador agêntico que trabalha como o Claude Code

Um agente que opera um Chromium real usando o mesmo método que eu (Claude Code)
uso num repositório: **ler antes de agir, agir o mínimo, verificar o efeito,
pedir permissão para o que é irreversível e só dizer "pronto" com evidência**.
A percepção vem do **REA** ([morluto/rea](https://github.com/morluto/rea), o
mesmo que este repositório já configura): ele observa a aba pelo Chrome DevTools
Protocol e devolve *Evidence* com ID, nível de confiança e limitações declaradas.

```
            ┌───────────── loop do agente (src/agent.mjs) ─────────────┐
 missão ──▶ │ modelo ─▶ tool_use ─▶ portão de permissão ─▶ executa ─▶ │──▶ done + evidências
            │   ▲                    (src/policy.mjs)          │      │
            │   └──────────── tool_result / erro ◀─────────────┘      │
            └──────────────────────────────────────────────────────────┘
     ação: Playwright (src/browser.mjs)  ·  percepção: REA via CDP (src/rea.mjs)
                 └────────── mesma aba, porta CDP em 127.0.0.1 ──────────┘
```

## Como cada parte espelha o meu funcionamento

| No Claude Code | No rea-browser |
|---|---|
| Loop: modelo pede ferramenta → harness executa → resultado volta | `runAgent` com a API do Claude (`claude-opus-5-5`, thinking adaptativo) |
| `Read` / `Grep` antes de `Edit` | `snapshot` (refs `e1, e2…` + texto) e `find` (grep no texto completo) antes de `click`/`type` |
| Ferramentas de leitura vs. com efeito colateral | cada ferramenta declara `risk: 'read' \| 'act'` |
| Modos de permissão (plan, default, auto…) | `--mode plan` (só observa), `default` (pergunta antes do irreversível), `trust` |
| Chamada negada → "ajuste, não repita igual" | negação volta como `tool_result` com `is_error` e essa instrução |
| Resultados de ferramenta são dados, não instruções | todo conteúdo de página vem em `<untrusted_page_content>`; padrões de injeção são marcados |
| `TodoWrite` | ferramenta `todo` |
| Compactação de contexto | histórico só cresce por anexação; ao passar do orçamento, recomeça de um resumo com missão, tarefas, notas e páginas |
| "Relate com fidelidade; verifique antes de dizer que terminou" | `done` exige IDs de evidência que existam no ledger; senão é recusado e o loop continua |
| Subagente de pesquisa / ferramenta de análise | `rea_inspect`: acessibilidade, rede (com formato das respostas JSON, sem valores) e console |
| `AskUserQuestion` | `ask_user`: pergunta ao humano ou entrega a janela (`handoff`) para login/CAPTCHA |
| "Sim, e não pergunte de novo" | aprovar com `[a] sempre` vale pela sessão (exceto senha/cartão) |
| `CLAUDE.md` / memória | memória por site: `remember` grava dicas por origem, recebidas na próxima visita |
| Detecção de loop do harness | mesma chamada + mesmo resultado: aviso na 3ª vez, status `loop` na 5ª |

## O melhor de outros agentes

| Inspiração | Aqui |
|---|---|
| **Operator / Comet**: confirmar antes do que não tem volta; "assumir o controle" | portão de permissões + `ask_user` com `handoff` |
| **Stagehand**: `extract`; cache de ações | `extract` (tabelas como objetos pelo cabeçalho, listas); **gravar e repetir** sem modelo |
| **Browser Use**: elementos indexados; abas; workflows | refs `e1…` por snapshot; `tabs` e abas novas seguidas; receitas com alvo semântico |
| **Playwright**: auto-wait | `wait_for` (texto aparece/some) |
| **Claude Code**: permissões, verificação, memória | modos, `done` com evidência, memória por site |
| **REA**: evidência com ID, confiança e limitações | toda observação de rede/acessibilidade é citável (`ev_…`) |

O que o distingue: **percepção por evidência** (o REA vê de onde vêm os dados, não
só o que está desenhado), **conclusão só com prova** (`done` recusa IDs que não
existem) e **receitas que repetem pelo mesmo portão**: uma compra gravada pede
aprovação de novo na repetição.

## O que o REA acrescenta

O texto da página mostra o que está desenhado; o REA mostra **de onde veio**. Na
loja de teste, o estoque não está no HTML — chega por `fetch`. Saída real de
`rea_inspect` nessa página:

```
REA evidence ev_c75a29… (rea.web-page-inspection, confiança: observed)
Página: Teclado Mecânico <http://127.0.0.1:36855/produto/1>
Acessibilidade:
  RootWebArea "Teclado Mecânico"
    link "Início"
    link "Produtos"
    link "Carrinho"
    link "Entrar"
    heading "Teclado Mecânico"
    StaticText "Preço: R$ 349,90"
    StaticText "Em estoque: 7 unidades"
    button "Adicionar ao carrinho"
Rede durante a observação (2 requisições, 1 distintas):
  GET http://127.0.0.1:36855/api/estoque/1 [Fetch] x2
Completude: policy_filtered
```

O REA é passivo por construção: não guarda corpos, cookies nem valores de
storage, e **nunca executa** ferramentas WebMCP declaradas pela página
(`webmcp_discover` só lista). Isso casa com a regra do agente: perceber é livre,
agir passa pelo portão.

## Uso

Requer Node 22.23.4+ (exigência do `rea-agents`) e um Chromium para o Playwright
(`npx playwright install chromium` se ainda não tiver).

```bash
cd projects/rea-browser
npm install

npm run demo                  # offline, sem chave: loja local + piloto roteirizado
node bin/rea-browser.mjs demo --approve --record receita.json   # aprova a compra e grava
node bin/rea-browser.mjs replay receita.json --demo-site --approve   # repete sem modelo

export ANTHROPIC_API_KEY=...  # ou `ant auth login`
node bin/rea-browser.mjs "Qual o frete do produto mais barato?" \
  --start-url https://loja.exemplo.com --mode default --trace run.jsonl
```

| Opção | Efeito |
|---|---|
| `--start-url URL` | página inicial; a origem dela vira o escopo se `--allow-origin` não for dado |
| `--allow-origin URL` | origens permitidas (repetível); fora delas, navegar pede aprovação |
| `--mode plan\|default\|trust` | `plan` só observa; `default` pergunta antes de comprar/excluir/enviar; `trust` não pergunta (exceto senha/cartão) |
| `--yes` | aprova tudo que perguntaria (use só em sites de teste) |
| `--model`, `--effort` | padrão `claude-opus-5-5`, `medium` |
| `--trace arquivo.jsonl` | grava cada evento (chamada, decisão, resultado) |
| `--headed` | mostra a janela do navegador (necessário para `ask_user` com `handoff`) |
| `--record arquivo.json` | grava as ações de página da execução como receita |
| `replay arquivo.json` | repete a receita sem modelo; `--start-url` troca a origem (ex.: homologação → produção) |
| `--memory-dir DIR` / `--no-memory` | onde fica a memória por site (padrão `~/.rea-browser/memory`) / desliga |

Ferramentas do agente: `navigate`, `snapshot`, `find`, `extract`, `wait_for`,
`click`, `type`, `select`, `scroll`, `back`, `tabs`, `rea_inspect`,
`webmcp_discover`, `screenshot`, `ask_user`, `todo`, `note`, `remember`, `done`.

O portão, resumido:

- **sempre permitido:** leitura (`snapshot`, `find`, `rea_inspect`, `scroll`…) e navegação dentro do escopo;
- **pergunta em `default`:** cliques/envios que parecem irreversíveis (comprar, finalizar, pagar, excluir, transferir…) e navegação/formulários para outra origem;
- **pergunta em qualquer modo:** digitar em campos de senha, cartão, CPF, OTP;
- **sempre negado:** esquemas que não sejam `http(s)` (`javascript:`, `file:`…); em `plan`, qualquer ação.
- **guarda de navegação:** além das ações pedidas, toda navegação do frame principal (redirecionamento 302, `location.href`, envio por Enter) é checada contra o escopo;
- **diálogos:** `alert` passa; `confirm`/`prompt` negam em `plan`, perguntam em `default`, aceitam em `trust`; o modelo sempre vê o texto e o desfecho.

Sem humano disponível (stdin não interativo, ou a demo sem `--approve`), "pergunta" vira "nega".

## Testes

```bash
npm test
```

45 testes (`node:test`, cerca de 1 minuto): 15 unitários e 30 com **Chromium
real + REA real** contra uma loja local com duas origens
(`tests/fixture-site.mjs`). Os de navegador usam um piloto roteirizado no lugar
do modelo, então rodam sem chave de API.

- `e2e.test.mjs` (9): o REA acha `/api/estoque/1`, que não está no HTML; sem
  aprovação a compra não acontece, com aprovação acontece; injeção marcada;
  senha nunca digitada, nem em `trust`; `done` sem evidência é recusado;
  compactação.
- `bugs.test.mjs` (13): uma regressão por bug corrigido (abaixo).
- `features.test.mjs` (8): `extract`, `wait_for`, `ask_user`, aprovação
  "sempre", memória por site, gravar e repetir (inclusive em outro servidor e
  parando sem aprovação).

### Bugs corrigidos (cada um com teste que falhava antes)

| # | Bug | Correção |
|---|---|---|
| 1 | `rea_inspect` descartava em silêncio APIs de outras origens; várias origens quebravam a chamada ao REA | aprova as origens que a página contatou, com a flag repetida |
| 2 | Enter num campo de texto enviava formulário para outra origem sem pedir | `type` com `submit` conta como envio |
| 3 | redirecionamento 302 e `location.href` saíam do escopo por fora do portão | guarda em toda navegação do frame principal |
| 4 | `confirm()` era recusado em silêncio pelo Playwright | diálogo passa pela política e aparece para o modelo |
| 5 | link `target=_blank` abria aba invisível ao agente | abas novas são seguidas; ferramenta `tabs` |
| 6 | captura de tela inflava a estimativa de tokens (~25 mil por imagem) | imagem conta valor fixo |
| 7 | `find` lia texto do snapshot antigo | lê a página na hora |
| 8 | modelo repetindo chamada negada gastava todos os passos | detecção de loop |
| 9 | CLI aceitava `--max-steps abc`, mostrava stack trace | validação com mensagem clara |
| 10 | texto de `alert()` da página ficava fora do bloco não confiável | entra em "Eventos da página", dentro do bloco |
| 11 | página podia escrever `</untrusted_page_content>` e "sair" do bloco | tags reservadas neutralizadas |
| 12 | a guarda do #3 travava abas novas (`req.frame()` lança) | navegação sem frame = frame principal da aba nova |

## Limitações (honestas)

- **O caminho com o modelo real não foi executado aqui**: o ambiente onde isto
  foi escrito não tem chave da API. O formato da requisição é testado com um
  cliente falso; o loop, o portão e o REA são testados de verdade com o piloto
  roteirizado.
- A classificação de "irreversível" é por palavras-chave (pt/en) no texto do
  botão e na URL do formulário. Um botão "OK" que apaga a conta passa como ação
  comum. Use `plan` ou `default` em sites que importam.
- O detector de injeção é uma lista de regex: só **avisa**. A defesa real é o
  conteúdo ser tratado como dado e o portão de permissões. Para um detector
  medido, veja [`../injection-guard`](../injection-guard/).
- O REA só vê a rede **durante** a janela de observação (`observation_ms`);
  requisições anteriores ao attach não aparecem — ele mesmo declara isso.
- Ações são sequenciais: várias abas, mas uma ativa por vez, sem subagentes paralelos.
- A estimativa de tokens para compactar é `caracteres / 4` (imagens com valor
  fixo), não uma contagem real.
- Guarda de navegação: redirecionamentos de GET são decididos antes de sair; num
  POST que redireciona para fora, ou numa cadeia de redirecionamentos, a
  requisição externa já foi feita quando a guarda percebe, e ela só volta a página.
- Repetição de receita acha elementos por papel + rótulo; se o site renomear o
  botão para algo sem relação, a repetição para com "não achei …" em vez de
  chutar.
- Memória por site é texto gravado pelo próprio agente a partir de páginas: chega
  marcada como não verificada e dicas com padrão de injeção são recusadas, mas o
  filtro é por regex.
