package com.neonviper.game.ui

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import com.neonviper.game.input.ControlScheme

object MenuRenderer {
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val titleFace = Typeface.create("sans-serif-black", Typeface.BOLD)
    private val bodyFace = Typeface.create("sans-serif-condensed", Typeface.BOLD)
    private val path = Path()

    fun draw(
        canvas: Canvas,
        screen: Screen,
        buttons: List<MenuButton>,
        subtitle: String,
        roster: List<String>,
        countdown: Float,
        elapsed: Float,
        scheme: ControlScheme,
    ) {
        val width = canvas.width.toFloat()
        val height = canvas.height.toFloat()
        drawBackdrop(canvas, width, height, elapsed)
        val markX = width * 0.72f
        val markY = height * 0.40f
        drawMark(canvas, markX, markY, height * 0.16f)
        fill.color = Brand.WHITE
        fill.textAlign = Paint.Align.CENTER
        fill.typeface = titleFace
        fill.textSize = height * 0.075f
        canvas.drawText("NEON VIPER", markX, markY + height * 0.28f, fill)
        fill.color = Brand.LIME
        fill.typeface = bodyFace
        fill.textSize = height * 0.028f
        canvas.drawText("ARENA LOCAL  ·  SEM ANÚNCIOS", markX, markY + height * 0.33f, fill)
        fill.color = Brand.WHITE
        fill.textSize = height * 0.05f
        val heading = heading(screen)
        if (heading.isNotEmpty()) canvas.drawText(heading, width * 0.28f, height * 0.16f, fill)
        fill.color = Brand.MUTED
        fill.textSize = height * 0.03f
        if (subtitle.isNotEmpty()) canvas.drawText(subtitle, width * 0.28f, height * 0.21f, fill)
        buttons.forEach { button -> drawButton(canvas, button, selected(button, scheme)) }
        roster.forEachIndexed { index, line ->
            fill.color = if (line.contains("MAGENTA")) Brand.MAGENTA else Brand.CYAN
            fill.textAlign = Paint.Align.LEFT
            fill.textSize = height * 0.038f
            canvas.drawText(line, width * 0.52f, height * 0.58f + index * height * 0.055f, fill)
        }
        if (countdown > 0f && screen is LobbyScreen) {
            fill.color = Brand.AMBER
            fill.textAlign = Paint.Align.CENTER
            fill.textSize = height * 0.09f
            canvas.drawText(countdown.toInt().coerceAtLeast(1).toString(), width * 0.72f, height * 0.84f, fill)
        }
    }

    private fun drawBackdrop(canvas: Canvas, width: Float, height: Float, elapsed: Float) {
        canvas.drawColor(Brand.MIDNIGHT)
        stroke.color = Brand.GRID
        stroke.strokeWidth = 2f
        var radius = 40f
        while (radius < width) {
            canvas.drawCircle(width * 0.72f, height * 0.42f, radius, stroke)
            radius += 70f
        }
        fill.color = Brand.LIME
        val pulse = 8f + (elapsed * 40f) % 80f
        fill.alpha = 90
        canvas.drawCircle(width * 0.72f, height * 0.42f, pulse, fill)
        fill.alpha = 255
    }

    private fun drawButton(canvas: Canvas, button: MenuButton, selected: Boolean) {
        val slant = (button.rect.bottom - button.rect.top) * 0.28f
        path.rewind()
        path.moveTo(button.rect.left + slant, button.rect.top)
        path.lineTo(button.rect.right, button.rect.top)
        path.lineTo(button.rect.right - slant, button.rect.bottom)
        path.lineTo(button.rect.left, button.rect.bottom)
        path.close()
        fill.color = if (selected) button.accent else Brand.SURFACE
        fill.alpha = if (selected) 210 else 230
        canvas.drawPath(path, fill)
        fill.alpha = 255
        stroke.color = button.accent
        stroke.strokeWidth = if (selected) 7f else 3f
        canvas.drawPath(path, stroke)
        fill.color = if (selected) Brand.MIDNIGHT else Brand.WHITE
        fill.typeface = bodyFace
        fill.textAlign = Paint.Align.CENTER
        fill.textSize = (button.rect.bottom - button.rect.top) * 0.38f
        val baseline = button.rect.centerY - (fill.fontMetrics.ascent + fill.fontMetrics.descent) / 2f
        canvas.drawText(button.label, button.rect.centerX, baseline, fill)
    }

    private fun heading(screen: Screen): String = when (screen) {
        SplashScreen, HomeScreen -> ""
        is SearchScreen -> "PROCURANDO SINAL"
        is LobbyScreen -> "SALA ENCONTRADA"
        is ArenaScreen -> ""
        is ResultScreen -> MenuLayout.outcomeLabel(screen.outcome)
        SettingsScreen -> "CONTROLE"
    }

    private fun selected(button: MenuButton, scheme: ControlScheme): Boolean {
        val action = button.action
        return action is UiAction.SetControl && action.scheme == scheme
    }

    fun drawMark(canvas: Canvas, centerX: Float, centerY: Float, size: Float) {
        path.rewind()
        path.moveTo(centerX, centerY - size)
        path.lineTo(centerX + size * 0.78f, centerY + size * 0.62f)
        path.lineTo(centerX + size * 0.30f, centerY + size * 0.62f)
        path.lineTo(centerX, centerY - size * 0.08f)
        path.lineTo(centerX - size * 0.30f, centerY + size * 0.62f)
        path.lineTo(centerX - size * 0.78f, centerY + size * 0.62f)
        path.close()
        fill.color = Brand.LIME
        fill.alpha = 45
        canvas.save()
        canvas.scale(1.12f, 1.12f, centerX, centerY)
        canvas.drawPath(path, fill)
        canvas.restore()
        fill.alpha = 255
        canvas.drawPath(path, fill)
        fill.color = Brand.CYAN
        canvas.drawCircle(centerX - size * 0.16f, centerY + size * 0.22f, size * 0.055f, fill)
        canvas.drawCircle(centerX + size * 0.16f, centerY + size * 0.22f, size * 0.055f, fill)
        path.rewind()
        path.moveTo(centerX - size * 0.05f, centerY + size * 0.70f)
        path.lineTo(centerX + size * 0.18f, centerY + size * 0.70f)
        path.lineTo(centerX + size * 0.02f, centerY + size)
        path.lineTo(centerX + size * 0.10f, centerY + size)
        path.lineTo(centerX - size * 0.16f, centerY + size * 0.70f)
        path.close()
        fill.color = Brand.MAGENTA
        canvas.drawPath(path, fill)
    }
}
