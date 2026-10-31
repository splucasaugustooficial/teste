# Configuração do build (Android)

Esta pasta concentra **toda a configuração Gradle** do Cobra Rede. O código do jogo fica em [`../app/`](../app/); o APK gerado vai para [`../apk/`](../apk/).

| Arquivo | Função |
|---------|--------|
| `settings.gradle.kts` | Módulos e repositórios |
| `build.gradle.kts` | Plugins Android/Kotlin (root) |
| `gradle.properties` | Opções JVM e AndroidX |
| `proguard-rules.pro` | Regras R8/ProGuard (release) |
| `local.properties` | Caminho do SDK (não versionado — use o `.example`) |
| `gradlew` / `gradle/wrapper/` | Wrapper Gradle |

## Compilar

```bash
cd snake-lan/config
cp local.properties.example local.properties   # edite sdk.dir
export ANDROID_HOME=/caminho/para/android-sdk
./gradlew assembleDebug
```

Ou use o script que já copia o APK para `apk/`:

```bash
./scripts/build-apk.sh
```

Saídas intermediárias do Gradle: `config/.gradle/`, `app/build/` (ignoradas pelo Git).
