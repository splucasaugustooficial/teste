# NEON VIPER — Design do jogo

## Objetivo

Criar um APK Android original inspirado no gênero de arena de serpentes, sem
copiar nome, arte ou código de terceiros. O jogo deve funcionar sem anúncios,
sem rastreamento e sem servidor externo. Até quatro celulares na mesma rede
Wi-Fi encontram a partida automaticamente.

## Decisões confirmadas

- Nome e marca: **NEON VIPER**.
- Plataforma inicial: Android, orientação paisagem.
- Controle selecionável: joystick virtual ou arrastar o dedo.
- Descoberta de partidas: automática na rede Wi-Fi/LAN.
- Times: até duas pessoas por time; vagas não ocupadas viram bots.
- **Dupla:** dois aliados sobrevivem juntos contra ondas crescentes de bots.
- **Contra:** dois times lutam sem limite de tempo; vence o último time vivo.
- Monetização e privacidade: nenhum anúncio, compra, conta, telemetria ou
  permissão de internet além da comunicação local.

## Abordagens consideradas

1. **Android nativo + Canvas + UDP (escolhida).** APK pequeno, bom controle de
   latência e nenhuma engine em tempo de execução. Exige implementar o loop e o
   protocolo, mas ambos permanecem simples e testáveis.
2. **Flutter + Flame.** Desenvolvimento visual rápido e portabilidade futura,
   porém adiciona runtime, dependências e um APK maior.
3. **Unity.** Ferramentas maduras para jogos, mas é excessiva para uma arena 2D
   e aumenta substancialmente o tamanho e o custo de build.

## Identidade visual

NEON VIPER combina arcade competitivo com tecnologia de rua:

- Símbolo: cabeça angular de víbora formando a letra `V`, com dois olhos
  luminosos e cauda em forma de raio.
- Fundo `#050611` (Midnight), superfícies `#0D1024` e grade `#171B36`.
- Cor principal `#B8FF2C` (Venom Lime), secundária `#00E5FF` (Plasma Cyan),
  rival `#FF376F` (Rival Magenta), alerta `#FFB020`.
- Tipografia: sans geométrica condensada e em caixa alta; Android usa
  `sans-serif-condensed` e `sans-serif-black` para não empacotar fontes
  licenciadas.
- Interface com cortes diagonais, contornos de 2 px, brilho controlado e
  microanimações de pulso. O campo mantém alto contraste e não depende apenas
  de cor: cada time também possui marca geométrica própria.
- Tom de voz curto: `ENTRAR NA ARENA`, `SINAL ENCONTRADO`, `ÚLTIMO TIME VIVO`.

## Fluxo de telas

1. **Splash:** marca animada, sem espera artificial.
2. **Início:** `DUPLA`, `CONTRA`, `TREINO` e `AJUSTES`.
3. **Busca LAN:** procura uma sala compatível; se não encontrar em 1,5 s, o
   aparelho vira host. Salas duplicadas convergem para a de menor ID.
4. **Lobby:** mostra até quatro slots, time, humano/bot e qualidade do sinal.
   O host inicia após uma contagem regressiva quando a sala estabiliza.
5. **Arena:** HUD de equipe, onda ou times vivos, minimapa, botão de impulso e
   controle configurado.
6. **Resultado:** vitória/derrota, pontuação, eliminações e revanche. A revanche
   reutiliza a sala LAN.

## Regras da arena

- Arena circular, alimentos distribuídos fora dos corpos.
- Coletar alimento aumenta comprimento e pontuação.
- Impulso aumenta a velocidade enquanto reduz gradualmente o comprimento.
- Colidir a cabeça com limite, corpo próprio ou corpo adversário elimina.
- Aliados não causam colisão entre si, evitando sabotagem acidental.
- Cobra eliminada libera parte do corpo como alimento.
- Em Contra não há renascimento; vence o último time com ao menos uma cobra.
- Em Dupla, cada onda termina ao eliminar todos os inimigos. A próxima adiciona
  dificuldade por velocidade, agressividade e quantidade. A partida termina
  quando os dois aliados forem eliminados.
- Bots analisam alimento, obstáculos, inimigos e aliados em distâncias curtas,
  usando perfis de agressividade crescentes sem acesso privilegiado ao estado.

## Arquitetura

Aplicativo Android nativo em Kotlin, com uma `Activity` e uma `GameView` baseada
em `SurfaceView`.

- `engine`: modelo puro Kotlin, simulação, colisões, ondas e bots.
- `network`: descoberta UDP, protocolo binário e sessão host/cliente.
- `ui`: máquina de telas, renderização Canvas, controles e identidade visual.
- `audio`: efeitos sintetizados com APIs Android; sem assets protegidos.

O host é autoritativo e simula a 30 ticks/s. Clientes enviam direção e impulso;
o host transmite snapshots compactos a 15 Hz. O cliente interpola os dois
snapshots mais recentes. Pacotes carregam versão, sessão, sequência e checksum.
Entradas atrasadas são descartadas.

## Descoberta e falhas de rede

- Anúncios UDP em broadcast identificam versão, modo, vagas e ID da sessão.
- O primeiro aparelho sem sala compatível cria uma; novos aparelhos entram
  automaticamente.
- Se o host desaparecer no lobby, os aparelhos restantes elegem o menor ID.
- Durante a partida, queda do host encerra a rodada com mensagem clara e volta
  à busca; migração no meio da simulação fica fora do primeiro APK para evitar
  estados divergentes.
- Perda de cliente por 3 s substitui sua cobra por bot; reconexão dentro de
  15 s recupera o slot na rodada seguinte.
- O jogo diferencia `SEM WI-FI`, `SALA INCOMPATÍVEL` e `HOST DESCONECTADO`.

## Segurança e privacidade

- Tráfego somente em LAN, sem backend ou DNS de aplicação.
- Nenhum dado pessoal; jogadores recebem codinomes locais editáveis.
- Pacotes possuem limite estrito de tamanho e validação de versão, enumerações,
  contagens e valores numéricos antes de alterar o estado.
- O host limita frequência de entrada por cliente e ignora remetentes sem slot.

## Verificação

- Testes unitários da simulação: crescimento, impulso, colisões, vitória,
  progressão de ondas e decisão de bot.
- Testes do protocolo: round-trip, pacotes truncados, versão incompatível,
  limites e sequências antigas.
- Testes de sessão com transporte em memória: descoberta, entrada, preenchimento
  por bot e desconexão.
- Build Android limpo e lint.
- Teste manual em emulador para navegação, controles e loop de jogo.
- Teste LAN real entre dois aparelhos continua recomendado antes de publicar.

## Fora do primeiro APK

- Servidor pela internet, ranking global, chat, contas, cosméticos pagos,
  migração de host durante uma rodada e suporte iOS.
