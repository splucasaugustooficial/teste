# Aurora TV OS

Interface de sistema operacional para Smart TV, feita em HTML, CSS e JavaScript puros
(sem dependências, sem build). Pensada para ser usada com **controle remoto**: tudo funciona
com as setas, Enter e Voltar.

O visual segue a linguagem de design do tvOS: Top Shelf no alto da tela inicial, grade de
ícones, foco por elevação com inclinação e brilho especular, abas em pílula de vidro,
Ajustes em duas colunas, Central de Controle e protetor de tela aéreo. É um projeto
independente, sem marcas, logotipos ou ativos da Apple.

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
| Segurar H, ou C | Abrir a Central de Controle |
| P / Play-Pause | Pausar ou retomar o vídeo / música |

O mouse também funciona (passar o cursor foca, clique seleciona). Os códigos de tecla
dos controles Samsung Tizen e LG webOS (Voltar, Play/Pause) já estão mapeados.

## O que tem

- **Tela inicial**: Top Shelf que mostra o conteúdo do app em foco (filmes, canais, músicas,
  fotos) e grade de ícones; o fundo desfocado acompanha a cor do item selecionado
- **TV**: abas Assistir agora / Filmes / Séries / Infantil / Minha lista, destaque em tela
  cheia, página do título com "Mais como este" e player com barra de reprodução no estilo tvOS
  (Enter pausa, ⬅ ➡ avança/volta 10 s)
- **Continuar assistindo**: o progresso de cada título fica salvo
- **Ao Vivo**: guia de canais com prévia ao vivo; Enter abre o canal em tela cheia
- **Música**: capa, controles e lista de faixas sintetizadas via Web Audio
- **Fotos**: galeria com visualização em tela cheia (⬅ ➡ troca a foto)
- **Clima**: condição atual e previsão de 7 dias
- **Buscar**: teclado virtual (ou teclado físico) que procura filmes, canais e apps
- **Ajustes**: aparência clara/escura, cor de destaque, tamanho do texto, protetor de tela,
  cliques de navegação e nome da TV (⬅ ➡ muda o valor); tudo salvo no navegador
- **Central de Controle**: repousar, aparência, música tocando, busca, perfil e ajustes
- **Protetor de tela aéreo** (dunas animadas) após inatividade

Os vídeos e as músicas são gerados na hora (canvas e Web Audio), então o projeto
funciona offline e sem nenhum arquivo de mídia.

## Estrutura

```
tv-os/
├── index.html   # telas e estrutura
├── styles.css   # tema, layout de TV e estados de foco
└── app.js       # motor de foco, navegação entre telas e apps
```
