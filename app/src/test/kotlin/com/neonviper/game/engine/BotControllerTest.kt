package com.neonviper.game.engine

import org.junit.Assert.assertTrue
import org.junit.Test

class BotControllerTest {
    @Test
    fun `bot turns away from the arena boundary`() {
        val state = GameState(
            mode = GameMode.VERSUS,
            arenaRadius = 40f,
            snakes = mapOf(2 to boundarySnake()),
            food = emptyList(),
            wave = 1,
            tick = 0,
            outcome = null,
            seed = 1L,
        )
        val input = BotController.chooseInput(state, 2, 0.5f)
        assertTrue(input.direction.x < 0f)
    }

    @Test
    fun `bot in open space seeks the nearest food`() {
        val snake = boundarySnake().copy(id = 0, head = Vec2.ZERO, heading = Vec2(0f, 1f), body = listOf(Vec2.ZERO))
        val state = GameState(
            mode = GameMode.TRAINING,
            arenaRadius = 40f,
            snakes = mapOf(0 to snake),
            food = listOf(Food(1, Vec2(10f, 0f))),
            wave = 1,
            tick = 0,
            outcome = null,
            seed = 1L,
        )
        val input = BotController.chooseInput(state, 0, 0.4f)
        assertTrue(input.direction.x > 0.5f)
    }
}

private fun boundarySnake(): SnakeState {
    return SnakeState(
        id = 2,
        team = Team.MAGENTA,
        name = "BOT",
        bot = true,
        head = Vec2(31f, 0f),
        heading = Vec2(1f, 0f),
        body = listOf(Vec2(31f, 0f)),
        length = 6f,
        score = 0,
        alive = true,
        speed = 8f,
    )
}
