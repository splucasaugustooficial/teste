---
name: craft
description: Fluxo de engenharia de nível sênior para qualquer mudança de código não trivial — entender antes de tocar, provar o bug antes de corrigir, mudar o mínimo, verificar com as checagens reais do projeto e relatar com honestidade. Use sempre que for implementar uma feature, corrigir um bug, refatorar, investigar uma falha de CI ou teste, ou quando o usuário pedir "faça direito", "com qualidade", "nível produção", "sem quebrar nada" ou invocar /craft. Não use para perguntas que se respondem sem mexer em código.
---

# Craft — engenharia que merece estrela

Código bom não é o que parece inteligente: é o que **funciona, é verificado e
qualquer pessoa entende amanhã**. Este fluxo existe porque os erros mais caros
de um agente são sempre os mesmos — corrigir o problema errado, mudar demais,
declarar vitória sem rodar nada e esconder o que deu errado. Cada fase abaixo
fecha uma dessas portas.

## Calibre o rigor

| Tarefa | Exemplo | Fases |
|---|---|---|
| Trivial | typo, texto, renomear variável local | 4 → 5 (só as checagens rápidas) → 6 |
| Normal | feature pequena, bug com causa clara | todas, planos curtos |
| Crítica | dinheiro, auth, dados, migração, API pública | todas, plano confirmado com o usuário antes de codar |

Na dúvida entre dois níveis, escolha o mais rigoroso.

## 1. Entender (antes de editar qualquer coisa)

- Reformule o pedido em uma frase: *o que deve ser verdade quando eu terminar?*
  Se não conseguir, a tarefa ainda está ambígua — resolva lendo o código; só
  pergunte ao usuário o que o código não responde.
- Leia o código ao redor do ponto de mudança, quem o chama e os testes
  existentes. Absorva as convenções: nomes, tratamento de erro, estilo de
  teste, densidade de comentários. Seu código deve parecer escrito pela mesma
  pessoa.
- Descubra as checagens reais do projeto e rode-as **antes** de mudar algo,
  para conhecer o estado de partida:

  ```bash
  bash .claude/skills/craft/scripts/checks.sh          # lista, por categoria
  bash .claude/skills/craft/scripts/checks.sh --run    # executa todas
  ```

  O script lê `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`,
  `Makefile`, `deno.json`, `.sln`, `mix.exs` e outros, marca ferramentas não
  instaladas e mostra o que o CI roda. Uma falha pré-existente não é sua — mas
  anote-a, porque ela entra no relatório.

## 2. Provar (bugs e falhas de CI)

Não corrija o que você não reproduziu.

- Escreva o teste ou comando que falha **pelo motivo certo** antes do fix.
- Encontre a causa raiz, não o sintoma. O método está em
  [references/debugging.md](references/debugging.md) — leia-o quando a causa
  não for óbvia em poucos minutos ou quando o primeiro fix não funcionar.
- Se não conseguir reproduzir, diga isso explicitamente e explique o que o fix
  pressupõe.

## 3. Planejar (mais de um arquivo ou alguma decisão de design)

Escreva para si: arquivos tocados, a abordagem e a alternativa descartada (com
o porquê). Mudou API pública, schema, formato de dados ou algo difícil de
reverter? Confirme com o usuário primeiro.

## 4. Implementar — o mínimo correto

- **Diff mínimo.** Só o que a tarefa exige. Refatorações "aproveitando a
  viagem", renomes e reformatação de arquivo inteiro ficam para outro PR.
- **Reuse antes de criar.** Procure um helper existente antes de escrever um.
- **Erros explícitos.** Nada de `catch` vazio, `|| true` ou valor default que
  esconde falha. Trate, ou propague com contexto.
- **Bordas.** Vazio, nulo, enorme, negativo, duplicado, concorrente, Unicode,
  fuso horário, falha de rede — o que se aplicar.
- **Nunca** desative, pule ou afrouxe um teste para ficar verde. **Nunca**
  escreva segredos em código, log ou teste.
- Comentários explicam *por quê*, nunca *o quê*.

Itere em ciclos curtos: mude um pouco, rode as checagens rápidas
(`checks.sh --run --only format,lint,type --fail-fast`), continue.

## 5. Verificar — evidência, não esperança

1. Rode **todas** as checagens (`checks.sh --run`). Checagem *pulada* por
   ferramenta ausente não é checagem aprovada: instale a ferramenta ou declare
   no relatório que aquilo não foi verificado.
2. Rode o teste que provava o bug: agora ele passa. Reverta o fix por um
   instante se tiver dúvida de que o teste realmente o cobre.
3. Exercite a mudança de verdade quando der (rode o CLI, suba o servidor, abra
   a página). Teste passando não prova que a feature funciona.
4. **Revise o próprio diff como adversário** (`git diff`), com o
   [checklist de revisão](references/review-checklist.md).

Algo falhou? Volte à fase certa. Não vá para a fase 6 com vermelho que você
não sabe explicar.

## 6. Entregar e relatar

- Commit com mensagem que explica o **porquê** (o diff já mostra o quê),
  seguindo a convenção do repositório (`git log --oneline -10`).
- Git com cuidado: nunca reescreva histórico de branch alheio, nunca use
  `--force` sem `--with-lease`, olhe o alvo antes de apagar ou sobrescrever.
- Relatório final curto e honesto, neste formato:

  ```markdown
  **Mudança:** <o que mudou e por quê, com arquivo:linha>
  **Verificação:** <comandos rodados → resultado real (ex.: 42 testes ok)>
  **Não verificado:** <checagens puladas, cenários não testados, falhas pré-existentes>
  **Para revisar:** <decisões ou riscos que pedem um olho humano>
  ```

Nunca diga "deve funcionar". Diga o que rodou e o que viu. Se pulou uma etapa,
diga que pulou.

## Sinais de alerta — pare se perceber que está fazendo

| Sinal | Correção |
|---|---|
| Editando antes de ler quem chama o código | Volte à fase 1 |
| "Corrigi" sem ter visto o erro acontecer | Volte à fase 2 |
| Terceira tentativa do mesmo tipo de fix | Pare e siga o guia de depuração |
| Diff tocando arquivos que a tarefa não menciona | Reverta o excesso |
| Teste ajustado para aceitar o comportamento novo | Justifique, ou o bug é seu |
| Relatório sem nenhum comando executado | Você não verificou — verifique |
