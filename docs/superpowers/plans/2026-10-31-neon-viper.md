# NEON VIPER Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um APK Android jogável de arena de serpentes, sem anúncios,
com Dupla contra ondas, Contra 2v2, bots e descoberta automática na LAN.

**Architecture:** Um app Android nativo renderiza em `SurfaceView`; a simulação
e o protocolo permanecem em Kotlin puro. O aparelho host executa a simulação
autoritativa a 30 Hz, recebe entradas e publica snapshots UDP para os clientes.

**Tech Stack:** Kotlin 2.4.21, Android Gradle Plugin 9.5.0, Gradle 9.8.2,
Android SDK 36, JUnit 4.13.2, APIs Android Canvas/UDP.

## Global Constraints

- O aplicativo chama-se `NEON VIPER` e usa o package `com.neonviper.game`.
- Android mínimo 8.0 (API 26), alvo e compile SDK 36.
- A orientação é paisagem e a interface deve permanecer legível em 16:9 e 20:9.
- Não adicionar anúncios, compras, telemetria, contas ou serviço externo.
- A rede aceita no máximo quatro jogadores e pacotes de no máximo 32 KiB.
- Toda entrada de rede é validada antes de entrar na simulação.
- Toda lógica nova em Kotlin puro segue RED → GREEN → REFACTOR.

---

### Task 1: Fundação Android e shell da marca

**Files:**
- Create: `settings.gradle.kts`
- Create: `build.gradle.kts`
- Create: `gradle.properties`
- Create: `app/build.gradle.kts`
- Create: `app/src/main/AndroidManifest.xml`
- Create: `app/src/main/res/values/colors.xml`
- Create: `app/src/main/res/values/styles.xml`
- Create: `app/src/main/res/values/strings.xml`
- Create: `app/src/main/res/drawable/ic_launcher_foreground.xml`
- Create: `app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`
- Create: `app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml`
- Create: `app/src/main/kotlin/com/neonviper/game/MainActivity.kt`

**Interfaces:**
- Produces: um projeto Gradle compilável e uma `MainActivity` em tela cheia que
  cria `NeonViperView`.

- [ ] **Step 1: Criar configuração mínima**

```kotlin
// settings.gradle.kts
pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = "NeonViper"
include(":app")
```

- [ ] **Step 2: Configurar o módulo sem dependências de runtime**

```kotlin
plugins {
    id("com.android.application")
}

android {
    namespace = "com.neonviper.game"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.neonviper.game"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
```

- [ ] **Step 3: Criar Activity full-screen e manifesto LAN**

```kotlin
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        window.insetsController?.hide(
            WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars()
        )
        setContentView(NeonViperView(this))
    }
}
```

- [ ] **Step 4: Gerar wrapper e verificar a fundação**

Run: `./gradlew :app:assembleDebug`
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Commit**

```bash
git add settings.gradle.kts build.gradle.kts gradle.properties gradle app
git commit -m "build: scaffold Neon Viper Android app"
```

### Task 2: Modelo e movimento da simulação

**Files:**
- Create: `app/src/main/kotlin/com/neonviper/game/engine/Geometry.kt`
- Create: `app/src/main/kotlin/com/neonviper/game/engine/GameModels.kt`
- Create: `app/src/main/kotlin/com/neonviper/game/engine/GameEngine.kt`
- Test: `app/src/test/kotlin/com/neonviper/game/engine/GameEngineTest.kt`

**Interfaces:**
- Produces: `GameEngine.newGame(mode, seed)`, `setInput(playerId, input)` e
  `tick(deltaSeconds): GameState`.

- [ ] **Step 1: Escrever o teste de movimento**

```kotlin
@Test fun `tick moves a living snake in its heading`() {
    val engine = GameEngine.newGame(GameMode.VERSUS, seed = 7L)
    val before = engine.state.snakes.getValue(0).head
    engine.setInput(0, PlayerInput(Vec2(1f, 0f), boosting = false))
    val after = engine.tick(1f / 30f).snakes.getValue(0).head
    assertTrue(after.x > before.x)
}
```

- [ ] **Step 2: Rodar RED**

Run: `./gradlew testDebugUnitTest --tests '*GameEngineTest*'`
Expected: FAIL porque `GameEngine` ainda não existe.

- [ ] **Step 3: Implementar vetores, estados imutáveis e movimento**

```kotlin
data class Vec2(val x: Float, val y: Float) {
    fun normalized(): Vec2 {
        val length = sqrt(x * x + y * y)
        return if (length < 0.0001f) Vec2.ZERO else Vec2(x / length, y / length)
    }
    companion object { val ZERO = Vec2(0f, 0f) }
}

class GameEngine private constructor(var state: GameState) {
    private val inputs = mutableMapOf<Int, PlayerInput>()
    fun setInput(playerId: Int, input: PlayerInput) { inputs[playerId] = input }
    fun tick(deltaSeconds: Float): GameState {
        state = state.copy(snakes = state.snakes.mapValues { (id, snake) ->
            if (!snake.alive) snake else snake.move(inputs[id], deltaSeconds)
        })
        return state
    }
}
```

- [ ] **Step 4: Rodar GREEN e conjunto completo**

Run: `./gradlew testDebugUnitTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/kotlin/com/neonviper/game/engine app/src/test
git commit -m "feat: add deterministic snake simulation"
```

### Task 3: Alimento, colisões e regras dos modos

**Files:**
- Modify: `app/src/main/kotlin/com/neonviper/game/engine/GameEngine.kt`
- Modify: `app/src/main/kotlin/com/neonviper/game/engine/GameModels.kt`
- Test: `app/src/test/kotlin/com/neonviper/game/engine/GameEngineTest.kt`

**Interfaces:**
- Produces: coleta e crescimento, eliminação, `GameOutcome` e progressão de
  `wave`.

- [ ] **Step 1: Adicionar testes que falham**

```kotlin
@Test fun `food grows the snake and increments score`() {
    val engine = fixture(head = Vec2(10f, 10f), food = setOf(Food(1, Vec2(11f, 10f))))
    val state = engine.tick(1f / 30f)
    assertTrue(state.snakes.getValue(0).score > 0)
    assertFalse(state.food.any { it.id == 1 })
}

@Test fun `versus ends when only one team remains`() {
    val engine = fixtureWithEliminatedTeam(Team.MAGENTA)
    assertEquals(GameOutcome.TeamWon(Team.LIME), engine.tick(0f).outcome)
}

@Test fun `duo advances after all enemies are eliminated`() {
    val engine = duoFixture(wave = 1, enemiesAlive = 0)
    assertEquals(2, engine.tick(0f).wave)
}
```

- [ ] **Step 2: Rodar RED**

Run: `./gradlew testDebugUnitTest --tests '*GameEngineTest*'`
Expected: FAIL nas três regras novas.

- [ ] **Step 3: Implementar as regras**

```kotlin
private fun resolveOutcome(snakes: Map<Int, SnakeState>): GameOutcome? =
    when (state.mode) {
        GameMode.VERSUS -> snakes.values.filter { it.alive }.map { it.team }
            .distinct().singleOrNull()?.let(GameOutcome::TeamWon)
        GameMode.DUO -> if (allies(snakes).none { it.alive }) GameOutcome.Defeat else null
        GameMode.TRAINING -> null
    }
```

Implemente distância cabeça/alimento, crescimento por segmento, colisões com
arena/corpos, aliados sem colisão e criação da próxima onda com seed estável.

- [ ] **Step 4: Rodar GREEN**

Run: `./gradlew testDebugUnitTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/kotlin/com/neonviper/game/engine app/src/test
git commit -m "feat: add Neon Viper game rules"
```

### Task 4: Bots e controles

**Files:**
- Create: `app/src/main/kotlin/com/neonviper/game/engine/BotController.kt`
- Create: `app/src/main/kotlin/com/neonviper/game/input/InputController.kt`
- Test: `app/src/test/kotlin/com/neonviper/game/engine/BotControllerTest.kt`
- Test: `app/src/test/kotlin/com/neonviper/game/input/InputControllerTest.kt`

**Interfaces:**
- Produces: `BotController.chooseInput(state, snakeId, difficulty)` e
  `InputController.onPointer(...)`.

- [ ] **Step 1: Testar evasão e controles**

```kotlin
@Test fun `bot turns away from the arena boundary`() {
    val state = fixtureBotNearRightBoundary()
    val input = BotController.chooseInput(state, 2, 0.5f)
    assertTrue(input.direction.x < 0f)
}

@Test fun `drag control points from origin to current pointer`() {
    val controller = InputController(ControlScheme.DRAG)
    controller.onPointer(PointerAction.DOWN, Vec2(10f, 10f))
    val input = controller.onPointer(PointerAction.MOVE, Vec2(30f, 10f))
    assertEquals(Vec2(1f, 0f), input.direction)
}
```

- [ ] **Step 2: Rodar RED**

Run: `./gradlew testDebugUnitTest --tests '*BotControllerTest' --tests '*InputControllerTest'`
Expected: FAIL porque os controladores não existem.

- [ ] **Step 3: Implementar steering ponderado**

```kotlin
val desired = (
    seekNearestFood(state, snake) * 0.55f +
    avoidBodies(state, snake) * 1.4f +
    avoidBoundary(state, snake) * 2.0f +
    attackEnemy(state, snake) * difficulty
).normalized()
return PlayerInput(desired, boosting = shouldBoost(state, snake, desired))
```

Joystick usa deslocamento limitado a um raio; arrasto usa vetor entre o toque
inicial e atual. Toques curtos não substituem a última direção válida.

- [ ] **Step 4: Rodar GREEN**

Run: `./gradlew testDebugUnitTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/kotlin/com/neonviper/game/engine/BotController.kt \
  app/src/main/kotlin/com/neonviper/game/input app/src/test
git commit -m "feat: add bots and touch controls"
```

### Task 5: Protocolo binário validado

**Files:**
- Create: `app/src/main/kotlin/com/neonviper/game/network/Protocol.kt`
- Create: `app/src/main/kotlin/com/neonviper/game/network/Packets.kt`
- Test: `app/src/test/kotlin/com/neonviper/game/network/ProtocolTest.kt`

**Interfaces:**
- Produces: `Protocol.encode(packet): ByteArray` e
  `Protocol.decode(bytes): DecodeResult<Packet>`.

- [ ] **Step 1: Testar round-trip e rejeições**

```kotlin
@Test fun `input packet survives round trip`() {
    val packet = InputPacket("session", 4, 19, Vec2(0.6f, -0.8f), true)
    assertEquals(packet, Protocol.decode(Protocol.encode(packet)).getOrThrow())
}

@Test fun `truncated packet is rejected`() {
    assertTrue(Protocol.decode(byteArrayOf(0x4e, 0x56)).isFailure)
}

@Test fun `oversized packet is rejected`() {
    assertTrue(Protocol.decode(ByteArray(Protocol.MAX_PACKET_SIZE + 1)).isFailure)
}
```

- [ ] **Step 2: Rodar RED**

Run: `./gradlew testDebugUnitTest --tests '*ProtocolTest*'`
Expected: FAIL porque o protocolo não existe.

- [ ] **Step 3: Implementar cabeçalho e payloads**

```kotlin
private const val MAGIC = 0x4E565052
const val VERSION: UByte = 1u
const val MAX_PACKET_SIZE = 32 * 1024

fun decode(bytes: ByteArray): DecodeResult<Packet> {
    if (bytes.size !in 8..MAX_PACKET_SIZE) return DecodeResult.failure("size")
    return runCatchingValidated {
        DataInputStream(bytes.inputStream()).use(::readPacket)
    }
}
```

Use `DataInputStream`/`DataOutputStream`, comprimento prefixado para strings de
até 32 bytes, contagens limitadas e somente floats finitos dentro de `[-1, 1]`
para direções.

- [ ] **Step 4: Rodar GREEN**

Run: `./gradlew testDebugUnitTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/kotlin/com/neonviper/game/network app/src/test
git commit -m "feat: add validated LAN protocol"
```

### Task 6: Descoberta e sessão host/cliente

**Files:**
- Create: `app/src/main/kotlin/com/neonviper/game/network/LanDiscovery.kt`
- Create: `app/src/main/kotlin/com/neonviper/game/network/GameSession.kt`
- Create: `app/src/main/kotlin/com/neonviper/game/network/UdpTransport.kt`
- Test: `app/src/test/kotlin/com/neonviper/game/network/GameSessionTest.kt`

**Interfaces:**
- Produces: `GameSession.searchOrHost(mode)`, fluxo de `SessionEvent` e
  `close()`.
- Consumes: pacotes da Task 5 e simulação das Tasks 2–4.

- [ ] **Step 1: Testar busca, entrada e substituição por bot com transporte em memória**

```kotlin
@Test fun `second peer joins the discovered host`() {
    val bus = InMemoryTransport()
    val host = GameSession(bus.endpoint("a"), clock)
    val guest = GameSession(bus.endpoint("b"), clock)
    host.searchOrHost(GameMode.VERSUS)
    clock.advanceBy(1600)
    guest.searchOrHost(GameMode.VERSUS)
    bus.flush()
    assertEquals(SessionRole.CLIENT, guest.state.role)
    assertEquals(2, host.state.humanCount)
}
```

- [ ] **Step 2: Rodar RED**

Run: `./gradlew testDebugUnitTest --tests '*GameSessionTest*'`
Expected: FAIL porque a sessão não existe.

- [ ] **Step 3: Implementar sessão e transporte real**

```kotlin
interface DatagramTransport : Closeable {
    fun send(target: InetSocketAddress, bytes: ByteArray)
    fun receive(timeoutMillis: Int): ReceivedDatagram?
}
```

Anuncie a sala a cada 500 ms, crie host após 1,5 s sem anúncio compatível,
prefira menor ID em conflito, envie entradas a 30 Hz e snapshots a 15 Hz.
Marque cliente ausente após 3 s e substitua seu slot por bot.

- [ ] **Step 4: Rodar GREEN**

Run: `./gradlew testDebugUnitTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/kotlin/com/neonviper/game/network app/src/test
git commit -m "feat: add automatic LAN sessions"
```

### Task 7: Interface Canvas e experiência completa

**Files:**
- Create: `app/src/main/kotlin/com/neonviper/game/ui/Screen.kt`
- Create: `app/src/main/kotlin/com/neonviper/game/ui/Brand.kt`
- Create: `app/src/main/kotlin/com/neonviper/game/ui/NeonViperView.kt`
- Create: `app/src/main/kotlin/com/neonviper/game/ui/GameRenderer.kt`
- Create: `app/src/main/kotlin/com/neonviper/game/ui/MenuRenderer.kt`
- Test: `app/src/test/kotlin/com/neonviper/game/ui/ScreenReducerTest.kt`

**Interfaces:**
- Produces: splash, menu, busca/lobby, arena, resultado e ajustes.
- Consumes: `InputController`, `GameEngine` e `GameSession`.

- [ ] **Step 1: Testar navegação**

```kotlin
@Test fun `versus action enters LAN search`() {
    val next = ScreenReducer.reduce(HomeScreen, UiAction.Play(GameMode.VERSUS))
    assertEquals(SearchScreen(GameMode.VERSUS), next)
}

@Test fun `host disconnect returns to search with message`() {
    val next = ScreenReducer.reduce(ArenaScreen(GameMode.DUO), UiAction.HostLost)
    assertEquals(SearchScreen(GameMode.DUO, "HOST DESCONECTADO"), next)
}
```

- [ ] **Step 2: Rodar RED**

Run: `./gradlew testDebugUnitTest --tests '*ScreenReducerTest*'`
Expected: FAIL porque a máquina de telas não existe.

- [ ] **Step 3: Implementar reducer, loop e renderers**

```kotlin
sealed interface Screen
data object SplashScreen : Screen
data object HomeScreen : Screen
data class SearchScreen(val mode: GameMode, val message: String? = null) : Screen
data class ArenaScreen(val mode: GameMode) : Screen
data class ResultScreen(val outcome: GameOutcome) : Screen

object ScreenReducer {
    fun reduce(screen: Screen, action: UiAction): Screen = when (action) {
        is UiAction.Play -> SearchScreen(action.mode)
        UiAction.HostLost -> SearchScreen(screen.modeOrDefault(), "HOST DESCONECTADO")
        else -> screen
    }
}
```

Renderize a identidade NEON VIPER com shapes Canvas, área segura, botões
diagonais, HUD, cobra segmentada, partículas simples e indicadores com forma +
cor. O `SurfaceView` usa thread própria e pausa em `surfaceDestroyed`.

- [ ] **Step 4: Rodar GREEN e Android lint**

Run: `./gradlew testDebugUnitTest lintDebug`
Expected: PASS e zero erros.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/kotlin/com/neonviper/game/ui app/src/test
git commit -m "feat: deliver Neon Viper game experience"
```

### Task 8: APK e evidência final

**Files:**
- Modify: `README.md`
- Create: `docs/testing/neon-viper-smoke-test.md`
- Output: `app/build/outputs/apk/debug/app-debug.apk`

**Interfaces:**
- Produces: APK instalável e instruções de instalação/teste LAN.

- [ ] **Step 1: Documentar instalação e teste em dois aparelhos**

```markdown
1. Instale o mesmo APK nos dois Androids.
2. Conecte ambos à mesma rede Wi-Fi.
3. Abra NEON VIPER e toque no mesmo modo.
4. Confirme dois slots humanos no lobby.
5. Movimente ambos e desligue o Wi-Fi de um aparelho para validar o bot.
```

- [ ] **Step 2: Rodar todas as verificações do projeto**

Run: `bash .claude/skills/craft/scripts/checks.sh --run`
Expected: testes, lint e build sem falhas.

- [ ] **Step 3: Montar APK limpo e verificar pacote**

Run: `./gradlew clean testDebugUnitTest lintDebug assembleDebug`
Expected: `BUILD SUCCESSFUL` e
`app/build/outputs/apk/debug/app-debug.apk`.

- [ ] **Step 4: Verificar APK com Android build tools**

Run: `$ANDROID_HOME/build-tools/36.0.0/aapt2 dump badging app/build/outputs/apk/debug/app-debug.apk`
Expected: package `com.neonviper.game`, version `1.0.0`, landscape e SDK 26.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/testing
git commit -m "docs: add Neon Viper APK handoff"
```
