package com.neonviper.game.engine

enum class GameMode { VERSUS, DUO, TRAINING }

enum class Team { LIME, MAGENTA }

sealed interface GameOutcome {
    data class TeamWon(val team: Team) : GameOutcome
    data object Defeat : GameOutcome
    data object Draw : GameOutcome
}

data class PlayerInput(val direction: Vec2, val boosting: Boolean)

data class PlayerSlot(val id: Int, val name: String, val human: Boolean, val team: Team)

data class SnakeState(
    val id: Int,
    val team: Team,
    val name: String,
    val bot: Boolean,
    val head: Vec2,
    val heading: Vec2,
    val body: List<Vec2>,
    val length: Float,
    val score: Int,
    val alive: Boolean,
    val speed: Float,
)

data class Food(val id: Int, val position: Vec2, val value: Int = 1)

data class GameState(
    val mode: GameMode,
    val arenaRadius: Float,
    val snakes: Map<Int, SnakeState>,
    val food: List<Food>,
    val wave: Int,
    val tick: Long,
    val outcome: GameOutcome?,
    val seed: Long,
)
