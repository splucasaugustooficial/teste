package com.neonviper.game.engine

import kotlin.math.sqrt

data class Vec2(val x: Float, val y: Float) {
    operator fun plus(other: Vec2) = Vec2(x + other.x, y + other.y)
    operator fun minus(other: Vec2) = Vec2(x - other.x, y - other.y)
    operator fun times(scale: Float) = Vec2(x * scale, y * scale)
    operator fun div(scale: Float) = Vec2(x / scale, y / scale)
    fun dot(other: Vec2) = x * other.x + y * other.y
    fun length(): Float = sqrt(x * x + y * y)

    fun normalized(): Vec2 {
        val magnitude = length()
        return if (magnitude < 0.0001f) ZERO else this / magnitude
    }

    companion object {
        val ZERO = Vec2(0f, 0f)
    }
}

fun lerp(start: Vec2, end: Vec2, amount: Float): Vec2 = start + (end - start) * amount

fun distance(start: Vec2, end: Vec2): Float = (start - end).length()
