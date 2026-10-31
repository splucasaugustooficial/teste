package com.neonviper.game.ui

import android.app.AlertDialog
import android.content.Context
import android.graphics.Canvas
import android.media.AudioManager
import android.media.ToneGenerator
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.text.InputType
import android.view.MotionEvent
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import com.neonviper.game.engine.GameEngine
import com.neonviper.game.engine.GameMode
import com.neonviper.game.engine.GameState
import com.neonviper.game.engine.PlayerInput
import com.neonviper.game.engine.Vec2
import com.neonviper.game.input.ControlScheme
import com.neonviper.game.input.InputController
import com.neonviper.game.input.PointerAction
import com.neonviper.game.network.GameSession
import com.neonviper.game.network.SessionPhase
import com.neonviper.game.network.SessionRole
import com.neonviper.game.network.SystemGameClock
import com.neonviper.game.network.UdpTransport
import java.util.UUID
import java.util.concurrent.atomic.AtomicReference

class NeonViperView(context: Context) : SurfaceView(context), SurfaceHolder.Callback {
    private val preferences = context.getSharedPreferences("neon-viper", Context.MODE_PRIVATE)
    private val identity = UUID.randomUUID().toString().substring(0, 8)
    private val gate = Any()
    private val desired = AtomicReference(PlayerInput(Vec2(1f, 0f), false))
    private var scheme = if (preferences.getString(KEY_CONTROL, "JOYSTICK") == "DRAG") ControlScheme.DRAG else ControlScheme.JOYSTICK
    private var controller = InputController(scheme)
    private var playerName = preferences.getString(KEY_NAME, "VIPER")?.take(16)?.ifBlank { "VIPER" } ?: "VIPER"
    private var screen: Screen = SplashScreen
    private var session: GameSession? = null
    private var local: GameEngine? = null
    private var world: GameState? = null
    private var subtitle = ""
    private var roster = emptyList<String>()
    private var countdown = 3f
    private var lastHumans = -1
    private var splashRemaining = 1.1f
    private var elapsed = 0f
    private var paused = false
    private var running = false
    private var steerPointer = -1
    private var boostPointer = -1
    private var boosting = false
    private var tones: ToneGenerator? = null
    private var multicast: WifiManager.MulticastLock? = null
    private var thread: Thread? = null

    init {
        holder.addCallback(this)
        keepScreenOn = true
        isFocusable = true
    }

    fun onHostPause() {
        paused = true
    }

    fun onHostResume() {
        paused = false
    }

    override fun surfaceCreated(holder: SurfaceHolder) {
        running = true
        tones = try {
            ToneGenerator(AudioManager.STREAM_MUSIC, 45)
        } catch (_: RuntimeException) {
            null
        }
        thread = Thread(this::loop, "neon-viper").also { it.start() }
    }

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) = Unit

    override fun surfaceDestroyed(holder: SurfaceHolder) {
        running = false
        thread?.join(700)
        thread = null
        closeSession()
        tones?.release()
        tones = null
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        synchronized(gate) { handleTouch(event) }
        return true
    }

    private fun loop() {
        var last = System.nanoTime()
        while (running) {
            val now = System.nanoTime()
            val delta = ((now - last) / 1_000_000_000f).coerceIn(0f, 0.05f)
            last = now
            if (!paused) synchronized(gate) { update(delta) }
            val frame = synchronized(gate) { copyFrame() }
            val canvas = holder.lockCanvas() ?: continue
            try {
                drawFrame(canvas, frame)
            } finally {
                holder.unlockCanvasAndPost(canvas)
            }
            val spare = 16_000_000L - (System.nanoTime() - now)
            if (spare > 1_000_000L) Thread.sleep(spare / 1_000_000L)
        }
    }

    private fun update(delta: Float) {
        elapsed += delta
        when (val current = screen) {
            SplashScreen -> {
                splashRemaining -= delta
                if (splashRemaining <= 0f) screen = ScreenReducer.reduce(screen, UiAction.SplashFinished)
            }
            is SearchScreen -> updateSearch(current)
            is LobbyScreen -> updateLobby(current, delta)
            is ArenaScreen -> updateArena(current, delta)
            HomeScreen, SettingsScreen, is ResultScreen -> Unit
        }
    }

    private fun updateSearch(current: SearchScreen) {
        val live = session
        if (live == null) {
            screen = LobbyScreen(current.mode, subtitle.ifBlank { current.message })
            countdown = 3f
            return
        }
        live.pump()
        subtitle = live.state.message ?: "SINAL ENCONTRADO"
        if (live.state.role == SessionRole.HOST || live.state.role == SessionRole.CLIENT) {
            screen = LobbyScreen(current.mode, live.state.message)
            countdown = 3f
            lastHumans = -1
            tone(ToneGenerator.TONE_PROP_ACK)
        }
    }

    private fun updateLobby(current: LobbyScreen, delta: Float) {
        val live = session
        live?.pump()
        if (live?.state?.phase == SessionPhase.ENDED || live?.state?.message == "HOST DESCONECTADO") {
            screen = ScreenReducer.reduce(current, UiAction.HostLost)
            return
        }
        if (live?.state?.phase == SessionPhase.MATCH) {
            screen = ArenaScreen(current.mode)
            tone(ToneGenerator.TONE_DTMF_0)
            return
        }
        val humans = live?.state?.humanCount ?: 1
        if (humans != lastHumans) {
            lastHumans = humans
            countdown = 3f
        }
        subtitle = when (live?.state?.role) {
            SessionRole.CLIENT -> "AGUARDANDO O HOST"
            else -> live?.state?.message ?: current.message ?: "BOTS PREENCHEM AS VAGAS"
        }
        roster = live?.state?.roster?.map { slot ->
            val who = if (slot.human) slot.name else "BOT"
            "${slot.team.name}  $who"
        } ?: offlineRoster(current.mode)
        if (live?.state?.role == SessionRole.CLIENT) return
        countdown -= delta
        if (countdown <= 0f) beginMatch(current.mode)
    }

    private fun beginMatch(mode: GameMode) {
        if (session?.state?.role == SessionRole.HOST) session?.startMatch()
        if (session == null) local = GameEngine.newGame(mode, System.nanoTime())
        world = session?.engine?.state ?: local?.state
        screen = ArenaScreen(mode)
        tone(ToneGenerator.TONE_DTMF_0)
    }

    private fun updateArena(current: ArenaScreen, delta: Float) {
        val input = desired.get()
        val live = session
        if (live?.state?.role == SessionRole.CLIENT) {
            live.setLocalInput(input)
            live.update(delta)
            if (live.state.phase == SessionPhase.ENDED || live.state.message == "HOST DESCONECTADO") {
                screen = ScreenReducer.reduce(current, UiAction.HostLost)
                return
            }
            world = live.renderState(System.currentTimeMillis())
        } else if (live?.state?.role == SessionRole.HOST) {
            live.setLocalInput(input)
            live.update(delta)
            world = live.engine?.state
        } else {
            local?.setInput(0, input)
            world = local?.tick(delta)
        }
        val outcome = world?.outcome ?: return
        screen = ResultScreen(current.mode, outcome)
        roster = world?.snakes?.values?.sortedByDescending { it.score }?.map { snake ->
            "${snake.name}  ${snake.score}"
        }.orEmpty()
        tone(ToneGenerator.TONE_SUP_ERROR)
    }

    private fun handleTouch(event: MotionEvent) {
        val index = event.actionIndex
        val pointer = event.getPointerId(index)
        val x = event.getX(index)
        val y = event.getY(index)
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> onDown(pointer, x, y)
            MotionEvent.ACTION_MOVE -> {
                for (offset in 0 until event.pointerCount) {
                    if (event.getPointerId(offset) == steerPointer) {
                        val finger = Vec2(event.getX(offset), event.getY(offset))
                        val input = if (scheme == ControlScheme.JOYSTICK) {
                            val center = MenuLayout.joystickCenter(width.toFloat(), height.toFloat())
                            controller.onPointer(PointerAction.MOVE, Vec2(center.x, center.y) + (finger - center), boosting)
                        } else {
                            controller.onPointer(PointerAction.MOVE, finger, boosting)
                        }
                        desired.set(input.copy(boosting = boosting))
                    }
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP, MotionEvent.ACTION_CANCEL -> {
                onUp(pointer, x, y)
                performClick()
            }
        }
    }

    private fun onDown(pointer: Int, x: Float, y: Float) {
        if (screen is ArenaScreen) {
            val boost = MenuLayout.boostButton(width.toFloat(), height.toFloat())
            if (boost.contains(x, y)) {
                boostPointer = pointer
                boosting = true
                desired.set(desired.get().copy(boosting = true))
                return
            }
            steerPointer = pointer
            val origin = if (scheme == ControlScheme.JOYSTICK) {
                val center = MenuLayout.joystickCenter(width.toFloat(), height.toFloat())
                Vec2(center.x, center.y)
            } else {
                Vec2(x, y)
            }
            controller = InputController(scheme)
            val input = controller.onPointer(PointerAction.DOWN, origin, boosting)
            if (scheme == ControlScheme.JOYSTICK) {
                val center = MenuLayout.joystickCenter(width.toFloat(), height.toFloat())
                desired.set(controller.onPointer(PointerAction.MOVE, Vec2(x, y) + (origin - center), boosting))
            } else {
                desired.set(input)
            }
            return
        }
        val buttons = buttonsFor(screen, width.toFloat(), height.toFloat())
        MenuLayout.hit(buttons, x, y)?.let { activate(it.action) }
    }

    private fun onUp(pointer: Int, x: Float, y: Float) {
        if (pointer == boostPointer) {
            boostPointer = -1
            boosting = false
            desired.set(desired.get().copy(boosting = false))
        }
        if (pointer == steerPointer) {
            steerPointer = -1
            controller.onPointer(PointerAction.UP, Vec2(x, y), false)
        }
    }

    private fun activate(action: UiAction) {
        when (action) {
            is UiAction.SetControl -> {
                scheme = action.scheme
                controller = InputController(scheme)
                preferences.edit().putString(KEY_CONTROL, scheme.name).apply()
            }
            UiAction.Rename -> askName()
            is UiAction.Play -> {
                screen = ScreenReducer.reduce(screen, action)
                openMatch(action.mode)
            }
            UiAction.Rematch -> {
                val mode = screen.modeOf()
                screen = ScreenReducer.reduce(screen, action)
                openMatch(mode)
            }
            UiAction.Back, UiAction.Home -> {
                closeSession()
                local = null
                world = null
                screen = ScreenReducer.reduce(screen, action)
            }
            else -> screen = ScreenReducer.reduce(screen, action)
        }
    }

    private fun openMatch(mode: GameMode) {
        closeSession()
        local = null
        world = null
        roster = emptyList()
        if (mode == GameMode.TRAINING || !lanAvailable()) {
            subtitle = if (mode == GameMode.TRAINING) "TREINO LIVRE" else "SEM WI-FI"
            if (mode == GameMode.TRAINING) {
                local = GameEngine.newGame(mode, System.nanoTime())
                world = local?.state
                screen = ArenaScreen(mode)
            }
            return
        }
        try {
            val wifi = context.applicationContext.getSystemService(WifiManager::class.java)
            multicast = wifi?.createMulticastLock("neon-viper")?.apply {
                setReferenceCounted(false)
                acquire()
            }
            val created = GameSession(UdpTransport(), SystemGameClock(), identity, playerName)
            created.searchOrHost(mode)
            session = created
            subtitle = "PROCURANDO NA REDE"
        } catch (_: Exception) {
            subtitle = "SEM WI-FI"
            session = null
        }
    }

    private fun askName() {
        val field = EditText(context).apply {
            setText(playerName)
            inputType = InputType.TYPE_CLASS_TEXT
            imeOptions = EditorInfo.IME_ACTION_DONE
        }
        AlertDialog.Builder(context)
            .setTitle("CODINOME")
            .setView(field)
            .setPositiveButton("SALVAR") { _, _ ->
                playerName = field.text.toString().trim().take(16).ifBlank { "VIPER" }
                preferences.edit().putString(KEY_NAME, playerName).apply()
            }
            .setNegativeButton("CANCELAR", null)
            .show()
    }

    private fun copyFrame(): Frame {
        val visibleCountdown = if (session?.state?.role == SessionRole.CLIENT) 0f else countdown
        return Frame(
            screen,
            world,
            buttonsFor(screen, width.toFloat(), height.toFloat()),
            subtitle,
            roster,
            visibleCountdown,
            elapsed,
            scheme,
            controller.stick,
            boosting,
        )
    }

    private fun drawFrame(canvas: Canvas, frame: Frame) {
        val match = frame.world
        if (frame.screen is ArenaScreen && match != null) {
            GameRenderer.draw(canvas, match, frame.scheme, frame.stick, frame.boosting, frame.elapsed)
        } else if (frame.screen is SplashScreen) {
            canvas.drawColor(Brand.MIDNIGHT)
            MenuRenderer.drawMark(canvas, canvas.width / 2f, canvas.height / 2f, canvas.height * 0.18f)
        } else {
            MenuRenderer.draw(canvas, frame.screen, frame.buttons, frame.subtitle, frame.roster, frame.countdown, frame.elapsed, frame.scheme)
        }
    }

    private fun buttonsFor(screen: Screen, width: Float, height: Float): List<MenuButton> = when (screen) {
        HomeScreen -> MenuLayout.home(width, height)
        SettingsScreen -> MenuLayout.settings(width, height)
        is ResultScreen -> MenuLayout.result(width, height)
        is SearchScreen, is LobbyScreen -> listOf(MenuLayout.back(width, height))
        else -> emptyList()
    }

    private fun offlineRoster(mode: GameMode): List<String> = when (mode) {
        GameMode.DUO -> listOf("LIME  $playerName", "LIME  BOT", "MAGENTA  ONDAS")
        GameMode.VERSUS -> listOf("LIME  $playerName", "LIME  BOT", "MAGENTA  BOT", "MAGENTA  BOT")
        GameMode.TRAINING -> listOf("LIME  $playerName")
    }

    private fun lanAvailable(): Boolean {
        val manager = context.getSystemService(ConnectivityManager::class.java) ?: return false
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
    }

    private fun closeSession() {
        session?.close()
        session = null
        multicast?.release()
        multicast = null
    }

    private fun tone(kind: Int) {
        try {
            tones?.startTone(kind, 70)
        } catch (_: RuntimeException) {
            // Audio is optional feedback.
        }
    }

    private data class Frame(
        val screen: Screen,
        val world: GameState?,
        val buttons: List<MenuButton>,
        val subtitle: String,
        val roster: List<String>,
        val countdown: Float,
        val elapsed: Float,
        val scheme: ControlScheme,
        val stick: Vec2,
        val boosting: Boolean,
    )

    private companion object {
        const val KEY_CONTROL = "control"
        const val KEY_NAME = "name"
    }
}
