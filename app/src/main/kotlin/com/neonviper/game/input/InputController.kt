package com.neonviper.game.input

import com.neonviper.game.engine.PlayerInput
import com.neonviper.game.engine.Vec2

enum class ControlScheme { JOYSTICK, DRAG }

enum class PointerAction { DOWN, MOVE, UP }

class InputController(private val scheme: ControlScheme) {
    var stick: Vec2 = Vec2.ZERO
        private set
    private var origin: Vec2? = null
    private var latest = PlayerInput(Vec2(1f, 0f), boosting = false)

    fun onPointer(action: PointerAction, position: Vec2, boosting: Boolean = false): PlayerInput {
        when (action) {
            PointerAction.DOWN -> {
                origin = position
                latest = latest.copy(boosting = boosting)
            }
            PointerAction.UP -> {
                origin = null
                stick = Vec2.ZERO
                latest = latest.copy(boosting = false)
            }
            PointerAction.MOVE -> {
                val start = origin ?: position.also { origin = it }
                val delta = position - start
                if (delta.length() < DEAD_ZONE) {
                    latest = latest.copy(boosting = boosting)
                    stick = if (scheme == ControlScheme.JOYSTICK) delta else Vec2.ZERO
                    return latest
                }
                val direction = delta.normalized()
                stick = if (scheme == ControlScheme.JOYSTICK && delta.length() > RADIUS) {
                    direction * RADIUS
                } else if (scheme == ControlScheme.JOYSTICK) {
                    delta
                } else {
                    Vec2.ZERO
                }
                latest = PlayerInput(direction, boosting)
            }
        }
        return latest
    }

    companion object {
        const val RADIUS = 90f
        private const val DEAD_ZONE = 8f
    }
}
