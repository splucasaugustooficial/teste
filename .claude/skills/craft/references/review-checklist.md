# Checklist de revisão adversarial

Leia o `git diff` inteiro com estas perguntas. Uma resposta "não sei" é um
sinal para investigar, não para seguir.

## Correção
- A mudança resolve exatamente o pedido — nem menos, nem mais?
- Qual entrada faz este código quebrar? (vazio, nulo, enorme, negativo,
  duplicado, Unicode, concorrência, timeout)
- Todo caminho de erro termina em tratamento ou propagação com contexto?
- Há off-by-one, comparação invertida, `await` faltando, mutação compartilhada?
- O comportamento antigo que alguém pode depender continua igual?

## Segurança
- Entrada externa chega a SQL, shell, HTML, path ou `eval` sem validação?
- Algum segredo, token ou dado pessoal entrou em código, log ou teste?
- Permissões e autenticação continuam checadas no caminho novo?

## Testes
- Existe um teste que falharia se a mudança fosse revertida?
- Os testes verificam comportamento, não detalhes de implementação?
- Algum teste foi pulado, apagado ou afrouxado? Se sim, por quê?

## Clareza
- Os nomes dizem o que as coisas são, no vocabulário do projeto?
- Há código morto, debug esquecido (`console.log`, `print`) ou TODO sem dono?
- Um colega entenderia o diff sem você explicando?

## Escopo
- Todo arquivo alterado é necessário para a tarefa?
- Reformatação ou refatoração não relacionada? Separe.
- Dependência nova? Ela se justifica frente ao que já existe no projeto?
