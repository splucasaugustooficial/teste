package com.cobrarede.snake

import org.json.JSONObject

/** Mantém host/cliente ativos entre lobby e partida. */
object GameSession {
    var mode: GameMode = GameMode.VERSUS
    var server: LanServer? = null
    var client: LanClient? = null

    /** Cópia local do estado (clientes). */
    var clientEngine = GameEngine(GameMode.VERSUS)

    var localPlayerId: Int = 0

    fun prepare(mode: GameMode) {
        this.mode = mode
        clientEngine = GameEngine(mode)
    }

    fun reset() {
        server?.stop()
        client?.disconnect()
        server = null
        client = null
        localPlayerId = 0
    }

    fun applyClientState(state: JSONObject) {
        val snakes = state.getJSONArray("snakes")
        val foods = state.getJSONArray("foods")
        clientEngine.applyState(snakes, foods)
        clientEngine.tick = state.getLong("tick")
    }
}
