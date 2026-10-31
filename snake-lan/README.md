# Cobra Rede

Jogo estilo **snake.io** para Android, **sem anúncios**, com multiplayer na **mesma rede Wi‑Fi** (LAN).

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
export ANDROID_HOME=/caminho/para/android-sdk
./gradlew assembleDebug
```

APK de debug (pronto para instalar com “fontes desconhecidas”): `dist/CobraRede-debug.apk`

Release (minificado, **sem assinatura de loja** — assine antes de publicar):

```bash
./gradlew assembleRelease
# saída em dist/CobraRede-release-unsigned.apk
```

## Privacidade

O app **não inclui SDKs de anúncios** nem analytics de terceiros. O tráfego de jogo fica apenas na rede local entre os dispositivos.
