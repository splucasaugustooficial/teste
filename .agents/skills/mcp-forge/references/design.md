# Desenho de ferramentas MCP

O modelo só vê três coisas de cada ferramenta: **nome, descrição e schema de
entrada**. Tudo o que ele precisa para escolher e chamar certo tem de estar
ali.

## Escolher as ferramentas

- **Comece pelas tarefas.** Liste 5–10 frases que o usuário diria ("quais
  pedidos atrasaram esta semana?", "abra um chamado para o cliente X"). Cada
  ferramenta deve servir a pelo menos uma; o que não serve a nenhuma sai.
- **Agrupe endpoints que sempre andam juntos.** Se para responder algo o
  modelo precisaria chamar três endpoints em sequência, ofereça uma
  ferramenta que faz os três (ferramenta custom que chama a API por dentro).
- **Busca + detalhe** é o par mais útil: `search_x` (filtros, poucos campos,
  paginado) e `get_x` (um item, completo).
- **Poucas ferramentas.** Cada uma ocupa contexto em toda conversa. Acima de
  ~20, o modelo começa a errar a escolha; acima de ~40, alguns clientes
  cortam a lista.
- **Leitura antes de escrita.** Lance com leitura; acrescente escrita quando
  a leitura estiver sólida.

## Nomes

- `verbo_objeto` em `snake_case`: `search_orders`, `get_order`,
  `create_refund`. Até 64 caracteres, só `[a-z0-9_]`.
- Prefixe com o domínio se o nome for genérico e houver risco de colisão com
  outros servidores (`crm_search_contacts`).

## Descrições (o prompt da ferramenta)

Bom modelo de frase: **o que faz** + **quando usar** + **quando não usar** +
**o que retorna**.

> Search orders by customer, status or date range and return up to 50
> summaries (id, status, total, created_at). Use get_order for the full
> details of one order. Dates are ISO 8601.

Ruim: "Gets orders." / "Calls GET /v2/orders".

## Parâmetros

- Tipos exatos; `enum` sempre que o conjunto for fechado.
- Descrição com formato, unidade e exemplo: `"ISO 8601 date, e.g. 2026-01-31"`.
- Obrigatório só o que não tem padrão razoável.
- Nada de parâmetro "faz tudo" (`query: string` com SQL, `command: string`
  com shell) sem lista branca e validação.
- IDs: diga de onde vêm ("id returned by search_orders").

## Resultados

- Texto compacto e útil para o modelo. JSON é ok; remova campos que ninguém
  usa (URLs internas, metadados de paginação redundantes).
- Grandes volumes: `limit` com padrão pequeno (10–50) e `cursor`/`page`.
- Erros acionáveis: `"Order 123 not found. Use search_orders to find valid
  ids."` em vez de `"404"`.

## Anotações (dicas para o cliente)

| Campo no spec | Anotação MCP | Quando |
|---|---|---|
| `read_only: true` | `readOnlyHint` | não altera nada (padrão para GET) |
| `destructive: true` | `destructiveHint` | apaga/sobrescreve (padrão para DELETE) |
| `idempotent: true` | `idempotentHint` | repetir não muda o resultado |
| (automático) | `openWorldHint` | fala com sistemas externos (ferramentas HTTP) |

Clientes usam isso para pedir confirmação antes de ações perigosas — marque
com honestidade.

## Segurança

- Credenciais só por variável de ambiente; nunca em código, spec ou log.
- Princípio do menor privilégio: peça ao usuário um token só de leitura se as
  ferramentas só leem.
- Trate entrada do modelo como não confiável: valide caminhos (sem `..`),
  limite tamanhos, use consultas parametrizadas.
- Conteúdo devolvido por APIs externas pode conter instruções maliciosas
  (prompt injection): devolva como dado, nunca execute.
