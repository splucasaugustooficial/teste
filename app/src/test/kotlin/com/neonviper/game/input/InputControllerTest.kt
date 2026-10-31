package com.neonviper.game.input

import com.neonviper.game.engine.Vec2
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class InputControllerTest {
    @Test
    fun `drag control points from origin to current pointer`() {
        val controller = InputController(ControlScheme.DRAG)
        controller.onPointer(PointerAction.DOWN, Vec2(10f, 10f))
        val input = controller.onPointer(PointerAction.MOVE, Vec2(30f, 10f))
        assertEquals(Vec2(1f, 0f), input.direction)
    }

    @Test
    fun `short drag keeps the previous direction`() {
        val controller = InputController(ControlScheme.DRAG)
        controller.onPointer(PointerAction.DOWN, Vec2(10f, 10f))
        controller.onPointer(PointerAction.MOVE, Vec2(40f, 10f))
        val input = controller.onPointer(PointerAction.MOVE, Vec2(12f, 10f))
        assertEquals(Vec2(1f, 0f), input.direction)
    }

    @Test
    fun `joystick clamps the stick and returns a unit direction`() {
        val controller = InputController(ControlScheme.JOYSTICK)
        controller.onPointer(PointerAction.DOWN, Vec2.ZERO)
        val input = controller.onPointer(PointerAction.MOVE, Vec2(500f, 0f))
        assertEquals(1f, input.direction.x, 0.001f)
        assertEquals(0f, input.direction.y, 0.001f)
        assertTrue(controller.stick.length() <= InputController.RADIUS + 0.01f)
    }
}
