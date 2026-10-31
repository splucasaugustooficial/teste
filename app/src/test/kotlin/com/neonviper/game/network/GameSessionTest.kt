package com.neonviper.game.network

import com.neonviper.game.engine.GameMode
import com.neonviper.game.engine.PlayerInput
import com.neonviper.game.engine.Vec2
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GameSessionTest {
    @Test
    fun `second peer joins the discovered host`() {
        val clock = ManualClock()
        val bus = InMemoryTransport()
        val host = GameSession(bus.endpoint("a"), clock, "a", "VIPER")
        val guest = GameSession(bus.endpoint("b"), clock, "b", "MAMBA")
        host.searchOrHost(GameMode.VERSUS)
        clock.advanceBy(1_600)
        guest.searchOrHost(GameMode.VERSUS)
        bus.flush()
        assertEquals(SessionRole.CLIENT, guest.state.role)
        assertEquals(2, guest.state.slot)
        assertEquals(2, host.state.humanCount)
        clock.advanceBy(500)
        bus.flush()
        assertTrue(guest.state.roster.any { it.name == "MAMBA" && it.human })
    }

    @Test
    fun `later host yields to the lower session id`() {
        val clock = ManualClock()
        val bus = InMemoryTransport()
        val first = GameSession(bus.endpoint("a"), clock, "a", "VIPER")
        val second = GameSession(bus.endpoint("b"), clock, "b", "MAMBA")
        first.searchOrHost(GameMode.VERSUS)
        second.searchOrHost(GameMode.VERSUS)
        clock.advanceBy(1_600)
        bus.flush()
        assertEquals(SessionRole.HOST, first.state.role)
        assertEquals(SessionRole.CLIENT, second.state.role)
    }

    @Test
    fun `silent client becomes a bot and stale input is ignored`() {
        val clock = ManualClock()
        val bus = InMemoryTransport()
        val host = GameSession(bus.endpoint("a"), clock, "a", "VIPER")
        val guest = GameSession(bus.endpoint("b"), clock, "b", "MAMBA")
        host.searchOrHost(GameMode.VERSUS)
        clock.advanceBy(1_600)
        guest.searchOrHost(GameMode.VERSUS)
        bus.flush()
        val slot = guest.state.slot
        host.startMatch()
        bus.flush()
        host.submit(InputPacket("a", slot, 2, Vec2(0f, 1f), true))
        host.submit(InputPacket("a", slot, 1, Vec2(-1f, 0f), false))
        assertEquals(PlayerInput(Vec2(0f, 1f), true), host.engine?.inputFor(slot))
        clock.advanceBy(3_000)
        assertTrue(host.engine?.state?.snakes?.getValue(slot)?.bot == true)
    }

    @Test
    fun `match ends for the client when the host disappears`() {
        val clock = ManualClock()
        val bus = InMemoryTransport()
        val host = GameSession(bus.endpoint("a"), clock, "a", "VIPER")
        val guest = GameSession(bus.endpoint("b"), clock, "b", "MAMBA")
        host.searchOrHost(GameMode.DUO)
        clock.advanceBy(1_600)
        guest.searchOrHost(GameMode.DUO)
        bus.flush()
        host.startMatch()
        bus.flush()
        host.close()
        clock.advanceBy(3_000)
        assertEquals("HOST DESCONECTADO", guest.state.message)
        assertEquals(SessionPhase.ENDED, guest.state.phase)
    }
}
