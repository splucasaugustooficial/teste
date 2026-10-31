package com.neonviper.game.engine

import org.junit.Assert.assertEquals
import org.junit.Test

class MotionInterpolatorTest {
    @Test
    fun `halfway interpolation sits between the two heads`() {
        val previous = arena(Vec2(0f, 0f))
        val latest = arena(Vec2(10f, 0f))
        val rendered = MotionInterpolator.between(previous, latest, 0.5f)
        assertEquals(5f, rendered.snakes.getValue(0).head.x, 0.001f)
    }
}

private fun arena(head: Vec2): GameState {
    val snake = SnakeState(0, Team.LIME, "VIPER", false, head, Vec2(1f, 0f), listOf(head), 7f, 0, true, 8f)
    return GameState(GameMode.VERSUS, 40f, mapOf(0 to snake), emptyList(), 1, 0, null, 1L)
}
