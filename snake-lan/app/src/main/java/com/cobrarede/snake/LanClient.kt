package com.cobrarede.snake

import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.PrintWriter
import java.net.InetSocketAddress
import java.net.Socket
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

class LanClient(
    private val hostIp: String,
    private val playerName: String,
    private val mode: GameMode,
    private val onLobby: (List<String>) -> Unit,
    private val onWelcome: (Int, Int) -> Unit,
    private val onStart: () -> Unit,
    private val onState: (JSONObject) -> Unit,
    private val onDisconnected: () -> Unit,
) {
    private val running = AtomicBoolean(false)
    private var writer: PrintWriter? = null
    var playerId: Int = -1
        private set

    fun connect() {
        if (!running.compareAndSet(false, true)) return
        thread(name = "lan-client", isDaemon = true) {
            try {
                Socket().use { socket ->
                    socket.connect(InetSocketAddress(hostIp, NetworkUtils.GAME_PORT), 5000)
                    socket.tcpNoDelay = true
                    val reader = BufferedReader(InputStreamReader(socket.getInputStream()))
                    val out = PrintWriter(socket.getOutputStream(), true)
                    writer = out
                    out.println(NetProtocol.hello(playerName, mode))
                    while (running.get()) {
                        val line = reader.readLine() ?: break
                        handleLine(line)
                    }
                }
            } catch (_: Exception) {
                onDisconnected()
            } finally {
                running.set(false)
                writer = null
            }
        }
    }

    fun sendInput(angle: Float, seq: Long) {
        writer?.println(NetProtocol.input(angle, seq))
    }

    fun disconnect() {
        running.set(false)
        writer = null
    }

    private fun handleLine(line: String) {
        val o = JSONObject(line)
        when (o.optString("t")) {
            "welcome" -> {
                playerId = o.getInt("id")
                onWelcome(playerId, o.getInt("team"))
            }
            "lobby" -> {
                val arr = o.getJSONArray("players")
                val list = buildList {
                    for (i in 0 until arr.length()) add(arr.getString(i))
                }
                onLobby(list)
            }
            "start" -> onStart()
            "state" -> onState(o)
        }
    }
}
