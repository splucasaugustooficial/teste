# Formato do spec (`mcp-forge.spec.json`)

```jsonc
{
  "name": "crm",                       // obrigatório: [a-z][a-z0-9-]*
  "description": "CRM da empresa",     // vai para o README e package.json
  "version": "0.1.0",
  "language": "typescript",            // typescript | python
  "base_url": "https://api.crm.com/v2",// obrigatório se houver path relativo
  "auth": {
    "type": "bearer",                  // none | bearer | header | query
    "env": "CRM_API_KEY",              // padrão: <NAME>_API_KEY
    "name": "X-API-Key"                // obrigatório para header/query
  },
  "tools": [
    {
      "name": "search_contacts",       // snake_case, até 64
      "title": "Search contacts",      // opcional
      "description": "Search contacts by name or email and return up to 25 matches with id, name, email. Use get_contact for full details.",
      "method": "GET",                 // GET | POST | PUT | PATCH | DELETE
      "path": "/contacts",             // relativo ao base_url, ou URL completa
      "read_only": true,               // padrão: true para GET
      "destructive": false,            // padrão: true para DELETE
      "idempotent": true,              // padrão: GET/PUT/DELETE
      "params": {
        "query": { "type": "string", "required": true, "description": "Name or email fragment" },
        "limit": { "type": "integer", "description": "1-100, default 25" },
        "status": { "type": "string", "enum": ["active", "archived"] },
        "tags": { "type": "array", "items": { "type": "string" } }
      }
    },
    {
      "name": "score_lead",
      "description": "Compute a 0-100 lead score from deal size and engagement. Custom logic, no HTTP.",
      "params": { "deal_size": { "type": "number", "required": true } }
    }
  ]
}
```

## Parâmetros

| Campo | Valores | Padrão |
|---|---|---|
| `type` | `string` `number` `integer` `boolean` `array` `object` | `string` |
| `required` | `true`/`false` | `false` (path: sempre `true`) |
| `in` | `query` `path` `body` `header` | `path` se aparece como `{nome}` no path; `body` em POST/PUT/PATCH; senão `query` |
| `enum` | lista | — |
| `items` | `{ "type": ... }` para arrays | — |
| `description` | texto com formato, unidade e exemplo | — |

- Um parâmetro `body` do tipo `object` é mesclado como corpo inteiro.
- Nomes com hífen ou palavra reservada (`user-id`, `class`) são convertidos
  em identificadores válidos no código, mas enviados com o nome original.
- Arrays em query viram parâmetros repetidos (`?tag=a&tag=b`).

## Ferramentas custom

Sem `method` e sem `path` a ferramenta é **custom**: o gerador cria o schema e
um stub marcado `TODO(mcp-forge)` que retorna erro "not implemented" até você
implementar. Use para banco, CLI, arquivos, SDKs, cálculos, ou para combinar
várias chamadas HTTP em uma tarefa.

## Variáveis de ambiente geradas

- `<NAME>_BASE_URL` — troca o `base_url` (staging, self-hosted).
- `<NAME>_TIMEOUT_MS` — timeout por requisição (padrão 30000).
- `auth.env` — a credencial.
