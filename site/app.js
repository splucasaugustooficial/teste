(function () {
  "use strict";

  const C = window.TinoCalc;
  const M = C.MARINA;
  const brl = C.formatBRL;
  const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
  const reduzMovimento = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Premissas que o visitante pode mudar no simulador e que o chat também usa.
  const estado = {
    cdiAnual: C.PREMISSAS.cdiAnual,
    jurosRotativoMensal: C.PREMISSAS.jurosRotativoMensal,
  };

  function el(tag, classe, texto) {
    const n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  /* ---------- Menu ---------- */

  function iniciarMenu() {
    const botao = $("#menu-btn");
    const menu = $("#menu");
    const fechar = () => {
      menu.classList.remove("aberto");
      botao.setAttribute("aria-expanded", "false");
    };
    botao.addEventListener("click", () => {
      const aberto = menu.classList.toggle("aberto");
      botao.setAttribute("aria-expanded", String(aberto));
    });
    menu.addEventListener("click", (e) => {
      if (e.target.closest("a")) fechar();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && menu.classList.contains("aberto")) {
        fechar();
        botao.focus();
      }
    });
  }

  /* ---------- Azulejos do hero (Truchet) ---------- */

  const Azulejos = (function () {
    const canvas = $("#azulejo");
    const ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
    let tam = 60;
    let largura = 0;
    let altura = 0;
    let pecas = [];
    let cores = {};
    let rodando = false;
    let visivel = true;

    // Pseudoaleatório estável: o desenho não muda a cada recarga.
    function hash(n) {
      const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    }

    function lerCores() {
      const s = getComputedStyle(document.documentElement);
      cores = {
        linha: s.getPropertyValue("--azulejo").trim(),
        brilho: s.getPropertyValue("--azulejo-brilho").trim(),
      };
    }

    function medir() {
      const r = canvas.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      largura = r.width;
      altura = r.height;
      canvas.width = Math.round(largura * dpr);
      canvas.height = Math.round(altura * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      tam = largura < 640 ? 44 : 60;
      const cols = Math.ceil(largura / tam);
      const linhas = Math.ceil(altura / tam);
      pecas = [];
      for (let l = 0; l < linhas; l++) {
        for (let c = 0; c < cols; c++) {
          const giro = Math.floor(hash(l * 97 + c) * 4);
          pecas.push({ c, l, ang: giro, alvo: giro, brilho: 0, inicio: 0, pendente: false });
        }
      }
      desenhar();
    }

    function tracarPeca(p) {
      const m = tam / 2;
      ctx.save();
      ctx.translate(p.c * tam + m, p.l * tam + m);
      ctx.rotate((p.ang * Math.PI) / 2);
      ctx.translate(-m, -m);
      ctx.beginPath();
      ctx.arc(0, 0, m, 0, Math.PI / 2);
      ctx.moveTo(tam, m);
      ctx.arc(tam, tam, m, -Math.PI / 2, Math.PI, true);
      ctx.stroke();
      ctx.restore();
    }

    function desenhar() {
      if (!ctx) return;
      ctx.clearRect(0, 0, largura, altura);
      ctx.lineCap = "round";

      // Rejunte e os pontos onde quatro azulejos se encontram.
      ctx.strokeStyle = cores.linha;
      ctx.fillStyle = cores.linha;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      for (let x = tam; x < largura; x += tam) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, altura);
      }
      for (let y = tam; y < altura; y += tam) {
        ctx.moveTo(0, y);
        ctx.lineTo(largura, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      for (let x = tam; x < largura; x += tam) {
        for (let y = tam; y < altura; y += tam) {
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.lineWidth = tam < 50 ? 2.5 : 3;
      ctx.strokeStyle = cores.linha;
      for (const p of pecas) tracarPeca(p);

      ctx.strokeStyle = cores.brilho;
      for (const p of pecas) {
        if (p.brilho <= 0) continue;
        ctx.globalAlpha = p.brilho;
        tracarPeca(p);
      }
      ctx.globalAlpha = 1;
    }

    function quadro(agora) {
      let ativo = false;
      for (const p of pecas) {
        if (p.pendente) {
          if (agora < p.inicio) {
            ativo = true;
            continue;
          }
          p.alvo += 1;
          p.brilho = 1;
          p.pendente = false;
        }
        const falta = p.alvo - p.ang;
        if (falta > 0.002) {
          p.ang += falta * 0.14;
          ativo = true;
        } else {
          p.ang = p.alvo;
        }
        if (p.brilho > 0.02) {
          p.brilho *= 0.955;
          ativo = true;
        } else {
          p.brilho = 0;
        }
      }
      desenhar();
      if (ativo) {
        requestAnimationFrame(quadro);
      } else {
        rodando = false;
      }
    }

    function animar() {
      if (rodando) return;
      rodando = true;
      requestAnimationFrame(quadro);
    }

    // Uma onda de azulejos girando a partir de um ponto: a IA "pensando".
    function pensar(origem) {
      if (!ctx || !pecas.length || reduzMovimento.matches) return;
      const agora = performance.now();
      const ox = origem ? origem.x : largura * 0.75;
      const oy = origem ? origem.y : altura / 2;
      for (const p of pecas) {
        const d = Math.hypot(p.c * tam + tam / 2 - ox, p.l * tam + tam / 2 - oy);
        if (d > 520 || Math.random() > 0.45) continue;
        p.inicio = agora + d * 1.4;
        p.pendente = true;
      }
      animar();
    }

    function origemDe(elemento) {
      if (!canvas || !elemento) return null;
      const a = canvas.getBoundingClientRect();
      const b = elemento.getBoundingClientRect();
      return { x: b.left - a.left + b.width / 2, y: b.top - a.top + b.height / 2 };
    }

    function iniciar() {
      if (!ctx) return;
      lerCores();
      medir();
      let espera;
      new ResizeObserver(() => {
        clearTimeout(espera);
        espera = setTimeout(medir, 120);
      }).observe(canvas);

      const aoMudarTema = () => {
        lerCores();
        desenhar();
      };
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", aoMudarTema);
      new MutationObserver(aoMudarTema).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });

      new IntersectionObserver((entradas) => {
        visivel = entradas[0].isIntersecting;
      }).observe(canvas);

      // Movimento ambiente: um azulejo gira de vez em quando.
      setInterval(() => {
        if (!visivel || document.hidden || reduzMovimento.matches || !pecas.length) return;
        const p = pecas[Math.floor(Math.random() * pecas.length)];
        p.inicio = 0;
        p.pendente = true;
        animar();
      }, 1400);

      if (!reduzMovimento.matches) setTimeout(() => pensar(origemDe($("#chat"))), 400);
    }

    return { iniciar, pensar, origemDe };
  })();

  /* ---------- Chat de demonstração ---------- */

  function normalizar(texto) {
    return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  const valorNaFrase = C.valorNaFrase;
  const pct = (taxa) => `${C.formatNumero(taxa * 100)}%`;
  const cetTino = `${pct(C.PREMISSAS.jurosParcelamentoTino)} a.m.`;

  const sobraMensal = M.renda - M.gastoMes;
  const faltaMeta = M.meta - M.caixinha;

  const RESPOSTAS = [
    {
      chave: /lucr|ganha (dinheiro|comigo|com voce|com isso)|como voces ganham/,
      responder() {
        const r = C.reciboMensal();
        return {
          texto: `Transparência é regra aqui. No último mês, a Tino ganhou ${brl(r.total)} com você:`,
          linhas: r.linhas.filter((l) => l.valor > 0).map((l) => [l.item, brl(l.valor)]),
          depois: "O Negociador não cobrou nada porque ainda não fechou acordo, e tarifa você não paga. Esse recibo chega todo mês no app.",
        };
      },
    },
    {
      chave: /rotativo|fatura|divida|atrasad|nao consigo pagar/,
      responder(texto) {
        const informada = valorNaFrase(texto, 0);
        const divida = informada || 1340;
        const juros = C.custoRotativo(divida, estado.jurosRotativoMensal, 12);
        const parcela = C.prestacaoPrice(divida, C.PREMISSAS.jurosParcelamentoTino, 12);
        const totalTino = parcela * 12;
        const abertura = informada
          ? `Calma, dá para resolver. Considerei ${brl(divida)} em aberto.`
          : `Calma, dá para resolver. Pela sua fatura aberta, faltam ${brl(divida)}.`;
        return {
          texto: `${abertura} No rotativo de um banco médio, isso viraria ${brl(divida + juros)} em um ano. Os juros só param no teto legal, que é dobrar a dívida.`,
          linhas: [
            ["Parcelamento Tino", `12x de ${brl(parcela)}`],
            ["CET", cetTino],
            ["Total a pagar", brl(totalTino)],
            ["Você deixa de pagar", brl(divida + juros - totalTino)],
          ],
          depois: "Se você topar, eu quito a fatura hoje e o rotativo nem começa.",
        };
      },
    },
    {
      chave: /compr|posso gastar|\bcabe\b|iphone|notebook|geladeira|\btv\b|televis/,
      responder(texto) {
        const valor = valorNaFrase(texto, 3000);
        const parcela = valor / 10;
        const antes = C.mesesParaMeta(faltaMeta, sobraMensal);
        const depois = C.mesesParaMeta(faltaMeta, sobraMensal - parcela);
        if (!Number.isFinite(depois)) {
          return {
            texto: `Agora não cabe. Em 10x, a parcela seria ${brl(parcela)}, e a sua sobra média é ${brl(sobraMensal)} por mês. Você ficaria no vermelho ou pararia a meta "${M.metaNome}".`,
            depois: "Posso guardar um pouco por mês numa Caixinha só para essa compra e te avisar quando der para pagar à vista, com desconto.",
          };
        }
        return {
          texto:
            depois > antes
              ? `Cabe, mas atrasa a sua viagem. Em 10x sem juros, a parcela é ${brl(parcela)}:`
              : `Cabe sem mexer nas suas metas. Em 10x sem juros, a parcela é ${brl(parcela)}:`,
          linhas: [
            ["Sobra por mês hoje", brl(sobraMensal)],
            ["Sobra com a parcela", brl(sobraMensal - parcela)],
            [M.metaNome, depois > antes ? `${antes} → ${depois} meses` : `${antes} meses`],
          ],
          depois: "Se quiser, eu monitoro o preço e aviso quando cair 15%.",
        };
      },
    },
    {
      chave: /golpe|seguranca|fraude|roub|clonad|e seguro|hacker/,
      responder() {
        return {
          texto: "Pix acima do limite que você definiu, ou para uma chave que você nunca usou, só sai com a sua biometria. Se a transferência tiver cara de golpe (pressa, chave criada ontem, valor fora do seu padrão), eu seguro o dinheiro e te ligo antes de liberar.",
        };
      },
    },
    {
      chave: /negoci|baix\w* (a|as|minha|minhas)? ?conta|contas|internet|operadora|celular|seguro d|academia/,
      responder() {
        const contas = M.contas.map((c) => ({ ...c, economia: c.atual - c.mercado }));
        const anual = contas.reduce((s, c) => s + c.economia, 0) * 12;
        const taxa = anual * 0.2;
        return {
          texto: "Comparei suas contas com o que clientes da sua região pagam pelo mesmo serviço. Três estão caras:",
          linhas: contas.map((c) => [c.nome, `${brl(c.atual)} → ${brl(c.mercado)}`]),
          depois: `Juntas, dão ${brl(anual)} por ano. Minha taxa é 20% disso (${brl(taxa)}), e só se eu conseguir. Você fica com ${brl(anual - taxa)}. Começo pela internet?`,
        };
      },
    },
    {
      chave: /\brend(e|em|er|imentos?)\b|invest|caixinha|cdb|poupan|guardar|aplicar/,
      responder(texto) {
        const valor = valorNaFrase(texto, 5000);
        const cdi = estado.cdiAnual;
        const caixinha = C.rendimentoCDI({ valor, cdiAnual: cdi, meses: 12 });
        // A Selic fica cerca de 0,1 ponto acima do CDI.
        const poupanca = C.rendimentoPoupanca({ valor, selicAnual: cdi + 0.001, meses: 12 });
        return {
          texto: `Em 12 meses, ${brl(valor)} na Caixinha (100% do CDI) rendem ${brl(caixinha.liquido)}, já descontado o IR de ${pct(caixinha.aliquota)}.`,
          linhas: [
            ["Caixinha Tino", brl(caixinha.liquido)],
            ["Poupança", brl(poupanca)],
            ["Diferença", brl(caixinha.liquido - poupanca)],
          ],
          depois: `Usei CDI de ${pct(cdi)} ao ano. Você resgata quando quiser, a qualquer hora.`,
        };
      },
    },
    {
      chave: /assinatura|streaming|cancel/,
      responder() {
        return {
          texto: "Achei quatro assinaturas no seu cartão. Duas você não abre há mais de 60 dias, e eu já cancelei:",
          linhas: [
            ["Streaming de vídeo", brl(39.9)],
            ["App de idiomas", brl(21.9)],
          ],
          depois: "As outras duas você usa toda semana, então ficam.",
        };
      },
    },
    {
      chave: /pix|parcel/,
      responder() {
        const compra = 1200;
        const em = (n) => C.prestacaoPrice(compra, C.PREMISSAS.jurosParcelamentoTino, n);
        return {
          texto: `No Pix parcelado, o lojista recebe à vista e você paga em parcelas para mim. Antes de confirmar, eu mostro o CET e o total. Numa compra de ${brl(compra)}:`,
          linhas: [
            ["6 parcelas", `6x de ${brl(em(6))}`],
            ["12 parcelas", `12x de ${brl(em(12))}`],
            ["CET", cetTino],
          ],
        };
      },
    },
    {
      chave: /^(oi|ola|opa|e ai|bom dia|boa tarde|boa noite)\b/,
      responder() {
        return {
          texto: "Oi, Marina! Posso ver se uma compra cabe no bolso, negociar suas contas, tirar você do rotativo, simular quanto seu dinheiro rende ou mostrar quanto a Tino lucra com você. Por onde começamos?",
        };
      },
    },
    {
      chave: /obrigad|valeu|brigad/,
      responder() {
        return { texto: "Por nada. Estou aqui 24 horas, inclusive no domingo à noite." };
      },
    },
  ];

  function responder(texto) {
    const t = normalizar(texto);
    const achou = RESPOSTAS.find((r) => r.chave.test(t));
    if (achou) return achou.responder(t);
    return {
      texto: "Ainda sou uma demonstração e entendo poucos assuntos. Pergunte se uma compra cabe no bolso, peça para negociar suas contas, simule um rendimento, fale do rotativo ou pergunte quanto a Tino lucra com você.",
    };
  }

  function iniciarChat() {
    const log = $("#chat-log");
    const form = $("#chat-form");
    const input = $("#chat-input");
    const chat = $("#chat");
    let ocupado = false;

    log.scrollTop = log.scrollHeight;

    function adicionar(classe, filhos) {
      const li = el("li", `msg ${classe}`);
      li.append(...filhos);
      log.append(li);
      log.scrollTop = log.scrollHeight;
      return li;
    }

    function montarResposta(r) {
      const partes = [el("p", "", r.texto)];
      if (r.linhas && r.linhas.length) {
        const dl = el("dl", "msg__linhas");
        for (const [rotulo, valor] of r.linhas) {
          const linha = el("div");
          linha.append(el("dt", "", rotulo), el("dd", "", valor));
          dl.append(linha);
        }
        partes.push(dl);
      }
      if (r.depois) partes.push(el("p", "", r.depois));
      return partes;
    }

    // Devolve false quando a pergunta não foi aceita, para o campo não perder o texto.
    function perguntar(texto) {
      const pergunta = texto.trim();
      if (!pergunta || ocupado) return false;
      ocupado = true;
      adicionar("msg--voce", [document.createTextNode(pergunta)]);

      const digitando = el("li", "msg msg--tino digitando");
      digitando.setAttribute("aria-label", "Tino está digitando");
      digitando.append(el("span"), el("span"), el("span"));
      log.append(digitando);
      log.scrollTop = log.scrollHeight;
      Azulejos.pensar(Azulejos.origemDe(chat));

      const espera = reduzMovimento.matches ? 0 : 600 + Math.min(pergunta.length * 10, 500);
      setTimeout(() => {
        digitando.remove();
        adicionar("msg--tino", montarResposta(responder(pergunta)));
        ocupado = false;
      }, espera);
      return true;
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (perguntar(input.value)) input.value = "";
    });

    $("#chat-sugestoes").addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (chip) perguntar(chip.textContent);
    });
  }

  /* ---------- Simulador ---------- */

  function iniciarSimulador() {
    const campos = {
      tarifaMensal: "sim-tarifa",
      anuidade: "sim-anuidade",
      saldoParado: "sim-saldo",
      dividaRotativo: "sim-divida",
      gastoCartaoMensal: "sim-gasto",
      jurosRotativoMensal: "sim-juros",
      cdiAnual: "sim-cdi",
    };
    const percentuais = new Set(["jurosRotativoMensal", "cdiAnual"]);
    const erro = $("#sim-erro");
    const escrever = (id, texto) => {
      document.getElementById(id).textContent = texto;
    };

    function calcular() {
      const entrada = {};
      const invalidos = [];
      for (const [campo, id] of Object.entries(campos)) {
        const input = document.getElementById(id);
        const texto = input.value.trim();
        let v = texto === "" ? 0 : C.lerNumeroBR(texto);
        const ok = Number.isFinite(v) && v >= 0 && (!percentuais.has(campo) || v <= 100);
        input.setAttribute("aria-invalid", String(!ok));
        if (!ok) {
          invalidos.push($(`label[for="${id}"]`).textContent.toLowerCase());
          v = 0;
        }
        entrada[campo] = percentuais.has(campo) ? v / 100 : v;
      }

      if (invalidos.length) {
        erro.textContent = `Confira ${invalidos.join(", ")}. Use só números, como 1.500 ou 39,90.`;
        erro.hidden = false;
      } else {
        erro.hidden = true;
      }

      estado.cdiAnual = entrada.cdiAnual || C.PREMISSAS.cdiAnual;
      estado.jurosRotativoMensal = entrada.jurosRotativoMensal || C.PREMISSAS.jurosRotativoMensal;

      const r = C.simularTroca(entrada);
      escrever("res-economia", C.formatBRLInteiro(r.economia));
      escrever("res-tarifas", brl(r.tarifas));
      escrever("res-rendimento", brl(r.rendimentoPerdido));
      escrever("res-juros", brl(r.economiaJuros));
      escrever("placar-voce", C.formatBRLInteiro(r.economia));
      escrever("placar-tino", C.formatBRLInteiro(r.lucroTino));
      escrever("res-lucro-caixinha", brl(r.lucroCaixinha));
      escrever("res-lucro-cartao", brl(r.lucroCartao));
      escrever("res-lucro-credito", brl(r.lucroCredito));

      const maior = Math.max(r.economia, r.lucroTino);
      $("#barra-voce").style.width = maior > 0 ? `${(r.economia / maior) * 100}%` : "0";
      $("#barra-tino").style.width = maior > 0 ? `${(r.lucroTino / maior) * 100}%` : "0";

      let frase;
      if (r.economia <= 0) {
        frase = "Preencha os campos com os números do seu extrato para ver a comparação.";
      } else if (r.lucroTino <= 0) {
        frase = "Com esse perfil, a Tino não lucraria nada com você. Tudo bem: a conta continua de graça.";
      } else {
        frase = `Para cada R$ 1,00 que a Tino lucra com esse perfil, você economiza ${brl(r.economia / r.lucroTino)}.`;
      }
      escrever("res-frase", frase);
    }

    escrever("taxa-spread", pct(C.PREMISSAS.spreadCaixinha));
    escrever("taxa-intercambio", pct(C.PREMISSAS.intercambio));
    escrever("taxa-margem", pct(C.PREMISSAS.margemCredito));

    $("#sim-form").addEventListener("input", calcular);
    $("#sim-form").addEventListener("submit", (e) => e.preventDefault());
    calcular();
  }

  /* ---------- Modelo de negócio ---------- */

  const tooltip = $("#tooltip");

  function mostrarTooltip(titulo, texto, x, y) {
    tooltip.replaceChildren(el("strong", "", titulo), document.createTextNode(texto));
    tooltip.hidden = false;
    const larg = tooltip.offsetWidth;
    const alt = tooltip.offsetHeight;
    const left = Math.min(x + 14, window.innerWidth - larg - 12);
    const top = y + 16 + alt > window.innerHeight - 12 ? y - alt - 12 : y + 16;
    tooltip.style.left = `${Math.max(12, left)}px`;
    tooltip.style.top = `${Math.max(12, top)}px`;
  }

  function esconderTooltip() {
    tooltip.hidden = true;
  }

  function desenharBarras(figura, dados, { destacar, detalhe }) {
    const area = $(".barras", figura);
    const maior = Math.max(...dados.map((d) => d.valor));
    area.replaceChildren();

    for (const d of dados) {
      const linha = el("div", "barra");
      linha.setAttribute("role", "listitem");
      linha.tabIndex = 0;
      linha.setAttribute("aria-label", `${d.linha}: ${brl(d.valor)}`);

      const trilho = el("span", "barra__trilho");
      const marca = el("span", `barra__marca${destacar && !d.destaque ? " barra__marca--neutra" : ""}`);
      marca.style.width = `calc((100% - 4.75rem) * ${d.valor / maior})`;
      trilho.append(marca, el("span", "barra__valor", brl(d.valor)));
      linha.append(el("span", "barra__rotulo", d.linha), trilho);

      const texto = detalhe(d);
      linha.addEventListener("pointermove", (e) => mostrarTooltip(d.linha, texto, e.clientX, e.clientY));
      linha.addEventListener("pointerleave", esconderTooltip);
      linha.addEventListener("focus", () => {
        const r = marca.getBoundingClientRect();
        mostrarTooltip(d.linha, texto, r.left, r.bottom);
      });
      linha.addEventListener("blur", esconderTooltip);
      area.append(linha);
    }

    // A tabela leva tudo o que o tooltip mostra, para nada depender de passar o mouse.
    const tabela = $(".grafico__tabela table", figura);
    const cab = el("thead");
    const cabLinha = el("tr");
    cabLinha.append(el("th", "", "Linha"), el("th", "num", "R$ por mês"), el("th", "", "Detalhe"));
    cab.append(cabLinha);
    const corpo = el("tbody");
    for (const d of dados) {
      const tr = el("tr");
      tr.append(el("td", "", d.linha), el("td", "num", brl(d.valor)), el("td", "", detalhe(d)));
      corpo.append(tr);
    }
    tabela.replaceChildren(cab, corpo);
  }

  function iniciarModelo() {
    const total = C.RECEITAS.reduce((s, r) => s + r.valor, 0);
    desenharBarras($("#grafico-receita"), C.RECEITAS, {
      destacar: false,
      detalhe: (d) => `${C.formatNumero((d.valor / total) * 100)}% da receita por cliente. ${d.nota}`,
    });

    const referencia = C.CUSTO_SERVIR[0];
    desenharBarras($("#grafico-custo"), C.CUSTO_SERVIR, {
      destacar: true,
      detalhe: (d) =>
        d === referencia
          ? "Agências, gerentes e call center rateados por cliente."
          : `${C.formatNumero(referencia.valor / d.valor)}x menos que um banco com agências.`,
    });

    window.addEventListener("scroll", esconderTooltip, { passive: true });

    const u = C.unitEconomics();
    const escrever = (id, texto) => {
      document.getElementById(id).textContent = texto;
    };
    escrever("ue-arpu", brl(u.arpu));
    escrever("ue-margem", brl(u.margem));
    escrever("ue-ltv", C.formatBRLInteiro(u.ltv));
    escrever("ue-vida", `vida média de ${Math.round(u.vidaMeses)} meses, sem desconto`);
    escrever("ue-cac", C.formatBRLInteiro(u.cac));
    escrever("ue-ltvcac", `${C.formatNumero(u.ltvCac)}x`);
    escrever("ue-payback", C.formatNumero(u.paybackMeses));

    const recibo = C.reciboMensal();
    const corpo = $("#recibo-tabela tbody");
    for (const linha of recibo.linhas) {
      const tr = el("tr");
      const th = el("th", "", linha.item);
      th.scope = "row";
      tr.append(th, el("td", "", brl(linha.valor)));
      corpo.append(tr);
    }
    escrever("recibo-total", brl(recibo.total));
  }

  /* ---------- Lista de espera ---------- */

  function iniciarLista() {
    const form = $("#lista-form");
    const nome = $("#lista-nome");
    const email = $("#lista-email");
    const prioridade = $("#lista-prioridade");
    const msg = $("#lista-msg");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const n = nome.value.trim();
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim());
      nome.setAttribute("aria-invalid", String(!n));
      email.setAttribute("aria-invalid", String(!emailOk));

      if (!n || !emailOk) {
        msg.textContent = !n
          ? "Escreva seu nome para entrar na lista."
          : "Confira o e-mail: ele precisa ter o formato nome@provedor.com.";
        msg.classList.add("erro");
        msg.hidden = false;
        (!n ? nome : email).focus();
        return;
      }

      msg.classList.remove("erro");
      msg.textContent = `Pronto, ${n}. Anotamos a sua prioridade: ${prioridade.value.toLowerCase()}. Este site é um protótipo, então seu cadastro não foi enviado a lugar nenhum.`;
      msg.hidden = false;
      form.reset();
    });
  }

  iniciarMenu();
  Azulejos.iniciar();
  iniciarChat();
  iniciarSimulador();
  iniciarModelo();
  iniciarLista();
})();
