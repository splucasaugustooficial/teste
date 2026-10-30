---
name: craft
description: Fluxo de engenharia de nível sênior para qualquer mudança de código não trivial — entender antes de tocar, provar o bug antes de corrigir, mudar o mínimo, verificar com as checagens reais do projeto e relatar com honestidade. Use sempre que for implementar uma feature, corrigir um bug, refatorar, investigar uma falha de CI ou teste, ou quando o usuário pedir "faça direito", "com qualidade", "nível produção", "sem quebrar nada" ou invocar /craft. Não use para perguntas que se respondem sem mexer em código.
---

# Craft — engenharia que merece estrela

Código bom não é o que parece inteligente: é o que **funciona, é verificado e
qualquer pessoa entende amanhã**. Este fluxo existe porque os erros mais caros
de um agente são sempre os mesmos — corrigir o problema errado, mudar demais,
declarar vitória sem rodar nada, e esconder o que deu errado. Cada fase abaixo
fecha uma dessas portas.

Escale o rigor ao tamanho da tarefa: um typo não precisa de plano; uma mudança
em fluxo de pagamento precisa de tudo. Na dúvida, prefira o rigor.

## 1. Entender (antes de editar qualquer coisa)

- Reformule o pedido em uma frase: *o que deve ser verdade quando eu terminar?*
  Se não conseguir, a tarefa ainda está ambígua — resolva lendo o código; só
  pergunte ao usuário o que o código não responde.
- Leia o código ao redor do ponto de mudança, os chamadores e os testes
  existentes. Procure convenções: nomes, tratamento de erro, estilo de teste,
  densidade de comentários. Seu código deve parecer escrito pela mesma pessoa.
- Descubra as checagens reais do projeto:

  ```bash
  bash .claude/skills/craft/scripts/checks.sh
  ```

  O script lê `package.json`, `pyproject.toml`, `Makefile`, `Cargo.toml`,
  `go.mod`, workflows de CI etc. e lista os comandos de lint, typecheck e teste.
  Rode-os **antes** de mudar algo para saber o estado de partida — uma falha
  pré-existente não é sua, mas precisa ser reportada.

## 2. Provar (bugs e falhas de CI)

Não corrija o que você não reproduziu.

- Escreva o teste (ou comando) que falha **pelo motivo certo** antes do fix.
- Encontre a causa raiz, não o sintoma: pergunte "por quê?" até chegar a algo
  que, mudado, torna o bug impossível — não só improvável.
- Se não conseguir reproduzir, diga isso explicitamente e explique o que o fix
  pressupõe.

## 3. Planejar (mudanças com mais de um arquivo ou decisão de design)

Antes de codar, escreva para si: arquivos tocados, a abordagem e a alternativa
descartada (com o porquê). Se o plano exige mudar uma API pública, um schema
ou algo difícil de reverter, confirme com o usuário primeiro.

## 4. Implementar — o mínimo correto

- **Diff mínimo.** Só o que a tarefa exige. Refatorações "aproveitando a
  viagem", renomes e reformatação de arquivo inteiro viram PR separado.
- **Reuse antes de criar.** Procure um helper existente antes de escrever um.
- **Erros explícitos.** Nada de `catch` vazio, `|| true` ou valor default que
  esconde falha. Se algo pode falhar, trate ou propague com contexto.
- **Sem segredos, sem gambiarras de teste.** Nunca desative, pule ou afrouxe um
  teste para ficar verde. Nunca escreva credenciais em código.
- **Bordas.** Pense em vazio, nulo, enorme, concorrente, Unicode, fuso horário
  e falha de rede — o que se aplicar.
- Comentários explicam *por quê*, nunca *o quê*.

## 5. Verificar — evidência, não esperança

1. Rode as checagens descobertas na fase 1 (`checks.sh --run` roda todas).
2. Rode o teste que provava o bug: agora ele passa.
3. Exercite a mudança de verdade quando der (rode o CLI, suba o servidor, abra
   a página). Teste passando não prova que a feature funciona.
4. **Revisão adversarial do próprio diff** (`git diff`): leia como um revisor
   que quer rejeitar. Use o checklist em
   [references/review-checklist.md](references/review-checklist.md).

Se algo falhar, volte à fase certa. Não vá para a fase 6 com vermelho
desconhecido.

## 6. Entregar e relatar

- Commit com mensagem que explica o **porquê** (o diff já mostra o quê).
  Siga a convenção do repositório (veja `git log`).
- Relatório final curto e honesto:
  - **O que mudou** e por quê, com `arquivo:linha`.
  - **Como foi verificado** — os comandos rodados e o resultado real.
  - **O que não foi feito ou verificado** e qualquer falha pré-existente.
  - **Riscos** ou decisões que o usuário deveria revisar.

Nunca diga "deve funcionar". Diga o que rodou e o que viu. Se pulou uma etapa,
diga que pulou.

## Antipadrões (pare se perceber que está fazendo)

| Sinal | Correção |
|---|---|
| Editando antes de ler os chamadores | Volte à fase 1 |
| "Corrigi" sem ter visto o erro acontecer | Volte à fase 2 |
| Diff tocando arquivos que a tarefa não menciona | Reverta o excesso |
| Terceira tentativa do mesmo tipo de fix | Pare e reexamine a causa raiz |
| Teste ajustado para aceitar o comportamento novo sem justificar | Questione se o comportamento está certo |
| Relatório sem nenhum comando executado | Você não verificou — verifique |
