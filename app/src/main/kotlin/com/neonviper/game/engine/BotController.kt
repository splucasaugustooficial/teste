package com.neonviper.game.engine

object BotController {
    fun chooseInput(state: GameState, snakeId: Int, difficulty: Float): PlayerInput {
        val snake = state.snakes.getValue(snakeId)
        val food = nearestFood(state, snake)
        val boundary = boundaryVector(state, snake)
        val avoid = avoidVector(state, snake)
        val attack = attackVector(state, snake)
        val desired = food * 0.55f + avoid * 1.4f + boundary * 2f + attack * difficulty.coerceIn(0f, 1.5f)
        val direction = if (desired.length() < 0.001f) snake.heading else desired.normalized()
        return PlayerInput(direction, shouldBoost(snake, direction, boundary))
    }

    private fun nearestFood(state: GameState, snake: SnakeState): Vec2 {
        val food = state.food.minByOrNull { distance(it.position, snake.head) } ?: return Vec2.ZERO
        return (food.position - snake.head).normalized()
    }

    private fun boundaryVector(state: GameState, snake: SnakeState): Vec2 {
        if (snake.head.length() < state.arenaRadius * 0.72f) return Vec2.ZERO
        return (Vec2.ZERO - snake.head).normalized()
    }

    private fun avoidVector(state: GameState, snake: SnakeState): Vec2 {
        var total = Vec2.ZERO
        state.snakes.values.filter { it.alive && it.id != snake.id }.forEach { other ->
            other.body.forEach { point ->
                val offset = snake.head - point
                val gap = offset.length()
                if (gap in 0.001f..6f) total += offset.normalized() * (6f - gap)
            }
        }
        return if (total.length() < 0.001f) Vec2.ZERO else total.normalized()
    }

    private fun attackVector(state: GameState, snake: SnakeState): Vec2 {
        val target = state.snakes.values
            .filter { it.alive && it.team != snake.team }
            .minByOrNull { distance(it.head, snake.head) }
            ?: return Vec2.ZERO
        val gap = distance(target.head, snake.head)
        if (gap > 18f) return Vec2.ZERO
        if (gap < 2.4f) return (snake.head - target.head).normalized()
        val side = Vec2(-target.heading.y, target.heading.x)
        val intercept = target.head + target.heading * 3f + side * 3.5f
        return (intercept - snake.head).normalized()
    }

    private fun shouldBoost(snake: SnakeState, direction: Vec2, boundary: Vec2): Boolean {
        return snake.length > 8f && boundary == Vec2.ZERO && direction.dot(snake.heading) > 0.75f
    }
}
