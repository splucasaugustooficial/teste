package com.neonviper.game.ui

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import com.neonviper.game.engine.GameMode
import com.neonviper.game.engine.GameState
import com.neonviper.game.engine.SnakeState
import com.neonviper.game.engine.Team
import com.neonviper.game.engine.Vec2
import com.neonviper.game.input.ControlScheme
import kotlin.math.min

object GameRenderer {
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val face = Typeface.create("sans-serif-condensed", Typeface.BOLD)
    private val path = Path()

    fun draw(
        canvas: Canvas,
        state: GameState,
        scheme: ControlScheme,
        stick: Vec2,
        boosting: Boolean,
        elapsed: Float,
    ) {
        val width = canvas.width.toFloat()
        val height = canvas.height.toFloat()
        canvas.drawColor(Brand.MIDNIGHT)
        val scale = min(width, height) * 0.43f / state.arenaRadius
        val originX = width * 0.52f
        val originY = height * 0.52f
        drawArena(canvas, state, originX, originY, scale)
        state.food.forEach { food ->
            drawDiamond(canvas, originX + food.position.x * scale, originY - food.position.y * scale, 9f + elapsed % 1f)
        }
        state.snakes.values.forEach { snake ->
            if (snake.alive) drawSnake(canvas, snake, originX, originY, scale)
        }
        drawHud(canvas, state, width, height)
        drawMinimap(canvas, state, width, height)
        drawControls(canvas, width, height, scheme, stick, boosting)
    }

    private fun drawArena(canvas: Canvas, state: GameState, originX: Float, originY: Float, scale: Float) {
        stroke.color = Brand.GRID
        stroke.strokeWidth = 2f
        var ring = state.arenaRadius / 4f
        while (ring < state.arenaRadius) {
            canvas.drawCircle(originX, originY, ring * scale, stroke)
            ring += state.arenaRadius / 4f
        }
        stroke.color = Brand.LIME
        stroke.strokeWidth = 10f
        canvas.drawCircle(originX, originY, state.arenaRadius * scale, stroke)
        stroke.color = Brand.CYAN
        stroke.strokeWidth = 3f
        canvas.drawCircle(originX, originY, state.arenaRadius * scale - 8f, stroke)
    }

    private fun drawSnake(canvas: Canvas, snake: SnakeState, originX: Float, originY: Float, scale: Float) {
        val color = if (snake.team == Team.LIME) Brand.LIME else Brand.MAGENTA
        fill.color = color
        snake.body.forEachIndexed { index, point ->
            val radius = 7f + (index.toFloat() / snake.body.size.coerceAtLeast(1)) * 8f
            canvas.drawCircle(originX + point.x * scale, originY - point.y * scale, radius, fill)
        }
        val headX = originX + snake.head.x * scale
        val headY = originY - snake.head.y * scale
        canvas.drawCircle(headX, headY, 16f, fill)
        stroke.color = Brand.MIDNIGHT
        stroke.strokeWidth = 3f
        canvas.drawCircle(headX, headY, 16f, stroke)
        val side = Vec2(-snake.heading.y, snake.heading.x)
        fill.color = Brand.WHITE
        canvas.drawCircle(headX + snake.heading.x * 6f + side.x * 5f, headY - snake.heading.y * 6f - side.y * 5f, 3f, fill)
        canvas.drawCircle(headX + snake.heading.x * 6f - side.x * 5f, headY - snake.heading.y * 6f + side.y * 5f, 3f, fill)
        if (snake.team == Team.LIME) {
            fill.color = Brand.MIDNIGHT
            canvas.drawCircle(headX, headY, 4f, fill)
        } else {
            path.rewind()
            path.moveTo(headX, headY - 6f)
            path.lineTo(headX + 6f, headY + 4f)
            path.lineTo(headX - 6f, headY + 4f)
            path.close()
            fill.color = Brand.MIDNIGHT
            canvas.drawPath(path, fill)
        }
    }

    private fun drawDiamond(canvas: Canvas, x: Float, y: Float, size: Float) {
        path.rewind()
        path.moveTo(x, y - size)
        path.lineTo(x + size, y)
        path.lineTo(x, y + size)
        path.lineTo(x - size, y)
        path.close()
        fill.color = Brand.AMBER
        canvas.drawPath(path, fill)
    }

    private fun drawHud(canvas: Canvas, state: GameState, width: Float, height: Float) {
        fill.typeface = face
        fill.textAlign = Paint.Align.LEFT
        fill.textSize = height * 0.045f
        val lime = state.snakes.values.filter { it.team == Team.LIME }.sumOf { it.score }
        val magenta = state.snakes.values.filter { it.team == Team.MAGENTA }.sumOf { it.score }
        fill.color = Brand.LIME
        canvas.drawText("LIME $lime", width * 0.04f, height * 0.08f, fill)
        fill.color = Brand.MAGENTA
        canvas.drawText("MAGENTA $magenta", width * 0.04f, height * 0.14f, fill)
        fill.color = Brand.WHITE
        fill.textAlign = Paint.Align.CENTER
        val status = if (state.mode == GameMode.DUO) {
            "ONDA ${state.wave}"
        } else {
            "ÚLTIMO TIME VIVO"
        }
        canvas.drawText(status, width * 0.52f, height * 0.08f, fill)
    }

    private fun drawMinimap(canvas: Canvas, state: GameState, width: Float, height: Float) {
        val centerX = width * 0.88f
        val centerY = height * 0.16f
        val radius = height * 0.09f
        stroke.color = Brand.GRID
        stroke.strokeWidth = 3f
        canvas.drawCircle(centerX, centerY, radius, stroke)
        state.snakes.values.filter { it.alive }.forEach { snake ->
            fill.color = if (snake.team == Team.LIME) Brand.LIME else Brand.MAGENTA
            val x = centerX + snake.head.x / state.arenaRadius * radius
            val y = centerY - snake.head.y / state.arenaRadius * radius
            canvas.drawCircle(x, y, if (snake.bot) 3f else 5f, fill)
        }
    }

    private fun drawControls(canvas: Canvas, width: Float, height: Float, scheme: ControlScheme, stick: Vec2, boosting: Boolean) {
        val boost = MenuLayout.boostButton(width, height)
        stroke.color = if (boosting) Brand.AMBER else Brand.WHITE
        stroke.strokeWidth = 4f
        canvas.drawCircle(boost.centerX, boost.centerY, (boost.right - boost.left) / 2f, stroke)
        fill.color = if (boosting) Brand.AMBER else Brand.WHITE
        fill.textAlign = Paint.Align.CENTER
        fill.textSize = height * 0.028f
        canvas.drawText("IMPULSO", boost.centerX, boost.centerY + 8f, fill)
        if (scheme == ControlScheme.JOYSTICK) {
            val center = MenuLayout.joystickCenter(width, height)
            stroke.color = Brand.CYAN
            canvas.drawCircle(center.x, center.y, 78f, stroke)
            fill.color = Brand.CYAN
            canvas.drawCircle(center.x + stick.x, center.y + stick.y, 28f, fill)
        } else {
            fill.color = Brand.MUTED
            fill.textAlign = Paint.Align.LEFT
            canvas.drawText("ARRASTE PARA VIRAR", width * 0.04f, height * 0.94f, fill)
        }
    }
}
