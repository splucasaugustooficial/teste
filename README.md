# Cobra Arena

Jogo no estilo **snake.io**, sem anúncios e sem compras. Dá para jogar sozinho, em dois no mesmo aparelho, ou em rede local (Wi‑Fi).

O **primeiro aparelho** que abrir a sala na rede vira o anfitrião. Os outros, no mesmo Wi‑Fi, entram sozinhos.

## Modos

- **Contra** — cada cobra por si. Vale abate e pontuação.
- **Dupla** — time de dois. Aliado não mata aliado; o placar é da equipe. Com duas pessoas, vocês jogam juntos contra os bots.

## Como jogar

1. Instale o APK (`dist/CobraArena.apk`). No Android, permita fontes desconhecidas.
2. Escolha um nome e o modo (Contra ou Dupla).
3. **Jogar na rede local** — o primeiro cria a sala; os outros entram. O anfitrião toca em *Começar partida*.
4. **2 jogadores neste aparelho** — dois joysticks (P1 à esquerda, P2 à direita).
5. **Praticar sozinho** — arena com bots.

Controles: arraste o joystick para virar, segure **TURBO** para acelerar (gasta tamanho). No teclado: WASD + espaço (P1), IJKL + Enter (P2).

Bater no corpo de uma cobra inimiga elimina você. Sair da arena também. Ao morrer, o corpo vira comida e você volta em alguns segundos. A rodada dura 3 minutos.

Não há anúncios, rastreamento nem loja.

## APK

O arquivo pronto fica em [`dist/CobraArena.apk`](dist/CobraArena.apk).

Para gerar de novo (precisa do Android SDK):

```bash
npm test
node scripts/sync-android-assets.mjs
export ANDROID_HOME="$HOME/android-sdk"
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
cd android && ./gradlew assembleRelease
```

O APK sai em `android/app/build/outputs/apk/release/app-release.apk`.

## Jogar no navegador (teste)

```bash
npm install
npm start
```

Abra `http://localhost:4173`. A sala na rede do navegador usa este servidor; no celular, o próprio APK é o anfitrião.

## Testes

```bash
npm test
```

## Skill `craft`

`.claude/skills/craft/` continua neste repositório. O fluxo de checagem está em `package.json` (`npm test`).
