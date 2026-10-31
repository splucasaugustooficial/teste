package com.neonviper.game.network

import com.neonviper.game.engine.GameEngine
import com.neonviper.game.engine.GameMode
import com.neonviper.game.engine.GameState
import com.neonviper.game.engine.MotionInterpolator
import com.neonviper.game.engine.PlayerInput
import com.neonviper.game.engine.PlayerSlot
import com.neonviper.game.engine.Team
import com.neonviper.game.engine.Vec2
import java.io.IOException
import java.net.InetSocketAddress

enum class SessionRole { IDLE, SEARCHING, JOINING, HOST, CLIENT }

enum class SessionPhase { IDLE, LOBBY, MATCH, ENDED }

data class SessionSlot(val name: String, val human: Boolean, val team: Team)

data class SessionState(
    val role: SessionRole = SessionRole.IDLE,
    val phase: SessionPhase = SessionPhase.IDLE,
    val humanCount: Int = 0,
    val message: String? = null,
    val mode: GameMode? = null,
    val slot: Int = -1,
    val roster: List<SessionSlot> = emptyList(),
)

class GameSession(
    private val transport: DatagramTransport,
    private val clock: GameClock,
    private val identity: String,
    private val playerName: String,
) {
    var state = SessionState()
        private set
    var engine: GameEngine? = null
        private set
    var latestState: GameState? = null
        private set
    var previousState: GameState? = null
        private set
    private var searchStartedAt = 0L
    private var lastAnnounceAt = 0L
    private var lastHostHeard = 0L
    private var snapshotAt = 0L
    private var accumulator = 0f
    private var sequence = 0
    private var localInput = PlayerInput(Vec2(1f, 0f), boosting = false)
    private var closed = false
    private val humans = linkedMapOf<String, Int>()
    private val names = mutableMapOf<Int, String>()
    private val addresses = mutableMapOf<String, InetSocketAddress>()
    private val sequences = mutableMapOf<Int, Int>()
    private val lastHeard = mutableMapOf<String, Long>()

    init {
        clock.listen { if (!closed) pump() }
        if (transport is MemoryEndpoint) transport.listener = { if (!closed) pump() }
    }

    fun searchOrHost(mode: GameMode) {
        state = SessionState(
            role = SessionRole.SEARCHING,
            phase = SessionPhase.LOBBY,
            mode = mode,
            message = state.message,
        )
        searchStartedAt = clock.now
        hostSession = ""
        pump()
    }

    fun setLocalInput(input: PlayerInput) {
        localInput = input
    }

    fun startMatch(seed: Long = clock.now) {
        if (state.role != SessionRole.HOST || state.mode == null || closed) return
        val mode = state.mode ?: return
        engine = GameEngine.newGame(mode, seed, playerSlots(mode))
        latestState = engine?.state
        state = state.copy(phase = SessionPhase.MATCH, roster = roster())
        broadcast(StartPacket(identity, seed))
        broadcast(SnapshotPacket(identity, engine?.state ?: return))
        lastAnnounceAt = clock.now
    }

    fun update(deltaSeconds: Float) {
        if (closed) return
        pump()
        if (state.role == SessionRole.CLIENT) {
            sendLocalInput(deltaSeconds)
            return
        }
        val running = engine ?: return
        if (state.role != SessionRole.HOST || state.phase != SessionPhase.MATCH || running.state.outcome != null) return
        val slot = humans[identity]
        if (slot != null) running.setInput(slot, localInput)
        accumulator += deltaSeconds.coerceAtLeast(0f)
        while (accumulator >= TICK) {
            latestState = running.tick(TICK)
            accumulator -= TICK
            if (running.state.tick % 2L == 0L) broadcast(SnapshotPacket(identity, running.state))
        }
    }

    fun renderState(now: Long): GameState? {
        if (state.role != SessionRole.CLIENT) return engine?.state ?: latestState
        val latest = latestState ?: return null
        val previous = previousState ?: return latest
        val alpha = ((now - snapshotAt).coerceAtLeast(0L) / 66f).coerceIn(0f, 1f)
        return MotionInterpolator.between(previous, latest, alpha)
    }

    fun submit(packet: InputPacket) {
        acceptInput(packet, null)
    }

    fun close() {
        closed = true
        transport.close()
    }

    fun pump() {
        if (closed) return
        drain()
        val now = clock.now
        when (state.role) {
            SessionRole.SEARCHING -> if (now - searchStartedAt >= SEARCH_TIMEOUT) becomeHost(now)
            SessionRole.HOST -> {
                if (now - lastAnnounceAt >= ANNOUNCE_INTERVAL) announce(now)
                timeoutClients(now)
            }
            SessionRole.JOINING, SessionRole.CLIENT -> timeoutHost(now)
            SessionRole.IDLE -> Unit
        }
    }

    private fun drain() {
        repeat(32) {
            val datagram = try {
                transport.receive(1)
            } catch (_: IOException) {
                null
            } ?: return
            handle(datagram)
        }
    }

    private fun handle(datagram: ReceivedDatagram) {
        val decoded = Protocol.decode(datagram.bytes)
        if (decoded.isFailure) {
            if (decoded.error == "version") state = state.copy(message = "SALA INCOMPATÍVEL")
            return
        }
        when (val packet = decoded.getOrThrow()) {
            is AnnouncePacket -> onAnnounce(packet, datagram.from)
            is JoinPacket -> onJoin(packet, datagram.from)
            is WelcomePacket -> onWelcome(packet)
            is InputPacket -> acceptInput(packet, datagram.from)
            is StartPacket -> if (packet.sessionId == hostSession) enterMatch()
            is SnapshotPacket -> onSnapshot(packet)
        }
    }

    private fun onAnnounce(packet: AnnouncePacket, from: InetSocketAddress) {
        if (packet.mode != state.mode) return
        addresses[packet.sessionId] = from
        lastHostHeard = clock.now
        val followsHost = state.role == SessionRole.SEARCHING ||
            state.role == SessionRole.JOINING ||
            packet.sessionId == hostSession ||
            (state.role == SessionRole.HOST && packet.sessionId < identity)
        if (followsHost) state = state.copy(roster = rosterFrom(packet))
        when (state.role) {
            SessionRole.SEARCHING, SessionRole.JOINING -> join(packet, from)
            SessionRole.HOST -> if (packet.sessionId < identity) join(packet, from)
            else -> Unit
        }
    }

    private fun rosterFrom(packet: AnnouncePacket): List<SessionSlot> {
        return packet.roster.mapIndexed { index, name ->
            SessionSlot(
                name = name.ifBlank { "BOT" },
                human = name.isNotBlank(),
                team = if (packet.mode == GameMode.VERSUS && index >= 2) Team.MAGENTA else Team.LIME,
            )
        }
    }

    private fun onJoin(packet: JoinPacket, from: InetSocketAddress) {
        if (state.role != SessionRole.HOST || packet.sessionId != identity) return
        if (packet.name.isBlank() || humans.containsKey(from.hostString)) return
        val slot = nextSlot(state.mode ?: return, humans.values.toSet()) ?: return
        val key = from.hostString
        humans[key] = slot
        names[slot] = packet.name.take(MAX_NAME)
        addresses[key] = from
        lastHeard[key] = clock.now
        state = state.copy(humanCount = humans.size, roster = roster())
        transport.send(from, Protocol.encode(WelcomePacket(identity, slot)))
    }

    private fun onWelcome(packet: WelcomePacket) {
        if (state.role != SessionRole.JOINING || packet.sessionId != hostSession) return
        state = state.copy(role = SessionRole.CLIENT, slot = packet.slot, phase = SessionPhase.LOBBY)
    }

    private fun onSnapshot(packet: SnapshotPacket) {
        if (state.role != SessionRole.CLIENT || packet.sessionId != hostSession) return
        previousState = latestState
        latestState = packet.state
        snapshotAt = clock.now
        lastHostHeard = clock.now
        state = state.copy(phase = SessionPhase.MATCH)
    }

    private fun acceptInput(packet: InputPacket, from: InetSocketAddress?) {
        if (state.role != SessionRole.HOST || packet.sessionId != identity) return
        val slot = humans.entries.firstOrNull { it.value == packet.playerId } ?: return
        if (from != null && addresses[slot.key] != from) return
        val previous = sequences[packet.playerId] ?: -1
        if (packet.sequence <= previous) return
        sequences[packet.playerId] = packet.sequence
        lastHeard[slot.key] = clock.now
        engine?.setInput(packet.playerId, PlayerInput(packet.direction, packet.boosting))
    }

    private fun join(packet: AnnouncePacket, from: InetSocketAddress) {
        hostSession = packet.sessionId
        state = state.copy(role = SessionRole.JOINING, message = null, humanCount = 0)
        humans.clear()
        engine = null
        transport.send(from, Protocol.encode(JoinPacket(packet.sessionId, playerName)))
    }

    private fun becomeHost(now: Long) {
        humans.clear()
        humans[identity] = 0
        names[0] = playerName
        lastHeard[identity] = now
        hostSession = identity
        engine = null
        state = state.copy(
            role = SessionRole.HOST,
            phase = SessionPhase.LOBBY,
            slot = 0,
            humanCount = 1,
            message = null,
            roster = roster(),
        )
        announce(now)
    }

    private fun announce(now: Long) {
        val mode = state.mode ?: return
        val capacity = if (mode == GameMode.DUO) 2 else 4
        val packet = AnnouncePacket(
            sessionId = identity,
            mode = mode,
            openSlots = (capacity - humans.size).coerceAtLeast(0),
            hostName = playerName,
            roster = roster().map { if (it.human) it.name else "" },
        )
        broadcast(packet)
        lastAnnounceAt = now
    }

    private fun timeoutClients(now: Long) {
        if (state.phase != SessionPhase.MATCH) return
        humans.entries.filter { it.key != identity && now - (lastHeard[it.key] ?: 0L) >= CLIENT_TIMEOUT }
            .toList()
            .forEach { (key, slot) ->
                humans.remove(key)
                engine?.setBot(slot, true)
                lastHeard.remove(key)
            }
        state = state.copy(humanCount = humans.size, roster = roster())
    }

    private fun timeoutHost(now: Long) {
        if (lastHostHeard == 0L || now - lastHostHeard < CLIENT_TIMEOUT) return
        if (state.phase == SessionPhase.MATCH) {
            state = state.copy(message = "HOST DESCONECTADO", phase = SessionPhase.ENDED)
        } else {
            becomeHost(now)
        }
    }

    private fun enterMatch() {
        state = state.copy(phase = SessionPhase.MATCH, message = null)
    }

    private fun broadcast(packet: Packet) {
        val bytes = Protocol.encode(packet)
        if (transport is UdpTransport) {
            UdpTransport.broadcastTargets().forEach { target ->
                try {
                    transport.send(target, bytes)
                } catch (_: IOException) {
                    // A sleeping interface should not end the match.
                }
            }
            addresses.values.distinctBy { "${it.hostString}:${it.port}" }.forEach { target ->
                try {
                    transport.send(target, bytes)
                } catch (_: IOException) {
                    // Direct retry happens on the next snapshot.
                }
            }
        } else {
            try {
                transport.send(InetSocketAddress("255.255.255.255", UdpTransport.DISCOVERY_PORT), bytes)
            } catch (_: IOException) {
                // The in-memory peer has already closed.
            }
        }
    }

    private fun sendLocalInput(deltaSeconds: Float) {
        if (state.phase != SessionPhase.MATCH || state.slot < 0 || hostSession.isBlank()) return
        val host = addresses[hostSession] ?: return
        accumulator += deltaSeconds.coerceAtLeast(0f)
        if (accumulator < TICK) return
        accumulator = 0f
        sequence += 1
        val packet = InputPacket(hostSession, state.slot, sequence, clamped(localInput.direction), localInput.boosting)
        try {
            transport.send(host, Protocol.encode(packet))
        } catch (_: IOException) {
            state = state.copy(message = "HOST DESCONECTADO")
        }
    }

    private fun clamped(direction: Vec2): Vec2 {
        val finite = if (direction.x.isFinite() && direction.y.isFinite()) direction else Vec2(1f, 0f)
        return Vec2(finite.x.coerceIn(-1f, 1f), finite.y.coerceIn(-1f, 1f))
    }

    private fun playerSlots(mode: GameMode): List<PlayerSlot> {
        val count = if (mode == GameMode.DUO) 2 else 4
        return (0 until count).map { slot ->
            val human = humans.entries.firstOrNull { it.value == slot }
            PlayerSlot(
                id = slot,
                name = names[slot] ?: "BOT",
                human = human != null,
                team = if (mode == GameMode.VERSUS && slot >= 2) Team.MAGENTA else Team.LIME,
            )
        }
    }

    private fun roster(): List<SessionSlot> {
        val mode = state.mode ?: return emptyList()
        return playerSlots(mode).map { SessionSlot(it.name, it.human, it.team) }
    }

    private fun nextSlot(mode: GameMode, taken: Set<Int>): Int? {
        val slots = if (mode == GameMode.DUO) listOf(0, 1) else listOf(0, 1, 2, 3)
        if (mode != GameMode.VERSUS) return slots.firstOrNull { it !in taken }
        val lime = listOf(0, 1)
        val magenta = listOf(2, 3)
        val preferred = if (lime.count { it in taken } <= magenta.count { it in taken }) lime else magenta
        val alternate = if (preferred === lime) magenta else lime
        return (preferred + alternate).firstOrNull { it !in taken }
    }

    private var hostSession: String = ""

    companion object {
        private const val SEARCH_TIMEOUT = 1_500L
        private const val ANNOUNCE_INTERVAL = 500L
        private const val CLIENT_TIMEOUT = 3_000L
        private const val TICK = 1f / 30f
        private const val MAX_NAME = 16
    }
}
