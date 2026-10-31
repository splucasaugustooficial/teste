# Cobra Rede

Jogo estilo **snake.io** para Android, **sem anúncios**, com multiplayer na **mesma rede Wi‑Fi** (LAN).

## Estrutura do projeto

```
snake-lan/
├── apk/          ← APK instalável (pasta isolada)
├── config/       ← Gradle, SDK, ProGuard (build)
├── app/          ← Código-fonte Kotlin + recursos Android
└── scripts/      ← build-apk.sh
```

| Pasta | Conteúdo |
|-------|----------|
| [`apk/`](apk/) | Somente `.apk` gerados + README |
| [`config/`](config/) | `gradlew`, `gradle.properties`, wrapper, ProGuard |
| [`app/`](app/) | Jogo (activities, engine, rede LAN) |

## Modos

| Modo | Descrição |
|------|-----------|
| **Versus** | Cada jogador por si; colidir com outras cobras elimina e solta orbes. |
| **Dupla** | Duplas na mesma cor; parceiros **não se eliminam** ao colidir. |

## Como jogar na rede

1. Todos os celulares na **mesma Wi‑Fi**.
2. Um jogador escolhe o modo → **Criar sala (host)** e anota o **IP** exibido.
3. Os outros escolhem o mesmo modo → **Entrar na sala** e digitam o IP do host.
4. O host toca **Iniciar partida** quando todos estiverem conectados.
5. Use o **joystick** no canto inferior esquerdo para dirigir a cobra.

Porta TCP: **47923**.

## Gerar o APK

Requisitos: JDK 17+, Android SDK (API 34).

```bash
cd snake-lan
cp config/local.properties.example config/local.properties
# edite sdk.dir em config/local.properties
chmod +x scripts/build-apk.sh
./scripts/build-apk.sh
```

Os APKs ficam **somente** em [`apk/`](apk/):

- `apk/CobraRede-debug.apk` — instalação direta
- `apk/CobraRede-release-unsigned.apk` — release minificado (assine antes da loja)

Build manual (sem copiar para `apk/`):

```bash
cd config && ./gradlew assembleDebug
```

## Privacidade

O app **não inclui SDKs de anúncios** nem analytics de terceiros. O tráfego de jogo fica apenas na rede local entre os dispositivos.
