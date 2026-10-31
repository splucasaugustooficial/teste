package com.cobrarede.snake

import org.json.JSONArray
import org.json.JSONObject

object NetProtocol {
    fun hello(name: String, mode: GameMode): String =
        JSONObject()
            .put("t", "hello")
            .put("name", name)
            .put("mode", mode.wire)
            .toString()

    fun parseHello(line: String): Pair<String, GameMode>? {
        val o = JSONObject(line)
        if (o.optString("t") != "hello") return null
        return o.optString("name", "Jogador") to GameMode.fromWire(o.optString("mode", "versus"))
    }

    fun welcome(id: Int, team: Int, mode: GameMode): String =
        JSONObject()
            .put("t", "welcome")
            .put("id", id)
            .put("team", team)
            .put("mode", mode.wire)
            .toString()

    fun lobby(players: List<String>): String =
        JSONObject()
            .put("t", "lobby")
            .put("players", JSONArray(players))
            .toString()

    fun start(): String = JSONObject().put("t", "start").toString()

    fun input(angle: Float, seq: Long): String =
        JSONObject()
            .put("t", "input")
            .put("angle", angle.toDouble())
            .put("seq", seq)
            .toString()

    fun parseInput(line: String): Pair<Float, Long>? {
        val o = JSONObject(line)
        if (o.optString("t") != "input") return null
        return o.optDouble("angle").toFloat() to o.optLong("seq")
    }

    fun state(tick: Long, snakes: JSONArray, foods: JSONArray): String =
        JSONObject()
            .put("t", "state")
            .put("tick", tick)
            .put("snakes", snakes)
            .put("foods", foods)
            .toString()

    fun snakeJson(
        id: Int,
        name: String,
        team: Int,
        alive: Boolean,
        score: Int,
        angle: Float,
        headX: Float,
        headY: Float,
        segments: List<Pair<Float, Float>>,
    ): JSONObject {
        val seg = JSONArray()
        for ((x, y) in segments) {
            seg.put(JSONArray().put(x.toDouble()).put(y.toDouble()))
        }
        return JSONObject()
            .put("id", id)
            .put("name", name)
            .put("team", team)
            .put("alive", alive)
            .put("score", score)
            .put("angle", angle.toDouble())
            .put("hx", headX.toDouble())
            .put("hy", headY.toDouble())
            .put("seg", seg)
    }

    fun foodJson(id: Int, x: Float, y: Float, value: Int): JSONObject =
        JSONObject()
            .put("id", id)
            .put("x", x.toDouble())
            .put("y", y.toDouble())
            .put("v", value)
}
