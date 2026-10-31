package com.cobrarede.snake

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import androidx.core.graphics.withTranslation
import kotlin.math.hypot
import kotlin.math.min

class GameView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    var onSteer: ((Float) -> Unit)? = null
    var onFrame: (() -> Unit)? = null

    private var mode = GameMode.VERSUS
    private var localPlayerId = 0
    private var running = false

    private val gridPaint =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(40, 255, 255, 255)
            strokeWidth = 1f
        }
    private val foodPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val headPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val bodyPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val namePaint =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = 28f
        }
    private val joystickPaint =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(90, 255, 255, 255)
        }
    private val joystickKnobPaint =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(180, 61, 220, 132)
        }

    private var steerAngle = 0f
    private var touchActive = false
    private var joyCx = 0f
    private var joyCy = 0f
    private var knobX = 0f
    private var knobY = 0f
    private val joyRadius = 120f
    private val knobRadius = 36f

    private var camX = 0f
    private var camY = 0f

    private val paletteVersus =
        listOf(
            0xFF3DDC84.toInt(),
            0xFF58D9FF.toInt(),
            0xFFFF7B72.toInt(),
            0xFFD2A8FF.toInt(),
            0xFFFFA657.toInt(),
            0xFF79C0FF.toInt(),
            0xFF7EE787.toInt(),
            0xFFFFE066.toInt(),
        )
    private val paletteDuo =
        listOf(
            0xFF3DDC84.toInt(),
            0xFF2EA043.toInt(),
            0xFF58D9FF.toInt(),
            0xFF1F6FEB.toInt(),
        )

    fun configure(mode: GameMode, localPlayerId: Int) {
        this.mode = mode
        this.localPlayerId = localPlayerId
    }

    fun startLoop() {
        running = true
        post(frameRunnable)
    }

    fun stopLoop() {
        running = false
        removeCallbacks(frameRunnable)
    }

    private val frameRunnable =
        object : Runnable {
            override fun run() {
                if (!running) return
                onFrame?.invoke()
                invalidate()
                postOnAnimationDelayed(this, 16)
            }
        }

    fun renderEngine(engine: GameEngine) {
        val me = engine.snakes.firstOrNull { it.id == localPlayerId }
        if (me != null && me.alive) {
            val targetX = me.headX - width / 2f
            val targetY = me.headY - height / 2f
            camX += (targetX - camX) * 0.15f
            camY += (targetY - camY) * 0.15f
            camX = camX.coerceIn(0f, GameEngine.WORLD - width)
            camY = camY.coerceIn(0f, GameEngine.WORLD - height)
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        canvas.drawColor(0xFF0D1117.toInt())

        val engine =
            if (GameSession.server != null) GameSession.server?.snapshotEngine() else GameSession.clientEngine

        canvas.withTranslation(-camX, -camY) {
            drawGrid(this)
            engine?.let { drawWorld(this, it) }
        }
        drawJoystick(canvas)
    }

    private fun drawGrid(canvas: Canvas) {
        val step = 80f
        var x = 0f
        while (x <= GameEngine.WORLD) {
            canvas.drawLine(x, 0f, x, GameEngine.WORLD, gridPaint)
            x += step
        }
        var y = 0f
        while (y <= GameEngine.WORLD) {
            canvas.drawLine(0f, y, GameEngine.WORLD, y, gridPaint)
            y += step
        }
        gridPaint.color = Color.argb(120, 61, 220, 132)
        canvas.drawRect(0f, 0f, GameEngine.WORLD, GameEngine.WORLD, gridPaint.apply { style = Paint.Style.STROKE; strokeWidth = 4f })
        gridPaint.style = Paint.Style.FILL
        gridPaint.color = Color.argb(40, 255, 255, 255)
    }

    private fun drawWorld(canvas: Canvas, engine: GameEngine) {
        for (food in engine.foods) {
            val r = if (food.value > 1) 10f else 6f
            foodPaint.shader =
                RadialGradient(
                    food.x,
                    food.y,
                    r * 2,
                    Color.argb(220, 255, 220, 100),
                    Color.argb(40, 255, 220, 100),
                    Shader.TileMode.CLAMP,
                )
            canvas.drawCircle(food.x, food.y, r, foodPaint)
            foodPaint.shader = null
        }

        for (snake in engine.snakes) {
            if (!snake.alive) continue
            val color = colorFor(snake)
            bodyPaint.color = color
            headPaint.color = color
            for ((i, seg) in snake.segments.withIndex()) {
                val rad = if (i == 0) GameEngine.HEAD_RADIUS else GameEngine.SEGMENT_RADIUS
                canvas.drawCircle(seg.first, seg.second, rad, if (i == 0) headPaint else bodyPaint)
            }
            canvas.drawText(snake.name, snake.headX - 20f, snake.headY - 24f, namePaint)
        }
    }

    private fun colorFor(snake: PlayerSnake): Int {
        val palette = if (mode == GameMode.DUO) paletteDuo else paletteVersus
        val idx = if (snake.team >= 0) snake.team else snake.id
        return palette[idx % palette.size]
    }

    private fun drawJoystick(canvas: Canvas) {
        if (width == 0) return
        if (joyCx == 0f) {
            joyCx = joyRadius + 48f
            joyCy = height - joyRadius - 48f
            knobX = joyCx
            knobY = joyCy
        }
        canvas.drawCircle(joyCx, joyCy, joyRadius, joystickPaint)
        canvas.drawCircle(knobX, knobY, knobRadius, joystickKnobPaint)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (width == 0 || height == 0) return true
        if (joyCx == 0f) {
            joyCx = joyRadius + 48f
            joyCy = height - joyRadius - 48f
        }
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> {
                val dx = event.x - joyCx
                val dy = event.y - joyCy
                val dist = hypot(dx, dy)
                val clamped = min(dist, joyRadius - knobRadius)
                val angle =
                    GameEngine.angleFromTouch(
                        joyCx + if (dist > 0) dx / dist * clamped else 0f,
                        joyCy + if (dist > 0) dy / dist * clamped else 0f,
                        joyCx,
                        joyCy,
                    )
                steerAngle = angle
                knobX = joyCx + if (dist > 0) dx / dist * clamped else 0f
                knobY = joyCy + if (dist > 0) dy / dist * clamped else 0f
                touchActive = true
                onSteer?.invoke(steerAngle)
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                touchActive = false
                knobX = joyCx
                knobY = joyCy
            }
        }
        return true
    }
}
