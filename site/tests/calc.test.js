"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const calc = require("../calc.js");

const perto = (atual, esperado, tolerancia = 0.01) =>
  assert.ok(
    Math.abs(atual - esperado) <= tolerancia,
    `esperado ${esperado}, recebido ${atual}`
  );

test("lerNumeroBR entende o formato brasileiro e rejeita lixo", () => {
  assert.equal(calc.lerNumeroBR("1.234,56"), 1234.56);
  assert.equal(calc.lerNumeroBR("12,4"), 12.4);
  assert.equal(calc.lerNumeroBR("3000"), 3000);
  assert.equal(calc.lerNumeroBR("3.000"), 3000);
  assert.equal(calc.lerNumeroBR("1.000.000"), 1000000);
  assert.equal(calc.lerNumeroBR("R$ 2.500"), 2500);
  assert.equal(calc.lerNumeroBR("12.4"), 12.4);
  assert.equal(calc.lerNumeroBR("13%"), 13);
  assert.ok(Number.isNaN(calc.lerNumeroBR("")));
  assert.ok(Number.isNaN(calc.lerNumeroBR("abc")));
  assert.ok(Number.isNaN(calc.lerNumeroBR(null)));
});

test("valorNaFrase acha o valor em reais e ignora parcelas, prazos e taxas", () => {
  assert.equal(calc.valorNaFrase("posso comprar um celular de r$ 3.000?", 0), 3000);
  assert.equal(calc.valorNaFrase("quanto rendem r$ 5 mil?", 0), 5000);
  assert.equal(calc.valorNaFrase("uma tv de 2,5 mil", 0), 2500);
  assert.equal(calc.valorNaFrase("r$ 3.000, posso?", 0), 3000);
  assert.equal(calc.valorNaFrase("posso comprar um celular em 12x?", 999), 999);
  assert.equal(calc.valorNaFrase("em 12 vezes, um celular de 3 mil", 0), 3000);
  assert.equal(calc.valorNaFrase("guardar por 6 meses", 999), 999);
  assert.equal(calc.valorNaFrase("quanto rende em 1 mes", 999), 999);
  assert.equal(calc.valorNaFrase("por 1 ano ou 2 dias", 999), 999);
  assert.equal(calc.valorNaFrase("em 10 parcelas, uma tv de 2 mil", 0), 2000);
  assert.equal(calc.valorNaFrase("rende 100% do cdi?", 999), 999);
  assert.equal(calc.valorNaFrase("caí no rotativo", 999), 999);
  assert.equal(calc.valorNaFrase("custa 0", 999), 999);
});

test("aliquotaIR segue a tabela regressiva nas fronteiras", () => {
  assert.equal(calc.aliquotaIR(1), 0.225);
  assert.equal(calc.aliquotaIR(180), 0.225);
  assert.equal(calc.aliquotaIR(181), 0.2);
  assert.equal(calc.aliquotaIR(360), 0.2);
  assert.equal(calc.aliquotaIR(361), 0.175);
  assert.equal(calc.aliquotaIR(720), 0.175);
  assert.equal(calc.aliquotaIR(721), 0.15);
});

test("rendimentoCDI desconta o IR do prazo", () => {
  const r = calc.rendimentoCDI({ valor: 1000, cdiAnual: 0.1, meses: 12 });
  perto(r.bruto, 100);
  assert.equal(r.aliquota, 0.175);
  perto(r.liquido, 82.5);

  const seisMeses = calc.rendimentoCDI({ valor: 1000, cdiAnual: 0.1, meses: 6 });
  assert.equal(seisMeses.aliquota, 0.2); // 183 dias
});

test("rendimentoPoupanca troca de regra com Selic em 8,5%", () => {
  perto(calc.rendimentoPoupanca({ valor: 1000, selicAnual: 0.12, meses: 12 }), 61.68);
  perto(calc.rendimentoPoupanca({ valor: 1000, selicAnual: 0.07, meses: 12 }), 49);
});

test("prestacaoPrice bate com a tabela e trata juro zero", () => {
  perto(calc.prestacaoPrice(1000, 0.01, 12), 88.85);
  assert.equal(calc.prestacaoPrice(1200, 0, 12), 100);
  assert.equal(calc.prestacaoPrice(1000, 0.01, 0), 0);
});

test("custoRotativo respeita o teto legal de 100% da dívida", () => {
  assert.equal(calc.custoRotativo(1500, 0.13, 12), 1500);
  perto(calc.custoRotativo(1000, 0.13, 1), 130);
  assert.equal(calc.custoRotativo(0, 0.13, 12), 0);
});

test("simularTroca soma tarifas, rendimento perdido e juros evitados", () => {
  const r = calc.simularTroca({
    tarifaMensal: 39.9,
    anuidade: 420,
    saldoParado: 3000,
    dividaRotativo: 1500,
    gastoCartaoMensal: 2500,
    cdiAnual: 0.124,
    jurosRotativoMensal: 0.13,
  });
  perto(r.tarifas, 898.8);
  perto(r.rendimentoPerdido, 306.9);
  assert.equal(r.jurosBanco, 1500);
  perto(r.jurosTino, 1500 * (12 * 0.039 / (1 - Math.pow(1.039, -12))) - 1500);
  perto(r.economia, r.tarifas + r.rendimentoPerdido + r.jurosBanco - r.jurosTino);
  perto(r.lucroTino, 3000 * 0.018 + 2500 * 12 * 0.011 + r.jurosTino * 0.4);
  assert.ok(r.economia > r.lucroTino, "o cliente precisa ganhar mais que a Tino");
});

test("simularTroca não gera NaN com campos vazios ou negativos", () => {
  const r = calc.simularTroca({
    tarifaMensal: NaN,
    anuidade: -10,
    saldoParado: undefined,
    dividaRotativo: 0,
    gastoCartaoMensal: NaN,
  });
  for (const [campo, valor] of Object.entries(r)) {
    assert.ok(Number.isFinite(valor), `${campo} não é finito`);
  }
  assert.equal(r.economia, 0);
  assert.equal(r.lucroTino, 0);
});

test("simularTroca não cobra juros da Tino quando o banco atual é mais barato", () => {
  const r = calc.simularTroca({ dividaRotativo: 1000, jurosRotativoMensal: 0.01 });
  assert.equal(r.economiaJuros, 0);
  assert.equal(r.lucroCredito, 0);
});

test("unitEconomics fecha com as receitas publicadas", () => {
  const u = calc.unitEconomics();
  perto(u.arpu, 46.3);
  perto(u.margem, 26.8);
  perto(u.ltv, 26.8 / 0.015);
  perto(u.paybackMeses, 60 / 26.8);
  assert.ok(u.ltvCac > 3);
});

test("reciboMensal da Marina soma as linhas arredondadas", () => {
  const r = calc.reciboMensal();
  perto(r.linhas[0].valor, 9.36);
  perto(r.linhas[1].valor, 27.5);
  perto(r.total, 41.37);
});

test("mesesParaMeta cobre meta batida e poupança zero", () => {
  assert.equal(calc.mesesParaMeta(2760, 888), 4);
  assert.equal(calc.mesesParaMeta(0, 888), 0);
  assert.equal(calc.mesesParaMeta(100, 0), Infinity);
});

test("formatBRL usa o padrão brasileiro", () => {
  assert.equal(calc.formatBRL(1234.5).replace(/\s/g, " "), "R$ 1.234,50");
  assert.equal(calc.formatBRLInteiro(2299.4).replace(/\s/g, " "), "R$ 2.299");
});
