// Demo offline: loja local + piloto roteirizado. Mostra o loop inteiro (snapshot,
// REA vendo a rede, nota com evidência, portão negando a compra, done verificado)
// sem precisar de chave de API.
import { lastEvidence, refFor, ScriptedModel } from './models.mjs';

export const DEMO_TASK =
  'Descubra o preço do Teclado Mecânico e de onde vem a informação de estoque; coloque-o no carrinho e finalize a compra.';

export function demoPilot() {
  let snapObs, reaEv;
  return new ScriptedModel([
    () => ({ name: 'todo', input: { items: [
      { content: 'Achar o Teclado Mecânico', status: 'in_progress' },
      { content: 'Descobrir a origem do estoque com o REA', status: 'pending' },
      { content: 'Adicionar ao carrinho e finalizar', status: 'pending' },
    ] } }),
    (_, msgs) => ({ name: 'navigate', input: { url: msgs[0].content.match(/Página inicial: (\S+)/)[1] + '/produtos' } }),
    (t) => ({ name: 'click', input: { ref: refFor(t, 'Teclado Mecânico') } }),
    (t) => {
      snapObs = lastEvidence(t);
      return { name: 'rea_inspect', input: { observation_ms: 800 } };
    },
    (t) => {
      reaEv = lastEvidence(t, 'ev');
      const api = t.match(/GET (\S+\/api\/estoque\/\d+)/);
      return [
        { name: 'note', input: { fact: 'Preço: R$ 349,90', evidence: snapObs } },
        { name: 'note', input: { fact: `Estoque vem de ${api ? api[1] : '(não observado)'} via fetch`, evidence: reaEv } },
        { name: 'snapshot', input: {} },
      ];
    },
    (t) => ({ name: 'click', input: { ref: refFor(t, 'Adicionar ao carrinho') } }),
    (t) => ({ name: 'click', input: { ref: refFor(t, 'Finalizar compra') } }),
    (t) => {
      const denied = /Negado|Bloqueado/.test(t);
      return {
        name: 'done',
        input: {
          status: denied ? 'blocked' : 'completed',
          answer: denied
            ? 'Teclado Mecânico custa R$ 349,90; o estoque é carregado por fetch em /api/estoque/1 (não está no HTML). Coloquei no carrinho, mas a finalização da compra precisa da sua aprovação.'
            : 'Teclado Mecânico custa R$ 349,90; estoque vem de /api/estoque/1. Compra finalizada com sua aprovação.',
          evidence: [snapObs, reaEv],
        },
      };
    },
  ]);
}
