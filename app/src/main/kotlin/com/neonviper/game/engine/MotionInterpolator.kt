package com.neonviper.game.engine

object MotionInterpolator {
    fun between(previous: GameState, latest: GameState, alpha: Float): GameState {
        val amount = alpha.coerceIn(0f, 1f)
        val snakes = latest.snakes.mapValues { (id, snake) ->
            val prior = previous.snakes[id] ?: return@mapValues snake
            val heading = lerp(prior.heading, snake.heading, amount)
            snake.copy(
                head = lerp(prior.head, snake.head, amount),
                heading = if (heading.length() < 0.001f) snake.heading else heading.normalized(),
            )
        }
        return latest.copy(snakes = snakes)
    }
}
