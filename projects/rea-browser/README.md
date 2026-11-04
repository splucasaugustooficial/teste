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
node bin/rea-browser.mjs demo --approve   # a mesma demo, aprovando a compra

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
| `--headed` | mostra a janela do navegador |

O portão, resumido:

- **sempre permitido:** leitura (`snapshot`, `find`, `rea_inspect`, `scroll`…) e navegação dentro do escopo;
- **pergunta em `default`:** cliques/envios que parecem irreversíveis (comprar, finalizar, pagar, excluir, transferir…) e navegação/formulários para outra origem;
- **pergunta em qualquer modo:** digitar em campos de senha, cartão, CPF, OTP;
- **sempre negado:** esquemas que não sejam `http(s)` (`javascript:`, `file:`…); em `plan`, qualquer ação.

Sem humano disponível (stdin não interativo, ou a demo sem `--approve`), "pergunta" vira "nega".

## Testes

```bash
npm test
```

19 testes (`node:test`): 10 unitários (política, detector de injeção, validação
de entrada, resumo do REA, compactação, formato da requisição ao Claude) e 9 de
ponta a ponta com **Chromium real + REA real** contra a loja local
(`tests/fixture-site.mjs`). Os de ponta a ponta usam um piloto roteirizado no
lugar do modelo, então rodam sem chave de API. Eles verificam, entre outros:

- o REA encontra `/api/estoque/1`, que não está no HTML;
- sem aprovação, a compra não acontece (`pedidos.length === 0`); com aprovação, acontece;
- a página com injeção é marcada e a navegação para `evil.example` é negada;
- a senha nunca chega ao campo, nem em `trust`;
- `done` sem evidência, ou com ID inventado, é recusado e o loop segue;
- a compactação recomeça do resumo e a missão termina.

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
- Uma aba, sem abas paralelas nem subagentes; ações são sequenciais.
- A estimativa de tokens para compactar é `caracteres / 4`, não uma contagem real.
