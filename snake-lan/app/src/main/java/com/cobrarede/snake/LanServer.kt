package com.cobrarede.snake

import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.PrintWriter
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

class LanServer(
    private val mode: GameMode,
    private val hostName: String,
    private val onLobbyUpdate: (List<String>) -> Unit,
    private val onStarted: () -> Unit,
) {
    data class Client(val id: Int, val socket: Socket, val out: PrintWriter, var name: String)

    private val running = AtomicBoolean(false)
    private var serverSocket: ServerSocket? = null
    private val clients = CopyOnWriteArrayList<Client>()
    private val engine = GameEngine(mode)
    private var nextId = 1
    private var gameStarted = false

    val localPlayerId: Int = 0

    init {
        engine.addPlayer(0, hostName)
    }

    fun start() {
        if (!running.compareAndSet(false, true)) return
        thread(name = "lan-server-accept", isDaemon = true) {
            ServerSocket(NetworkUtils.GAME_PORT).use { ss ->
                serverSocket = ss
                ss.soTimeout = 0
                while (running.get()) {
                    try {
                        val socket = ss.accept()
                        handleClient(socket)
                    } catch (_: Exception) {
                        if (!running.get()) break
                    }
                }
            }
        }
        thread(name = "lan-server-loop", isDaemon = true) {
            var last = System.nanoTime()
            while (running.get()) {
                val now = System.nanoTime()
                val dt = ((now - last) / 1_000_000_000.0).toFloat().coerceAtMost(0.05f)
                last = now
                if (gameStarted) {
                    engine.step(dt)
                    broadcastState()
                }
                Thread.sleep(16)
            }
        }
        notifyLobby()
    }

    private fun handleClient(socket: Socket) {
        thread(name = "lan-client-${socket.inetAddress}", isDaemon = true) {
            try {
                socket.tcpNoDelay = true
                val reader = BufferedReader(InputStreamReader(socket.getInputStream()))
                val out = PrintWriter(socket.getOutputStream(), true)
                val helloLine = reader.readLine() ?: return@thread
                val parsed = NetProtocol.parseHello(helloLine) ?: return@thread
                val name = parsed.first
                if (gameStarted) {
                    socket.close()
                    return@thread
                }
                val id = nextId++
                val team = if (mode == GameMode.DUO) id / 2 else -1
                val client = Client(id, socket, out, name)
                clients.add(client)
                engine.addPlayer(id, name)
                out.println(NetProtocol.welcome(id, team, mode))
                notifyLobby()
                while (running.get() && !socket.isClosed) {
                    val line = reader.readLine() ?: break
                    if (!gameStarted) continue
                    val input = NetProtocol.parseInput(line) ?: continue
                    engine.setTargetAngle(id, input.first)
                }
            } catch (_: Exception) {
            } finally {
                clients.removeIf { it.socket == socket }
                try {
                    socket.close()
                } catch (_: Exception) {
                }
                notifyLobby()
            }
        }
    }

    fun setHostInput(angle: Float) {
        if (gameStarted) engine.setTargetAngle(localPlayerId, angle)
    }

    fun startMatch() {
        if (gameStarted) return
        gameStarted = true
        val startLine = NetProtocol.start()
        for (c in clients) c.out.println(startLine)
        onStarted()
    }

    fun stop() {
        running.set(false)
        try {
            serverSocket?.close()
        } catch (_: Exception) {
        }
        for (c in clients) {
            try {
                c.socket.close()
            } catch (_: Exception) {
            }
        }
        clients.clear()
    }

    fun snapshotEngine(): GameEngine = engine

    private fun notifyLobby() {
        val names = buildList {
            add(engine.snakes.firstOrNull()?.name ?: hostName)
            addAll(clients.map { it.name })
        }
        onLobbyUpdate(names)
        val lobbyLine = NetProtocol.lobby(names)
        for (c in clients) c.out.println(lobbyLine)
    }

    private fun broadcastState() {
        val (snakes, foods) = engine.toStateJson()
        val line = NetProtocol.state(engine.tick, snakes, foods)
        for (c in clients) c.out.println(line)
    }
}
