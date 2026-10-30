/*
 * Cálculos financeiros e modelo de negócio da Tino.
 * Funções puras: rodam no navegador (window.TinoCalc) e no Node (testes).
 */
(function (root) {
  "use strict";

  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const brlInteiro = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
  const numero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

  // Premissas usadas no simulador, no chat e nos gráficos. Valores ilustrativos.
  const PREMISSAS = {
    cdiAnual: 0.124,
    jurosRotativoMensal: 0.13,
    jurosParcelamentoTino: 0.039, // CET mensal do parcelamento que substitui o rotativo
    spreadCaixinha: 0.018, // ganho líquido anual da Tino sobre o saldo investido
    intercambio: 0.011, // receita líquida de intercâmbio sobre o gasto no cartão
    margemCredito: 0.4, // fatia dos juros que sobra após funding, perdas e impostos
  };

  // Receita mensal por cliente ativo, por linha de negócio (R$). Projeção ilustrativa.
  const RECEITAS = [
    { linha: "Crédito parcelado e Pix parcelado", valor: 14.2, nota: "Juros menores que o rotativo, com menos calote porque a IA parcela antes do atraso." },
    { linha: "Spread da Caixinha", valor: 9.8, nota: "A Tino paga 100% do CDI ao cliente e empresta esse dinheiro com margem." },
    { linha: "Tino Negócios (MEI e PME)", valor: 6.9, nota: "Assinatura do CFO de IA, cobrança automática e antecipação de recebíveis, rateadas pela base." },
    { linha: "Intercâmbio do cartão", valor: 5.1, nota: "Pago pela bandeira e pelo lojista a cada compra. O cliente não paga nada." },
    { linha: "Assinatura Tino Pro", valor: 4.3, nota: "R$ 19,90 por mês, ou grátis para quem deixa R$ 15 mil investidos." },
    { linha: "Clube de compra coletiva", valor: 3.4, nota: "Comissão paga por operadoras e seguradoras pelos clientes que a IA leva em bloco." },
    { linha: "Taxa de sucesso do Negociador", valor: 2.6, nota: "20% da economia do primeiro ano. Sem economia, sem cobrança." },
  ];

  // Custo mensal para servir um cliente ativo (R$). Estimativas ilustrativas.
  const CUSTO_SERVIR = [
    { linha: "Banco com agências", valor: 25 },
    { linha: "Banco digital comum", valor: 5.5 },
    { linha: "Tino (meta)", valor: 1.9, destaque: true },
  ];

  const CUSTOS_TINO = {
    custoServir: 1.9,
    perdas: 7.6,
    fundingImpostos: 10,
    churnMensal: 0.015,
    cac: 60,
  };

  // Cliente de exemplo usada no chat e no recibo de lucro.
  const MARINA = {
    nome: "Marina",
    renda: 4800,
    gastoMes: 3912,
    caixinha: 6240,
    metaNome: "Viagem para Recife",
    meta: 9000,
    gastoCartaoMensal: 2500,
    jurosPixParcelado: 4.51,
    contas: [
      { nome: "Internet 500 Mega", atual: 149.9, mercado: 99.9 },
      { nome: "Plano de celular", atual: 89.9, mercado: 54.9 },
      { nome: "Seguro do carro", atual: 212, mercado: 171 },
    ],
  };

  function positivo(v) {
    return Number.isFinite(v) && v > 0 ? v : 0;
  }

  function formatBRL(valor) {
    return brl.format(valor);
  }

  function formatBRLInteiro(valor) {
    return brlInteiro.format(Math.round(valor));
  }

  function formatNumero(valor) {
    return numero.format(valor);
  }

  // Aceita "1.234,56", "12,4", "3000", "3.000", "R$ 2.500" e "12.4".
  function lerNumeroBR(texto) {
    if (typeof texto === "number") return texto;
    let s = String(texto ?? "").replace(/[R$\s %]/g, "");
    if (s === "") return NaN;
    if (s.includes(",")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, "");
    }
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
  }

  // Primeiro valor em reais citado numa frase ("R$ 3.000", "5 mil"). Números que
  // contam parcelas, prazos ou taxas ("12x", "6 meses", "100%") não são preço.
  function valorNaFrase(texto, padrao) {
    const numeros = String(texto).matchAll(
      /(\d[\d.,]*)\s*(mil\b|k\b|x\b|vezes\b|parcelas?\b|mes(?:es)?\b|anos?\b|dias?\b|%)?/gi
    );
    for (const [, digitos, sufixo = ""] of numeros) {
      const unidade = sufixo.toLowerCase();
      if (unidade && unidade !== "mil" && unidade !== "k") continue;
      const v = lerNumeroBR(digitos.replace(/[.,]+$/, ""));
      if (!Number.isFinite(v) || v <= 0) continue;
      return unidade ? v * 1000 : v;
    }
    return padrao;
  }

  // Tabela regressiva do IR sobre renda fixa (Lei 11.033/2004).
  function aliquotaIR(dias) {
    if (dias <= 180) return 0.225;
    if (dias <= 360) return 0.2;
    if (dias <= 720) return 0.175;
    return 0.15;
  }

  function rendimentoCDI({ valor, cdiAnual, percentualCdi = 1, meses }) {
    const v = positivo(valor);
    const taxa = positivo(cdiAnual) * percentualCdi;
    const bruto = v * (Math.pow(1 + taxa, positivo(meses) / 12) - 1);
    const aliquota = aliquotaIR(Math.round((positivo(meses) * 365) / 12));
    const ir = bruto * aliquota;
    return { bruto, ir, liquido: bruto - ir, aliquota };
  }

  // Poupança: 0,5% a.m. + TR com Selic acima de 8,5% a.a.; senão 70% da Selic + TR. Isenta de IR.
  function rendimentoPoupanca({ valor, selicAnual, meses, trMensal = 0 }) {
    const base =
      selicAnual > 0.085 ? 0.005 : Math.pow(1 + positivo(selicAnual) * 0.7, 1 / 12) - 1;
    return positivo(valor) * (Math.pow(1 + base + trMensal, positivo(meses)) - 1);
  }

  // Prestação pela Tabela Price.
  function prestacaoPrice(principal, taxaMensal, parcelas) {
    if (parcelas <= 0) return 0;
    if (taxaMensal === 0) return principal / parcelas;
    return (principal * taxaMensal) / (1 - Math.pow(1 + taxaMensal, -parcelas));
  }

  function jurosParcelamento(principal, taxaMensal, parcelas) {
    const p = positivo(principal);
    if (p === 0) return 0;
    return prestacaoPrice(p, taxaMensal, parcelas) * parcelas - p;
  }

  // Desde jan/2024, juros e encargos do cartão não podem passar de 100% da dívida (Lei 14.690/2023).
  function custoRotativo(divida, jurosMensal, meses) {
    const d = positivo(divida);
    const juros = d * (Math.pow(1 + positivo(jurosMensal), positivo(meses)) - 1);
    return Math.min(juros, d);
  }

  // Quanto o cliente perde por ano no banco atual e quanto a Tino lucraria com ele.
  function simularTroca(entrada, premissas = PREMISSAS) {
    const tarifaMensal = positivo(entrada.tarifaMensal);
    const anuidade = positivo(entrada.anuidade);
    const saldoParado = positivo(entrada.saldoParado);
    const dividaRotativo = positivo(entrada.dividaRotativo);
    const gastoCartaoMensal = positivo(entrada.gastoCartaoMensal);
    const cdiAnual = positivo(entrada.cdiAnual ?? premissas.cdiAnual);
    const jurosRotativoMensal = positivo(entrada.jurosRotativoMensal ?? premissas.jurosRotativoMensal);

    const tarifas = tarifaMensal * 12 + anuidade;
    const rendimentoPerdido = rendimentoCDI({ valor: saldoParado, cdiAnual, meses: 12 }).liquido;
    const jurosBanco = custoRotativo(dividaRotativo, jurosRotativoMensal, 12);
    const jurosTino = jurosParcelamento(dividaRotativo, premissas.jurosParcelamentoTino, 12);
    const economiaJuros = Math.max(jurosBanco - jurosTino, 0);
    const economia = tarifas + rendimentoPerdido + economiaJuros;

    const lucroCaixinha = saldoParado * premissas.spreadCaixinha;
    const lucroCartao = gastoCartaoMensal * 12 * premissas.intercambio;
    // O cliente só leva a dívida para a Tino se ela ficar mais barata.
    const lucroCredito = economiaJuros > 0 ? jurosTino * premissas.margemCredito : 0;
    const lucroTino = lucroCaixinha + lucroCartao + lucroCredito;

    return {
      tarifas,
      rendimentoPerdido,
      jurosBanco,
      jurosTino,
      economiaJuros,
      economia,
      lucroCaixinha,
      lucroCartao,
      lucroCredito,
      lucroTino,
    };
  }

  function unitEconomics(receitas = RECEITAS, custos = CUSTOS_TINO) {
    const arpu = receitas.reduce((soma, r) => soma + r.valor, 0);
    const margem = arpu - custos.custoServir - custos.perdas - custos.fundingImpostos;
    const vidaMeses = 1 / custos.churnMensal;
    const ltv = margem * vidaMeses;
    return {
      arpu,
      margem,
      vidaMeses,
      ltv,
      cac: custos.cac,
      ltvCac: ltv / custos.cac,
      paybackMeses: custos.cac / margem,
    };
  }

  // O que a Tino ganhou com a Marina no último mês: a base do "recibo de lucro".
  function reciboMensal(cliente = MARINA, premissas = PREMISSAS) {
    const linhas = [
      { item: "Spread da Caixinha", valor: (cliente.caixinha * premissas.spreadCaixinha) / 12 },
      { item: "Intercâmbio do cartão", valor: cliente.gastoCartaoMensal * premissas.intercambio },
      { item: "Juros do Pix parcelado", valor: cliente.jurosPixParcelado },
      { item: "Taxa do Negociador", valor: 0 },
      { item: "Tarifas", valor: 0 },
    ];
    const total = linhas.reduce((soma, l) => soma + Math.round(l.valor * 100) / 100, 0);
    return { linhas, total };
  }

  // Meses para completar uma meta guardando um valor fixo por mês.
  function mesesParaMeta(falta, guardaPorMes) {
    if (falta <= 0) return 0;
    if (guardaPorMes <= 0) return Infinity;
    return Math.ceil(falta / guardaPorMes);
  }

  const api = {
    PREMISSAS,
    RECEITAS,
    CUSTO_SERVIR,
    CUSTOS_TINO,
    MARINA,
    formatBRL,
    formatBRLInteiro,
    formatNumero,
    lerNumeroBR,
    valorNaFrase,
    aliquotaIR,
    rendimentoCDI,
    rendimentoPoupanca,
    prestacaoPrice,
    jurosParcelamento,
    custoRotativo,
    simularTroca,
    unitEconomics,
    reciboMensal,
    mesesParaMeta,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.TinoCalc = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
