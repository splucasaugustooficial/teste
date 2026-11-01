# Aurora TV OS

Interface de sistema operacional para Smart TV, feita em HTML, CSS e JavaScript puros
(sem dependências, sem build). Pensada para ser usada com **controle remoto**: tudo funciona
com as setas, Enter e Voltar.

## Como rodar

Abra `index.html` no navegador, ou sirva a pasta:

```bash
cd tv-os
python3 -m http.server 8080   # depois acesse http://localhost:8080
```

Use em tela cheia (F11) para a experiência de TV.

## Controles

| Tecla | Ação |
|---|---|
| ⬆ ⬇ ⬅ ➡ | Mover o foco (navegação espacial) |
| Enter / Espaço | Selecionar |
| Esc / Backspace / botão direito | Voltar |
| H / Home | Ir para o início |
| P / Play-Pause | Pausar ou retomar o vídeo / música |

O mouse também funciona (passar o cursor foca, clique seleciona). Os códigos de tecla
dos controles Samsung Tizen e LG webOS (Voltar, Play/Pause) já estão mapeados.

## O que tem

- **Boot animado** e tela inicial com destaque dinâmico, que muda conforme o item focado
- **Filmes & Séries**: catálogo por gênero, tela de detalhes e player com avanço/retrocesso de 10 s
- **Continuar assistindo**: o progresso de cada título fica salvo
- **TV ao Vivo**: guia de canais com prévia ao vivo; Enter abre o canal em tela cheia
- **Música**: player com faixas sintetizadas via Web Audio, disco girando e equalizador
- **Fotos**: galeria com visualização em tela cheia (⬅ ➡ troca a foto)
- **Clima**: condição atual e previsão de 7 dias
- **Buscar**: teclado virtual (ou teclado físico) que procura filmes, canais e apps
- **Ajustes**: tema claro/escuro, cor de destaque, tamanho do texto, protetor de tela,
  sons de navegação e nome da TV (⬅ ➡ muda o valor); tudo salvo no navegador
- **Protetor de tela** com relógio, ativado após inatividade

Os vídeos e as músicas são gerados na hora (canvas e Web Audio), então o projeto
funciona offline e sem nenhum arquivo de mídia.

## Estrutura

```
tv-os/
├── index.html   # telas e estrutura
├── styles.css   # tema, layout de TV e estados de foco
└── app.js       # motor de foco, navegação entre telas e apps
```
