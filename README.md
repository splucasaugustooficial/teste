# Sonora — player de música para iPhone, grátis de verdade

Sem anúncios, sem assinatura, sem conta, sem rastreamento e funciona offline.
Feito em SwiftUI + AVAudioEngine, só com frameworks da Apple (zero dependências).

> **Sobre "competir com todos":** nenhum app grátis consegue legalmente oferecer o
> catálogo de Spotify/Apple Music/Deezer — essas licenças custam bilhões. O Sonora
> compete onde dá para ganhar: é o melhor jeito de ouvir **as músicas que você já tem**,
> com recursos que os outros cobram (ou nem têm).

## Recursos

**Preço:** R$ 0 · **Anúncios:** nenhum · **Conta:** não precisa · **Internet:** não precisa · **Dados coletados:** nenhum

- **Biblioteca:** músicas, álbuns, artistas, favoritas, mais tocadas, adicionadas e tocadas recentemente, ordenação e busca.
- **Importação:** arquivos ou **pastas inteiras** do app Arquivos (iCloud Drive, Google Drive, OneDrive, pendrive), compartilhamento de outros apps e arraste-e-solte pelo Finder/iTunes no computador. Lê título, artista, álbum, número da faixa e capa (ID3/iTunes), e ignora duplicadas.
- **Player:** fila editável (tocar a seguir, adicionar, reordenar, remover), aleatório inteligente, repetir uma/todas, gestos no mini player (deslize para trocar de faixa), AirPlay/Bluetooth, volume.
- **Som:** equalizador paramétrico de 10 bandas (32 Hz – 16 kHz) com pré-amplificação anti-distorção, velocidade sem alterar o tom, timer de sono (minutos ou fim da música).
- **Sistema:** reprodução em segundo plano, tela bloqueada e Central de Controle com capa, pausa ao desconectar o fone, retoma depois de ligações.
- **Playlists:** criar, renomear, reordenar, capa em mosaico, mais as playlists automáticas.
- **Extra:** "Redescobrir músicas esquecidas" (aleatório com o que você não ouve há 30 dias), edição de informações das faixas.

## Como instalar no seu iPhone (grátis)

### Sem Mac: baixe o IPA

Cada push gera, no GitHub Actions (aba **Actions › iOS build**), dois arquivos:

- `Sonora-unsigned-ipa`: o app compilado para iPhone (Release);
- `Sonora-screenshots`: o app rodando no simulador, com músicas de demonstração.

Instale o `Sonora-unsigned.ipa` com o [Sideloadly](https://sideloadly.io) ou o
[AltStore](https://altstore.io) (Windows ou Mac), entrando com seu Apple ID: eles assinam o app
para o seu aparelho. Depois, autorize em *Ajustes › Geral › VPN e Gerenciamento de Dispositivos*.

### Com Mac: compile no Xcode

Precisa do Xcode 16 ou mais novo. Não precisa pagar a conta de desenvolvedor da Apple.

```bash
brew install xcodegen
xcodegen generate
open Sonora.xcodeproj
```

No Xcode: selecione o alvo **Sonora** › *Signing & Capabilities* › escolha seu Apple ID
como *Team* (troque o *Bundle Identifier* se pedir) › conecte o iPhone › ▶︎ Run.
No iPhone, autorize em *Ajustes › Geral › VPN e Gerenciamento de Dispositivos*.
(Com Apple ID gratuito o app precisa ser reinstalado a cada 7 dias; para publicar
na App Store é preciso a conta de desenvolvedor.)

Requer iOS 17 ou superior. O GitHub Actions (`.github/workflows/ios.yml`) compila o
projeto a cada push e roda `scripts/simulator-demo.sh`, que instala o app no simulador,
importa músicas de demonstração (tons sintetizados, mono e estéreo) e tira capturas de tela.

## Estrutura

```
project.yml                  # definição do projeto (XcodeGen)
Sonora/App                   # entrada do app, roteador e tema
Sonora/Models                # Track, Playlist, Album, presets do EQ
Sonora/Services              # LibraryStore (biblioteca), PlayerController (áudio), MetadataReader
Sonora/Components            # capa, linha de música, menus
Sonora/Views                 # telas: Biblioteca, Playlists, Buscar, Som, Player, Fila
```

## Próximos passos possíveis

Letras sincronizadas (.lrc), crossfade e reprodução sem pausa, rádios online abertas,
widget e Live Activity, CarPlay, sincronização via iCloud.

---
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
