# Snake Livre

Jogo no estilo snake.io, sem anúncios e sem servidor na internet. Quem cria a sala é o primeiro na rede; os outros celulares entram na mesma Wi-Fi. Dá para jogar em **dupla** (pares) ou **contra** (cada um por si).

Pastas:

- [`apk/`](apk/) — só o arquivo para instalar agora, [`apk/snake-livre.apk`](apk/snake-livre.apk).
- [`backup/`](backup/) — cópias já publicadas. A 1.0.0 está em `backup/1.0.0/snake-livre.apk`.
- [`criacao/`](criacao/) — a configuração e o projeto originais, da versão 1.0.0.
- [`atualizacoes/`](atualizacoes/) — onde as próximas versões são feitas. O projeto da 1.0.0 continua em `criacao/`.

## Instalar

1. Copie `apk/snake-livre.apk` para o Android e abra o arquivo.
2. Permita instalar apps desta origem, se o sistema pedir.
3. Abra o Snake Livre. Os dois aparelhos precisam estar na mesma Wi-Fi. Dados móveis ligados às vezes mandam o jogo para a rede errada.

Quem toca em **Criar sala** vira o anfitrião e vê o IP grande na tela. O outro toca em **Entrar na sala**. Se a sala não aparecer sozinha, digite esse IP. Wi-Fi de visitante costuma isolar os celulares: nesse caso nem o IP conecta, e os dois precisam de outra rede.

## Modos

- **Contra:** todo mundo é inimigo. Encostar em outra cobra ou na borda elimina. Ganha a maior cobra quando os 3 minutos acabam.
- **Dupla:** a ordem da lista forma pares (1º com 2º, 3º com 4º). A cobra do seu par não te mata. Ganha o par com mais tamanho somado. As setas trocam quem joga com quem.
- **Treino:** sozinho contra bots, sem relógio, para aprender.
- **Neste aparelho:** duas pessoas no mesmo celular, cada uma com metade da tela.

Quem morre volta em 3 segundos, pequeno. Impulso acelera e gasta o corpo. As bolinhas aumentam o tamanho. Dá para completar a arena com bots.

## Privacidade

Não tem anúncio, não tem conta e o jogo não fala com nenhum servidor. A permissão de internet só existe porque o Android exige isso para abrir uma conexão na rede local.

## Desenvolvimento

Tudo isso fica em `criacao/`:

```bash
cd criacao
npm test
python3 -m http.server 4173 --directory www
```

O APK é um WebView com os arquivos de `criacao/www/`. A simulação roda no celular anfitrião; os outros só enviam a mira.

A versão original se gera de novo com `bash criacao/tools/build-apk.sh`. As atualizações saem de `atualizacoes/`: aumente `versionName` em `atualizacoes/android/app/build.gradle.kts` e rode o script. Ele guarda o APK que estava em `apk/` dentro de `backup/` se essa cópia ainda não existir, e publica o novo em `apk/snake-livre.apk`.

```bash
export ANDROID_HOME=/caminho/do/android-sdk
bash atualizacoes/tools/build-apk.sh
```

O SDK precisa da platform Android 35 e do build-tools 35. O APK de depuração é assinado com a chave local do SDK: se reinstalar um APK gerado em outro computador, desinstale o anterior antes.

---

# teste

## REA (Reverse Engineer Anything)

Este repositório usa o REA oficial, publicado em
[github.com/morluto/rea](https://github.com/morluto/rea) (pacote npm
[`rea-agents`](https://www.npmjs.com/package/rea-agents)). Não use cópias ou
forks com nome parecido.

### Claude Code

O arquivo `.claude/settings.json` registra o marketplace `morluto/rea` e ativa o
plugin `rea@rea`. Ao abrir o projeto no Claude Code e confiar na pasta, o Claude
Code oferece a instalação do plugin. Para instalar manualmente:

```text
/plugin marketplace add morluto/rea
/plugin install rea@rea
```

Depois, reinicie o Claude Code e confira com `/mcp`.

### Terminal (CLI)

```bash
npm install --global rea-agents
rea --help
```

Ou configure seus agentes com `npx rea-agents setup`.

Requisitos: Node.js 22.x (>= 22.23.4), 24.x (>= 24.22.1) ou 26.12.1+, com npm.
Análise de binários nativos também precisa de Hopper, Ghidra, IDA ou Kuna; veja o
[guia de instalação](https://github.com/morluto/rea/blob/main/docs/installation.md).

## Skill `craft`

`.claude/skills/craft/` é uma skill do Claude Code que aplica um fluxo de
engenharia de nível sênior a qualquer mudança de código: entender → provar o
bug → planejar → implementar o mínimo → verificar com as checagens reais →
relatar com honestidade. Ela é carregada automaticamente neste projeto; para
forçar, use `/craft`.

O script incluído descobre os comandos de formatação, lint, typecheck, build e
teste do projeto (Node, Deno, Python, Rust, Go, .NET, Java, Elixir, Swift,
Ruby, PHP e Makefile):

```bash
bash .claude/skills/craft/scripts/checks.sh                  # lista, por categoria
bash .claude/skills/craft/scripts/checks.sh --run            # executa todas
bash .claude/skills/craft/scripts/checks.sh --run --only lint,type --fail-fast
bash .claude/skills/craft/scripts/checks.sh --json           # para automação
```

Checagens cuja ferramenta não está instalada aparecem como **puladas**, nunca
como aprovadas. Os testes do script rodam no CI (`.github/workflows/craft.yml`)
e localmente com `bash .claude/skills/craft/tests/test_checks.sh`.

Para usar a skill em todos os seus projetos, copie a pasta para
`~/.claude/skills/craft/`.
