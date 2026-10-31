package com.cobrarede.snake

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

data class Food(val id: Int, var x: Float, var y: Float, val value: Int)

data class PlayerSnake(
    val id: Int,
    var name: String,
    val team: Int,
    var alive: Boolean = true,
    var score: Int = 0,
    var angle: Float = 0f,
    var headX: Float = 0f,
    var headY: Float = 0f,
    val segments: MutableList<Pair<Float, Float>> = mutableListOf(),
    var respawnAt: Long = 0L,
    var targetAngle: Float = 0f,
) {
    fun colorIndex(): Int = if (team >= 0) team else id
}

class GameEngine(val mode: GameMode) {
    companion object {
        const val WORLD = 3200f
        const val HEAD_RADIUS = 14f
        const val SEGMENT_RADIUS = 12f
        const val BASE_SPEED = 180f
        const val TURN_SPEED = 5.5f
        const val SEGMENT_SPACING = 10f
        const val MAX_FOODS = 120
        const val RESPAWN_MS = 2500L

        fun angleFromTouch(localX: Float, localY: Float, centerX: Float, centerY: Float): Float =
            atan2(localY - centerY, localX - centerX)
    }

    val snakes = mutableListOf<PlayerSnake>()
    val foods = mutableListOf<Food>()
    var tick: Long = 0
    private var nextFoodId = 1
    private val random = Random(System.currentTimeMillis())

    fun addPlayer(id: Int, name: String): PlayerSnake {
        val team = when (mode) {
            GameMode.VERSUS -> -1
            GameMode.DUO -> id / 2
        }
        val snake = PlayerSnake(id = id, name = name, team = team)
        snakes.add(snake)
        respawn(snake)
        return snake
    }

    fun removePlayer(id: Int) {
        snakes.removeAll { it.id == id }
    }

    fun setTargetAngle(id: Int, angle: Float) {
        snakes.firstOrNull { it.id == id }?.targetAngle = angle
    }

    fun step(dt: Float) {
        tick++
        val now = System.currentTimeMillis()
        for (snake in snakes) {
            if (!snake.alive) {
                if (now >= snake.respawnAt) respawn(snake)
                continue
            }
            var diff = snake.targetAngle - snake.angle
            while (diff > PI) diff -= (2 * PI).toFloat()
            while (diff < -PI) diff += (2 * PI).toFloat()
            val turn = min(abs(diff), TURN_SPEED * dt) * if (diff >= 0) 1 else -1
            snake.angle += turn

            val speed = BASE_SPEED + min(snake.score / 20, 40)
            snake.headX += cos(snake.angle) * speed * dt
            snake.headY += sin(snake.angle) * speed * dt
            snake.headX = snake.headX.coerceIn(HEAD_RADIUS, WORLD - HEAD_RADIUS)
            snake.headY = snake.headY.coerceIn(HEAD_RADIUS, WORLD - HEAD_RADIUS)

            pushSegment(snake, snake.headX, snake.headY)
            eatFood(snake)
            if (checkCollisions(snake)) kill(snake)
        }
        while (foods.size < MAX_FOODS) spawnFood()
    }

    private fun pushSegment(snake: PlayerSnake, x: Float, y: Float) {
        if (snake.segments.isEmpty()) {
            repeat(8) { snake.segments.add(x to y) }
            return
        }
        val first = snake.segments.first()
        if (hypot(x - first.first, y - first.second) >= SEGMENT_SPACING) {
            snake.segments.add(0, x to y)
        }
        val maxLen = 12 + snake.score / 3
        while (snake.segments.size > maxLen) {
            snake.segments.removeAt(snake.segments.size - 1)
        }
    }

    private fun eatFood(snake: PlayerSnake) {
        val iter = foods.iterator()
        while (iter.hasNext()) {
            val food = iter.next()
            if (hypot(snake.headX - food.x, snake.headY - food.y) < HEAD_RADIUS + 8f) {
                snake.score += food.value
                iter.remove()
            }
        }
    }

    private fun checkCollisions(snake: PlayerSnake): Boolean {
        for (other in snakes) {
            if (!other.alive) continue
            val skipTeam = mode == GameMode.DUO && other.team >= 0 && other.team == snake.team && other.id != snake.id
            if (skipTeam) continue
            val points = if (other.id == snake.id) other.segments.drop(4) else other.segments
            for ((x, y) in points) {
                if (hypot(snake.headX - x, snake.headY - y) < HEAD_RADIUS + SEGMENT_RADIUS - 2f) {
                    return true
                }
            }
        }
        return false
    }

    private fun kill(snake: PlayerSnake) {
        snake.alive = false
        snake.respawnAt = System.currentTimeMillis() + RESPAWN_MS
        dropOrbs(snake)
        snake.segments.clear()
        snake.score = maxOf(0, snake.score - 5)
    }

    private fun dropOrbs(snake: PlayerSnake) {
        val drops = min(12, 4 + snake.score / 5)
        for (i in 0 until drops) {
            val t = i.toFloat() / drops
            val x = snake.headX + cos(snake.angle + t) * (i * 6f)
            val y = snake.headY + sin(snake.angle + t) * (i * 6f)
            foods.add(Food(nextFoodId++, x.coerceIn(20f, WORLD - 20f), y.coerceIn(20f, WORLD - 20f), 2))
        }
    }

    private fun respawn(snake: PlayerSnake) {
        snake.alive = true
        snake.headX = random.nextFloat() * (WORLD - 400f) + 200f
        snake.headY = random.nextFloat() * (WORLD - 400f) + 200f
        snake.angle = random.nextFloat() * 2f * PI.toFloat()
        snake.targetAngle = snake.angle
        snake.segments.clear()
        repeat(8) { snake.segments.add(snake.headX to snake.headY) }
    }

    private fun spawnFood() {
        val x = random.nextFloat() * (WORLD - 80f) + 40f
        val y = random.nextFloat() * (WORLD - 80f) + 40f
        val value = if (random.nextFloat() < 0.15f) 5 else 1
        foods.add(Food(nextFoodId++, x, y, value))
    }

    fun toStateJson(): Pair<org.json.JSONArray, org.json.JSONArray> {
        val snakesArr = org.json.JSONArray()
        for (s in snakes) {
            snakesArr.put(
                NetProtocol.snakeJson(
                    s.id,
                    s.name,
                    s.team,
                    s.alive,
                    s.score,
                    s.angle,
                    s.headX,
                    s.headY,
                    s.segments,
                ),
            )
        }
        val foodsArr = org.json.JSONArray()
        for (f in foods) {
            foodsArr.put(NetProtocol.foodJson(f.id, f.x, f.y, f.value))
        }
        return snakesArr to foodsArr
    }

    fun applyState(snakesArr: org.json.JSONArray, foodsArr: org.json.JSONArray) {
        snakes.clear()
        for (i in 0 until snakesArr.length()) {
            val o = snakesArr.getJSONObject(i)
            val segList = mutableListOf<Pair<Float, Float>>()
            val seg = o.getJSONArray("seg")
            for (j in 0 until seg.length()) {
                val p = seg.getJSONArray(j)
                segList.add(p.getDouble(0).toFloat() to p.getDouble(1).toFloat())
            }
            snakes.add(
                PlayerSnake(
                    id = o.getInt("id"),
                    name = o.getString("name"),
                    team = o.getInt("team"),
                    alive = o.getBoolean("alive"),
                    score = o.getInt("score"),
                    angle = o.getDouble("angle").toFloat(),
                    headX = o.getDouble("hx").toFloat(),
                    headY = o.getDouble("hy").toFloat(),
                    segments = segList,
                ).also { it.targetAngle = it.angle },
            )
        }
        foods.clear()
        for (i in 0 until foodsArr.length()) {
            val o = foodsArr.getJSONObject(i)
            foods.add(
                Food(
                    id = o.getInt("id"),
                    x = o.getDouble("x").toFloat(),
                    y = o.getDouble("y").toFloat(),
                    value = o.getInt("v"),
                ),
            )
        }
    }
}
