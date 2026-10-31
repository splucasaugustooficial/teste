package com.neonviper.game.engine

import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

class GameEngine private constructor(
    var state: GameState,
    private val random: Random,
) {
    private val inputs = mutableMapOf<Int, PlayerInput>()
    private var nextFoodId = (state.food.maxOfOrNull { it.id } ?: 0) + 1
    private var nextSnakeId = (state.snakes.keys.maxOrNull() ?: 0) + 1

    fun setInput(playerId: Int, input: PlayerInput) {
        inputs[playerId] = input
    }

    fun inputFor(playerId: Int): PlayerInput? = inputs[playerId]

    fun setBot(snakeId: Int, bot: Boolean) {
        val snake = state.snakes[snakeId] ?: return
        state = state.copy(snakes = state.snakes + (snakeId to snake.copy(bot = bot)))
    }

    fun tick(deltaSeconds: Float): GameState {
        if (state.outcome != null) return state
        var remaining = deltaSeconds.coerceIn(0f, 0.25f)
        if (remaining == 0f) {
            state = simulate(state, 0f)
            state = resolve(state)
            return state
        }
        while (remaining > 0f) {
            val step = min(STEP_SECONDS, remaining)
            state = simulate(state, step)
            state = resolve(state)
            if (state.outcome != null) return state
            remaining -= step
        }
        return state
    }

    private fun simulate(current: GameState, deltaSeconds: Float): GameState {
        val driven = current.snakes.mapValues { (id, snake) ->
            if (!snake.alive) return@mapValues snake
            val input = if (snake.bot) {
                BotController.chooseInput(current, id, difficulty(current.wave)).also { inputs[id] = it }
            } else {
                inputs[id]
            }
            move(snake, input, deltaSeconds, current.arenaRadius)
        }
        val food = current.food.toMutableList()
        val eatenIds = mutableSetOf<Int>()
        val grown = driven.mapValues { (_, snake) ->
            if (!snake.alive) return@mapValues snake
            val eaten = food.filter { foodItem ->
                foodItem.id !in eatenIds &&
                    distance(foodItem.position, snake.head) <= FOOD_RADIUS + BODY_RADIUS
            }
            if (eaten.isEmpty()) return@mapValues snake
            eatenIds += eaten.map { it.id }
            snake.copy(
                length = snake.length + eaten.sumOf { it.value }.toFloat() * GROWTH,
                score = snake.score + eaten.sumOf { it.value },
            )
        }
        food.removeAll { it.id in eatenIds }
        val deaths = mutableSetOf<Int>()
        grown.values.filter { it.alive }.forEach { snake ->
            if (snake.head.length() > current.arenaRadius - BODY_RADIUS || hitsOwnBody(snake)) {
                deaths += snake.id
            }
            grown.values.forEach { other ->
                if (hitsOther(snake, other)) deaths += snake.id
            }
        }
        val settled = grown.mapValues { (_, snake) ->
            if (snake.id !in deaths || !snake.alive) return@mapValues snake
            dropBody(snake, food)
            snake.copy(alive = false)
        }
        return current.copy(snakes = settled, food = food, tick = current.tick + 1)
    }

    private fun resolve(current: GameState): GameState {
        val living = current.snakes.values.filter { it.alive }
        val allies = living.filter { it.team == Team.LIME }
        val enemies = living.filter { it.team == Team.MAGENTA }
        var resolved = current
        val outcome = when (current.mode) {
            GameMode.VERSUS -> when (living.map { it.team }.distinct().size) {
                0 -> GameOutcome.Draw
                1 -> GameOutcome.TeamWon(living.first().team)
                else -> null
            }
            GameMode.DUO -> if (allies.isEmpty() && current.snakes.values.any { it.team == Team.LIME }) {
                GameOutcome.Defeat
            } else {
                null
            }
            GameMode.TRAINING -> null
        }
        if (outcome != null) return refill(current.copy(outcome = outcome))
        if (current.mode == GameMode.DUO && allies.isNotEmpty() && enemies.isEmpty()) {
            val advanced = current.copy(
                wave = current.wave + 1,
                snakes = current.snakes.filterValues { it.alive || it.team == Team.LIME },
            )
            resolved = spawnEnemies(advanced, (advanced.wave + 1).coerceAtMost(6))
        }
        return refill(resolved)
    }

    private fun move(snake: SnakeState, input: PlayerInput?, deltaSeconds: Float, arenaRadius: Float): SnakeState {
        val requested = input?.direction?.takeIf { it.length() > 0.2f } ?: snake.heading
        val heading = rotateToward(snake.heading, requested, TURN_RATE * deltaSeconds)
        val nearEdge = snake.head.length() > arenaRadius * 0.9f
        val boosting = input?.boosting == true && snake.length > MIN_LENGTH + 0.05f && !nearEdge
        val speed = if (boosting) snake.speed * BOOST_MULTIPLIER else snake.speed
        val head = snake.head + heading * speed * deltaSeconds
        val length = if (boosting) {
            (snake.length - BOOST_COST * deltaSeconds).coerceAtLeast(MIN_LENGTH)
        } else {
            snake.length
        }
        return snake.copy(head = head, heading = heading, body = trim(snake.body + head, length), length = length)
    }

    private fun hitsOwnBody(snake: SnakeState): Boolean {
        var trailing = 0f
        for (index in snake.body.size - 2 downTo 0) {
            trailing += distance(snake.body[index + 1], snake.body[index])
            if (trailing < NECK_CLEARANCE) continue
            if (distance(snake.head, snake.body[index]) < BODY_RADIUS * 1.7f) return true
        }
        return false
    }

    private fun hitsOther(snake: SnakeState, other: SnakeState): Boolean {
        if (!other.alive || other.id == snake.id || other.team == snake.team) return false
        return other.body.any { distance(snake.head, it) < BODY_RADIUS * 2f }
    }

    private fun trim(body: List<Vec2>, length: Float): List<Vec2> {
        if (body.size < 2) return body
        val points = body.toMutableList()
        fun polyline(): Float {
            var total = 0f
            for (index in 1 until points.size) total += distance(points[index - 1], points[index])
            return total
        }
        while (points.size > 2 && polyline() > length) {
            val extra = polyline() - length
            val segment = distance(points[0], points[1])
            if (segment <= extra) {
                points.removeAt(0)
            } else {
                points[0] = points[0] + (points[1] - points[0]).normalized() * extra
                break
            }
        }
        return points
    }

    private fun dropBody(snake: SnakeState, food: MutableList<Food>) {
        snake.body.filterIndexed { index, _ -> index % 3 == 0 }.take(8).forEach { point ->
            if (food.size < MAX_FOOD) food += Food(nextFoodId++, point, 1)
        }
    }

    private fun spawnEnemies(current: GameState, count: Int): GameState {
        val snakes = current.snakes.toMutableMap()
        val speed = BASE_SPEED * (1f + (current.wave - 1) * 0.08f)
        repeat(count) { index ->
            val head = enemyPosition(snakes.values)
            val heading = (Vec2.ZERO - head).normalized().let { if (it == Vec2.ZERO) Vec2(1f, 0f) else it }
            val id = nextSnakeId++
            snakes[id] = SnakeState(
                id = id,
                team = Team.MAGENTA,
                name = ENEMY_NAMES[index % ENEMY_NAMES.size],
                bot = true,
                head = head,
                heading = heading,
                body = bodyBehind(head, heading, START_LENGTH),
                length = START_LENGTH,
                score = 0,
                alive = true,
                speed = speed,
            )
        }
        return current.copy(snakes = snakes)
    }

    private fun enemyPosition(existing: Collection<SnakeState>): Vec2 {
        repeat(16) {
            val angle = random.nextFloat() * (PI.toFloat() * 2f)
            val head = Vec2(cos(angle) * 24f, sin(angle) * 24f)
            if (existing.none { distance(it.head, head) < 8f }) return head
        }
        return Vec2(-24f, 8f)
    }

    private fun refill(current: GameState): GameState {
        val food = current.food.toMutableList()
        var guard = 0
        while (food.size < FOOD_TARGET && guard < 40) {
            guard++
            val angle = random.nextFloat() * (PI.toFloat() * 2f)
            val radius = random.nextFloat() * current.arenaRadius * 0.82f
            val position = Vec2(cos(angle) * radius, sin(angle) * radius)
            val blocked = current.snakes.values.any { snake ->
                snake.alive && snake.body.any { distance(it, position) < 2f }
            }
            if (!blocked) food += Food(nextFoodId++, position, 1)
        }
        return current.copy(food = food)
    }

    companion object {
        const val ARENA_RADIUS = 40f
        const val BODY_RADIUS = 0.48f
        const val FOOD_RADIUS = 0.75f
        private const val BASE_SPEED = 8f
        private const val BOOST_MULTIPLIER = 1.75f
        private const val TURN_RATE = 3.4f
        private const val START_LENGTH = 7f
        private const val MIN_LENGTH = 3.5f
        private const val GROWTH = 1.15f
        private const val BOOST_COST = 2.2f
        private const val NECK_CLEARANCE = 4.8f
        private const val STEP_SECONDS = 0.05f
        private const val FOOD_TARGET = 18
        private const val MAX_FOOD = 64
        private val PLAYER_NAMES = listOf("VIPER", "MAMBA", "SURUCUCU", "CASCAVEL")
        private val ENEMY_NAMES = listOf("NAJIA", "JARARACA", "CORAL", "URUTU")

        fun newGame(mode: GameMode, seed: Long, slots: List<PlayerSlot>? = null): GameEngine {
            val random = Random(seed)
            val chosen = slots ?: defaultSlots(mode)
            val snakes = chosen.associate { slot ->
                val angle = slot.id * (PI.toFloat() / 2f)
                val head = Vec2(cos(angle) * 12f, sin(angle) * 12f)
                val heading = if (slot.id == 0) Vec2(1f, 0f) else (Vec2.ZERO - head).let {
                    if (it.length() < 0.001f) Vec2(1f, 0f) else it.normalized()
                }
                slot.id to SnakeState(
                    id = slot.id,
                    team = slot.team,
                    name = slot.name.ifBlank { PLAYER_NAMES[slot.id % PLAYER_NAMES.size] },
                    bot = !slot.human,
                    head = head,
                    heading = heading,
                    body = bodyBehind(head, heading, START_LENGTH),
                    length = START_LENGTH,
                    score = 0,
                    alive = true,
                    speed = BASE_SPEED,
                )
            }
            var created = GameState(mode, ARENA_RADIUS, snakes, emptyList(), wave = 1, tick = 0, outcome = null, seed = seed)
            val engine = GameEngine(created, random)
            if (mode == GameMode.DUO) created = engine.spawnEnemies(created, 2)
            engine.state = engine.refill(created)
            return engine
        }

        fun fromState(state: GameState): GameEngine = GameEngine(state, Random(state.seed))

        fun difficulty(wave: Int): Float = (0.35f + (wave - 1) * 0.12f).coerceAtMost(1.4f)

        private fun defaultSlots(mode: GameMode): List<PlayerSlot> = when (mode) {
            GameMode.TRAINING -> listOf(PlayerSlot(0, "VIPER", true, Team.LIME))
            GameMode.DUO -> listOf(
                PlayerSlot(0, "VIPER", true, Team.LIME),
                PlayerSlot(1, "MAMBA", false, Team.LIME),
            )
            GameMode.VERSUS -> listOf(
                PlayerSlot(0, "VIPER", true, Team.LIME),
                PlayerSlot(1, "MAMBA", false, Team.LIME),
                PlayerSlot(2, "SURUCUCU", false, Team.MAGENTA),
                PlayerSlot(3, "CASCAVEL", false, Team.MAGENTA),
            )
        }

        private fun bodyBehind(head: Vec2, heading: Vec2, length: Float): List<Vec2> {
            val back = heading.normalized() * -1f
            val points = mutableListOf<Vec2>()
            var covered = length
            while (covered > 0f) {
                points += head + back * covered
                covered -= 0.5f
            }
            points += head
            return points
        }

        private fun rotateToward(current: Vec2, desired: Vec2, maxRadians: Float): Vec2 {
            val from = if (current.length() < 0.001f) Vec2(1f, 0f) else current.normalized()
            val to = if (desired.length() < 0.001f) from else desired.normalized()
            val cross = from.x * to.y - from.y * to.x
            val dot = from.dot(to).coerceIn(-1f, 1f)
            val angle = atan2(cross, dot).coerceIn(-maxRadians, maxRadians)
            val cosine = cos(angle)
            val sine = sin(angle)
            return Vec2(from.x * cosine - from.y * sine, from.x * sine + from.y * cosine)
        }
    }
}
