package com.neonviper.game.network

import com.neonviper.game.engine.GameMode
import com.neonviper.game.engine.Vec2
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ProtocolTest {
    @Test
    fun `input packet survives round trip`() {
        val packet = InputPacket("session", 1, 19, Vec2(0.6f, -0.8f), true)
        assertEquals(packet, Protocol.decode(Protocol.encode(packet)).getOrThrow())
    }

    @Test
    fun `announce welcome and start survive round trip`() {
        val announce = AnnouncePacket("arena", GameMode.DUO, 1, "VIPER", listOf("VIPER", ""))
        val welcome = WelcomePacket("arena", 1)
        val start = StartPacket("arena", 42L)
        assertEquals(announce, Protocol.decode(Protocol.encode(announce)).getOrThrow())
        assertEquals(welcome, Protocol.decode(Protocol.encode(welcome)).getOrThrow())
        assertEquals(start, Protocol.decode(Protocol.encode(start)).getOrThrow())
    }

    @Test
    fun `truncated packet is rejected`() {
        assertTrue(Protocol.decode(byteArrayOf(0x4e, 0x56)).isFailure)
    }

    @Test
    fun `oversized packet is rejected`() {
        assertTrue(Protocol.decode(ByteArray(Protocol.MAX_PACKET_SIZE + 1)).isFailure)
    }

    @Test
    fun `direction outside the unit range is rejected`() {
        val encoded = Protocol.encode(InputPacket("session", 0, 1, Vec2(0f, 0f), false)).copyOf()
        encoded[26] = 0x40
        encoded[27] = 0
        encoded[28] = 0
        encoded[29] = 0
        val sum = Protocol.checksum(encoded.copyOf(encoded.size - 2))
        encoded[encoded.size - 2] = (sum shr 8).toByte()
        encoded[encoded.size - 1] = (sum and 0xFF).toByte()
        val decoded = Protocol.decode(encoded)
        assertTrue(decoded.isFailure)
        assertEquals("direction", decoded.error)
    }

    @Test
    fun `changed byte fails the checksum`() {
        val encoded = Protocol.encode(JoinPacket("session", "VIPER")).copyOf()
        encoded[8] = encoded[8].inc()
        assertTrue(Protocol.decode(encoded).isFailure)
    }
}
