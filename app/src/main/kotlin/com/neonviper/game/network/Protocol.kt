package com.neonviper.game.network

import com.neonviper.game.engine.Food
import com.neonviper.game.engine.GameMode
import com.neonviper.game.engine.GameOutcome
import com.neonviper.game.engine.GameState
import com.neonviper.game.engine.SnakeState
import com.neonviper.game.engine.Team
import com.neonviper.game.engine.Vec2
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.EOFException
import kotlin.math.abs

class DecodeResult<T> private constructor(private val value: T?, val error: String?) {
    val isFailure: Boolean = error != null
    val isSuccess: Boolean = !isFailure

    fun getOrThrow(): T = value ?: error(error ?: "invalid packet")

    companion object {
        fun <T> success(value: T): DecodeResult<T> = DecodeResult(value, null)
        fun <T> failure(error: String): DecodeResult<T> = DecodeResult(null, error)
    }
}

enum class PacketType(val id: Int) {
    ANNOUNCE(1),
    JOIN(2),
    WELCOME(3),
    INPUT(4),
    SNAPSHOT(5),
    START(6),
    ;

    companion object {
        fun from(id: Int): PacketType? = entries.firstOrNull { it.id == id }
    }
}

sealed interface Packet {
    val type: PacketType
}

data class AnnouncePacket(
    val sessionId: String,
    val mode: GameMode,
    val openSlots: Int,
    val hostName: String,
    val roster: List<String>,
) : Packet {
    override val type = PacketType.ANNOUNCE
}

data class JoinPacket(val sessionId: String, val name: String) : Packet {
    override val type = PacketType.JOIN
}

data class WelcomePacket(val sessionId: String, val slot: Int) : Packet {
    override val type = PacketType.WELCOME
}

data class InputPacket(
    val sessionId: String,
    val playerId: Int,
    val sequence: Int,
    val direction: Vec2,
    val boosting: Boolean,
) : Packet {
    override val type = PacketType.INPUT
}

data class StartPacket(val sessionId: String, val seed: Long) : Packet {
    override val type = PacketType.START
}

data class SnapshotPacket(val sessionId: String, val state: GameState) : Packet {
    override val type = PacketType.SNAPSHOT
}

object Protocol {
    const val VERSION: Int = 1
    const val MAX_PACKET_SIZE = 32 * 1024
    private const val MAGIC = 0x4E565052
    private const val MAX_TEXT = 32
    private const val MAX_SNAKES = 16
    private const val MAX_POINTS = 40
    private const val MAX_FOOD = 64

    fun encode(packet: Packet): ByteArray {
        val payload = ByteArrayOutputStream()
        DataOutputStream(payload).use { writePayload(it, packet) }
        val body = payload.toByteArray()
        val framed = ByteArrayOutputStream()
        DataOutputStream(framed).use { out ->
            out.writeInt(MAGIC)
            out.writeByte(VERSION)
            out.writeByte(packet.type.id)
            out.writeShort(body.size)
            out.write(body)
        }
        val content = framed.toByteArray()
        require(content.size + 2 <= MAX_PACKET_SIZE) { "packet exceeds 32 KiB" }
        val sum = checksum(content)
        return content + byteArrayOf((sum shr 8).toByte(), (sum and 0xFF).toByte())
    }

    fun decode(bytes: ByteArray): DecodeResult<Packet> {
        if (bytes.size !in 10..MAX_PACKET_SIZE) return DecodeResult.failure("size")
        val expected = checksum(bytes.copyOf(bytes.size - 2))
        val actual = ((bytes[bytes.size - 2].toInt() and 0xFF) shl 8) or (bytes[bytes.size - 1].toInt() and 0xFF)
        if (expected != actual) return DecodeResult.failure("checksum")
        return try {
            val input = DataInputStream(ByteArrayInputStream(bytes))
            val magic = input.readInt()
            if (magic != MAGIC) return DecodeResult.failure("magic")
            val version = input.readUnsignedByte()
            if (version != VERSION) return DecodeResult.failure("version")
            val type = PacketType.from(input.readUnsignedByte()) ?: return DecodeResult.failure("type")
            val length = input.readUnsignedShort()
            if (length != bytes.size - 10) return DecodeResult.failure("length")
            DecodeResult.success(readPayload(input, type))
        } catch (_: EOFException) {
            DecodeResult.failure("truncated")
        } catch (error: IllegalArgumentException) {
            DecodeResult.failure(error.message ?: "invalid")
        }
    }

    private fun writePayload(out: DataOutputStream, packet: Packet) {
        when (packet) {
            is AnnouncePacket -> {
                out.writeLimited(packet.sessionId)
                out.writeByte(packet.mode.ordinal)
                out.writeByte(packet.openSlots)
                out.writeLimited(packet.hostName)
                require(packet.roster.size <= 4)
                out.writeByte(packet.roster.size)
                packet.roster.forEach { name -> out.writeLimited(name) }
            }
            is JoinPacket -> {
                out.writeLimited(packet.sessionId)
                out.writeLimited(packet.name)
            }
            is WelcomePacket -> {
                out.writeLimited(packet.sessionId)
                out.writeByte(packet.slot)
            }
            is InputPacket -> {
                out.writeLimited(packet.sessionId)
                out.writeByte(packet.playerId)
                out.writeInt(packet.sequence)
                out.writeDirection(packet.direction)
                out.writeBoolean(packet.boosting)
            }
            is StartPacket -> {
                out.writeLimited(packet.sessionId)
                out.writeLong(packet.seed)
            }
            is SnapshotPacket -> {
                out.writeLimited(packet.sessionId)
                writeState(out, packet.state)
            }
        }
    }

    private fun readPayload(input: DataInputStream, type: PacketType): Packet = when (type) {
        PacketType.ANNOUNCE -> {
            val session = input.readLimited()
            val mode = gameMode(input.readUnsignedByte())
            val open = input.readUnsignedByte()
            val name = input.readLimited()
            val count = input.readUnsignedByte()
            require(count <= 4) { "roster" }
            AnnouncePacket(session, mode, open, name, List(count) { input.readLimited() })
        }
        PacketType.JOIN -> JoinPacket(input.readLimited(), input.readLimited())
        PacketType.WELCOME -> {
            val session = input.readLimited()
            val slot = input.readUnsignedByte()
            require(slot <= 3) { "slot" }
            WelcomePacket(session, slot)
        }
        PacketType.INPUT -> {
            val session = input.readLimited()
            val player = input.readUnsignedByte()
            val sequence = input.readInt()
            require(player <= 3 && sequence >= 0) { "input" }
            InputPacket(session, player, sequence, input.readDirection(), input.readBoolean())
        }
        PacketType.START -> StartPacket(input.readLimited(), input.readLong())
        PacketType.SNAPSHOT -> SnapshotPacket(input.readLimited(), readState(input))
    }

    private fun writeState(out: DataOutputStream, state: GameState) {
        require(state.snakes.size <= MAX_SNAKES && state.food.size <= MAX_FOOD)
        out.writeByte(state.mode.ordinal)
        out.writeFloat(state.arenaRadius)
        out.writeInt(state.wave)
        out.writeLong(state.tick)
        out.writeLong(state.seed)
        out.writeByte(outcomeCode(state.outcome))
        out.writeByte(state.snakes.size)
        state.snakes.values.forEach { snake ->
            out.writeShort(snake.id)
            out.writeByte(snake.team.ordinal)
            out.writeLimited(snake.name)
            out.writeBoolean(snake.bot)
            out.writeBoolean(snake.alive)
            out.writeFloat(snake.head.x)
            out.writeFloat(snake.head.y)
            out.writeFloat(snake.heading.x)
            out.writeFloat(snake.heading.y)
            out.writeFloat(snake.length)
            out.writeFloat(snake.speed)
            out.writeInt(snake.score)
            val points = snake.body.takeLast(MAX_POINTS)
            out.writeByte(points.size)
            points.forEach { point ->
                out.writeFloat(point.x)
                out.writeFloat(point.y)
            }
        }
        out.writeByte(state.food.size)
        state.food.forEach { food ->
            out.writeInt(food.id)
            out.writeFloat(food.position.x)
            out.writeFloat(food.position.y)
            out.writeByte(food.value)
        }
    }

    private fun readState(input: DataInputStream): GameState {
        val mode = gameMode(input.readUnsignedByte())
        val radius = input.readFinite("radius")
        require(radius in 1f..200f) { "radius" }
        val wave = input.readInt()
        val tick = input.readLong()
        val seed = input.readLong()
        val outcome = outcome(input.readUnsignedByte())
        val snakeCount = input.readUnsignedByte()
        require(wave in 0..100 && tick >= 0 && snakeCount <= MAX_SNAKES) { "state" }
        val snakes = buildMap {
            repeat(snakeCount) {
                val id = input.readUnsignedShort()
                require(id <= 10_000) { "snake" }
                val team = if (input.readUnsignedByte() == 0) Team.LIME else Team.MAGENTA
                val name = input.readLimited()
                val bot = input.readBoolean()
                val alive = input.readBoolean()
                val head = Vec2(input.readFinite("x"), input.readFinite("y"))
                val heading = Vec2(input.readFinite("heading"), input.readFinite("heading"))
                val length = input.readFinite("length")
                val speed = input.readFinite("speed")
                val score = input.readInt()
                require(score >= 0) { "score" }
                val pointCount = input.readUnsignedByte()
                require(pointCount <= MAX_POINTS && length in 0f..200f && speed in 0f..40f) { "body" }
                val body = List(pointCount) { Vec2(input.readFinite("x"), input.readFinite("y")) }
                put(id, SnakeState(id, team, name, bot, head, heading, body, length, score, alive, speed))
            }
        }
        val foodCount = input.readUnsignedByte()
        require(foodCount <= MAX_FOOD) { "food" }
        val food = List(foodCount) {
            val id = input.readInt()
            require(id >= 0) { "food" }
            Food(id, Vec2(input.readFinite("x"), input.readFinite("y")), input.readUnsignedByte())
        }
        return GameState(mode, radius, snakes, food, wave, tick, outcome, seed)
    }

    private fun DataOutputStream.writeLimited(value: String) {
        require(value.encodeToByteArray().size <= MAX_TEXT) { "text" }
        writeUTF(value)
    }

    private fun DataInputStream.readLimited(): String {
        val value = readUTF()
        require(value.encodeToByteArray().size <= MAX_TEXT) { "text" }
        return value
    }

    private fun DataOutputStream.writeDirection(direction: Vec2) {
        require(validDirection(direction)) { "direction" }
        writeFloat(direction.x)
        writeFloat(direction.y)
    }

    private fun DataInputStream.readDirection(): Vec2 {
        val direction = Vec2(readFinite("direction"), readFinite("direction"))
        require(validDirection(direction)) { "direction" }
        return direction
    }

    private fun DataInputStream.readFinite(label: String): Float {
        val value = readFloat()
        require(value.isFinite()) { label }
        return value
    }

    private fun validDirection(direction: Vec2): Boolean {
        return direction.x.isFinite() && direction.y.isFinite() && abs(direction.x) <= 1f && abs(direction.y) <= 1f
    }

    private fun gameMode(ordinal: Int): GameMode {
        return GameMode.entries.getOrNull(ordinal) ?: throw IllegalArgumentException("mode")
    }

    private fun outcomeCode(outcome: GameOutcome?): Int = when (outcome) {
        null -> 0
        is GameOutcome.TeamWon -> if (outcome.team == Team.LIME) 1 else 2
        GameOutcome.Defeat -> 3
        GameOutcome.Draw -> 4
    }

    private fun outcome(code: Int): GameOutcome? = when (code) {
        0 -> null
        1 -> GameOutcome.TeamWon(Team.LIME)
        2 -> GameOutcome.TeamWon(Team.MAGENTA)
        3 -> GameOutcome.Defeat
        4 -> GameOutcome.Draw
        else -> throw IllegalArgumentException("outcome")
    }

    internal fun checksum(bytes: ByteArray): Int {
        var crc = 0xFFFF
        bytes.forEach { byte ->
            crc = crc xor (byte.toInt() and 0xFF)
            repeat(8) {
                crc = if (crc and 1 != 0) (crc ushr 1) xor 0xA001 else crc ushr 1
            }
        }
        return crc and 0xFFFF
    }
}
