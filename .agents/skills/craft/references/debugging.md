# Depuração por causa raiz

Use quando a causa não for óbvia em poucos minutos, ou quando um fix não
funcionou. Chutar fixes em sequência é o modo mais caro de depurar: cada
tentativa falha muda o sistema e apaga pistas.

## 1. Fixe o sintoma

- Copie a mensagem de erro **inteira**, com stack trace. Leia de baixo para
  cima até o primeiro frame que é código do projeto.
- Ache o menor comando que reproduz o problema e rode-o duas vezes. Se só
  falha às vezes, suspeite de ordem, tempo, estado compartilhado ou rede.
- Anote: esperado × obtido, com valores concretos.

## 2. Reduza o espaço de busca

- **Funcionava antes?** `git log -p -- <arquivo>` e `git bisect` encontram o
  commit culpado mecanicamente.
- **Funciona em outro lugar?** Compare versões (`node -v`, `python -V`,
  lockfile), variáveis de ambiente e configuração. A diferença é a pista.
- **Corte pela metade.** Comente metade da entrada, do pipeline ou do teste;
  veja de que lado o erro mora; repita.

## 3. Formule hipóteses que podem falhar

Escreva: *"se a causa for X, então ao fazer Y eu verei Z."* Depois faça Y.

- Prefira o experimento que **descarta** mais hipóteses de uma vez.
- Observe em vez de supor: um `print`/log do valor real no ponto suspeito vale
  mais que dez minutos lendo código. Remova-os depois.
- Uma hipótese confirmada explica **todos** os sintomas. Se sobra um sintoma
  sem explicação, ainda não é a causa raiz.

## 4. Pergunte "por quê?" até o fim

O sintoma é `TypeError: undefined`. Por quê? O campo veio vazio. Por quê? A API
devolve `null` para usuários antigos. Por quê? A migração não preencheu o
campo. O fix certo está no nível em que o bug passa a ser **impossível**, não
só improvável — e às vezes são dois fixes: a causa e uma defesa no sintoma.

## 5. Feche o ciclo

- O teste que reproduzia o bug agora passa — e falha se o fix for revertido.
- Procure o mesmo padrão em outros lugares (`grep`): bugs vêm em família.
- No relatório, conte a causa raiz em uma frase. Se não conseguiu achá-la,
  diga isso e o que o fix pressupõe.

## Armadilhas comuns

| Sintoma | Suspeite de |
|---|---|
| Passa local, falha no CI | versão, fuso, locale, ordem dos testes, cache, segredo ausente |
| Falha só às vezes | concorrência, tempo/timeout, estado vazando entre testes, rede |
| "Impossível, esse código nem roda" | build antigo, cache, arquivo errado sendo importado |
| Erro longe da causa | dado inválido aceito cedo demais; valide na entrada |
| Funciona com um item, quebra com muitos | off-by-one, paginação, limite, ordenação instável |
