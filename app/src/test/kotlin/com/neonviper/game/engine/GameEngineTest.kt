package com.neonviper.game.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GameEngineTest {
    @Test
    fun `tick moves a living snake in its heading`() {
        val engine = GameEngine.newGame(GameMode.VERSUS, seed = 7L)
        val before = engine.state.snakes.getValue(0).head
        engine.setInput(0, PlayerInput(Vec2(1f, 0f), boosting = false))
        val after = engine.tick(1f / 30f).snakes.getValue(0).head
        assertTrue(after.x > before.x)
    }

    @Test
    fun `food grows the snake and increments score`() {
        val engine = fixture(head = Vec2(10f, 10f), food = listOf(Food(1, Vec2(11f, 10f))))
        val state = engine.tick(1f / 30f)
        assertTrue(state.snakes.getValue(0).score > 0)
        assertFalse(state.food.any { it.id == 1 })
    }

    @Test
    fun `boost spends length and moves faster than the base speed`() {
        val engine = GameEngine.fromState(
            arena(GameMode.TRAINING, listOf(snake(id = 0, team = Team.LIME, head = Vec2.ZERO, length = 10f))),
        )
        engine.setInput(0, PlayerInput(Vec2(1f, 0f), boosting = true))
        val state = engine.tick(0.25f)
        assertTrue(state.snakes.getValue(0).length < 10f)
        assertTrue(state.snakes.getValue(0).head.x > 3f)
    }

    @Test
    fun `enemy contact eliminates the snake`() {
        val player = snake(id = 0, team = Team.LIME, head = Vec2.ZERO)
        val enemy = snake(id = 2, team = Team.MAGENTA, head = Vec2(0.2f, 0f))
        val engine = GameEngine.fromState(arena(GameMode.VERSUS, listOf(player, enemy)))
        assertFalse(engine.tick(0f).snakes.getValue(0).alive)
    }

    @Test
    fun `allies can overlap without elimination`() {
        val first = snake(id = 0, team = Team.LIME, head = Vec2.ZERO)
        val second = snake(id = 1, team = Team.LIME, head = Vec2(0.1f, 0f))
        val engine = GameEngine.fromState(arena(GameMode.DUO, listOf(first, second)))
        val state = engine.tick(0f)
        assertTrue(state.snakes.getValue(0).alive)
        assertTrue(state.snakes.getValue(1).alive)
    }

    @Test
    fun `arena boundary eliminates the snake`() {
        val engine = fixture(head = Vec2(39.8f, 0f))
        assertFalse(engine.tick(0f).snakes.getValue(0).alive)
    }

    @Test
    fun `versus ends when only one team remains`() {
        val alive = snake(id = 0, team = Team.LIME, head = Vec2.ZERO)
        val dead = snake(id = 2, team = Team.MAGENTA, head = Vec2(20f, 0f)).copy(alive = false)
        val engine = GameEngine.fromState(arena(GameMode.VERSUS, listOf(alive, dead)))
        assertEquals(GameOutcome.TeamWon(Team.LIME), engine.tick(0f).outcome)
    }

    @Test
    fun `versus continues while both teams are alive`() {
        val lime = snake(id = 0, team = Team.LIME, head = Vec2(-10f, 0f))
        val magenta = snake(id = 2, team = Team.MAGENTA, head = Vec2(10f, 0f))
        val engine = GameEngine.fromState(arena(GameMode.VERSUS, listOf(lime, magenta)))
        assertNull(engine.tick(0f).outcome)
    }

    @Test
    fun `duo advances after all enemies are eliminated`() {
        val allies = listOf(
            snake(id = 0, team = Team.LIME, head = Vec2(-8f, 0f)),
            snake(id = 1, team = Team.LIME, head = Vec2(-4f, 0f), bot = true),
        )
        val engine = GameEngine.fromState(arena(GameMode.DUO, allies, wave = 1))
        assertEquals(2, engine.tick(0f).wave)
    }

    @Test
    fun `duo ends when both allies are eliminated`() {
        val allies = listOf(
            snake(id = 0, team = Team.LIME, head = Vec2.ZERO).copy(alive = false),
            snake(id = 1, team = Team.LIME, head = Vec2(2f, 0f)).copy(alive = false),
        )
        val engine = GameEngine.fromState(arena(GameMode.DUO, allies))
        assertEquals(GameOutcome.Defeat, engine.tick(0f).outcome)
    }

    @Test
    fun `three hundred ticks keep living snakes inside the arena`() {
        val engine = GameEngine.newGame(GameMode.VERSUS, seed = 99L)
        var state = engine.state
        repeat(300) { state = engine.tick(1f / 30f) }
        state.snakes.values.filter { it.alive }.forEach { snake ->
            assertTrue(snake.head.length() <= state.arenaRadius)
        }
    }
}

private fun fixture(head: Vec2, food: List<Food> = emptyList(), length: Float = 7f): GameEngine {
    return GameEngine.fromState(arena(GameMode.VERSUS, listOf(snake(id = 0, team = Team.LIME, head = head, length = length)), food))
}

private fun arena(mode: GameMode, snakes: List<SnakeState>, food: List<Food> = emptyList(), wave: Int = 1): GameState {
    return GameState(
        mode = mode,
        arenaRadius = GameEngine.ARENA_RADIUS,
        snakes = snakes.associateBy { it.id },
        food = food,
        wave = wave,
        tick = 0,
        outcome = null,
        seed = 1L,
    )
}

private fun snake(
    id: Int,
    team: Team,
    head: Vec2,
    length: Float = 7f,
    bot: Boolean = false,
): SnakeState {
    return SnakeState(
        id = id,
        team = team,
        name = "VIPER",
        bot = bot,
        head = head,
        heading = Vec2(1f, 0f),
        body = listOf(head - Vec2(length, 0f), head),
        length = length,
        score = 0,
        alive = true,
        speed = 8f,
    )
}
