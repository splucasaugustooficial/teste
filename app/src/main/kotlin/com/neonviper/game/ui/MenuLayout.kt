package com.neonviper.game.ui

import com.neonviper.game.engine.GameMode
import com.neonviper.game.engine.GameOutcome
import com.neonviper.game.engine.Team
import com.neonviper.game.engine.Vec2
import com.neonviper.game.input.ControlScheme

data class UiRect(val left: Float, val top: Float, val right: Float, val bottom: Float) {
    fun contains(x: Float, y: Float): Boolean = x in left..right && y in top..bottom

    fun intersects(other: UiRect): Boolean {
        return left < other.right && right > other.left && top < other.bottom && bottom > other.top
    }

    val centerX: Float get() = (left + right) / 2f
    val centerY: Float get() = (top + bottom) / 2f
}

data class MenuButton(val label: String, val rect: UiRect, val action: UiAction, val accent: Int)

object MenuLayout {
    fun home(width: Float, height: Float): List<MenuButton> {
        return column(
            width,
            height,
            listOf(
                Triple("DUPLA", UiAction.Play(GameMode.DUO), Brand.CYAN),
                Triple("CONTRA", UiAction.Play(GameMode.VERSUS), Brand.MAGENTA),
                Triple("TREINO", UiAction.Play(GameMode.TRAINING), Brand.LIME),
                Triple("AJUSTES", UiAction.OpenSettings, Brand.AMBER),
            ),
        )
    }

    fun settings(width: Float, height: Float): List<MenuButton> {
        return column(
            width,
            height,
            listOf(
                Triple("JOYSTICK", UiAction.SetControl(ControlScheme.JOYSTICK), Brand.CYAN),
                Triple("ARRASTAR", UiAction.SetControl(ControlScheme.DRAG), Brand.LIME),
                Triple("CODINOME", UiAction.Rename, Brand.AMBER),
                Triple("VOLTAR", UiAction.Back, Brand.MAGENTA),
            ),
        )
    }

    fun result(width: Float, height: Float): List<MenuButton> {
        val widthButton = width * 0.22f
        val top = height * 0.72f
        val bottom = top + height * 0.14f
        val gap = width * 0.03f
        val left = width * 0.27f
        return listOf(
            MenuButton("REVANCHE", UiRect(left, top, left + widthButton, bottom), UiAction.Rematch, Brand.LIME),
            MenuButton(
                "INÍCIO",
                UiRect(left + widthButton + gap, top, left + widthButton * 2f + gap, bottom),
                UiAction.Home,
                Brand.CYAN,
            ),
        )
    }

    fun back(width: Float, height: Float): MenuButton {
        return MenuButton(
            "VOLTAR",
            UiRect(width * 0.04f, height * 0.06f, width * 0.18f, height * 0.16f),
            UiAction.Back,
            Brand.MUTED,
        )
    }

    fun joystickCenter(width: Float, height: Float): Vec2 = Vec2(width * 0.14f, height * 0.74f)

    fun boostButton(width: Float, height: Float): UiRect {
        val size = height * 0.22f
        val right = width * 0.94f
        val bottom = height * 0.86f
        return UiRect(right - size, bottom - size, right, bottom)
    }

    fun outcomeLabel(outcome: GameOutcome): String = when (outcome) {
        is GameOutcome.TeamWon -> if (outcome.team == Team.LIME) "LIME VENCEU" else "MAGENTA VENCEU"
        GameOutcome.Defeat -> "ONDAS ENCERRADAS"
        GameOutcome.Draw -> "EMPATE"
    }

    fun hit(buttons: List<MenuButton>, x: Float, y: Float): MenuButton? = buttons.firstOrNull { it.rect.contains(x, y) }

    private fun column(width: Float, height: Float, entries: List<Triple<String, UiAction, Int>>): List<MenuButton> {
        val buttonWidth = width * 0.34f
        val buttonHeight = height * 0.13f
        val gap = height * 0.025f
        val left = width * 0.07f
        val top = height * 0.24f
        return entries.mapIndexed { index, (label, action, accent) ->
            val y = top + index * (buttonHeight + gap)
            MenuButton(label, UiRect(left, y, left + buttonWidth, y + buttonHeight), action, accent)
        }
    }
}
