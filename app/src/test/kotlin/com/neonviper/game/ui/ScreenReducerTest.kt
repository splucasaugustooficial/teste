package com.neonviper.game.ui

import com.neonviper.game.engine.GameMode
import com.neonviper.game.engine.GameOutcome
import com.neonviper.game.engine.Team
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ScreenReducerTest {
    @Test
    fun `versus action enters LAN search`() {
        val next = ScreenReducer.reduce(HomeScreen, UiAction.Play(GameMode.VERSUS))
        assertEquals(SearchScreen(GameMode.VERSUS), next)
    }

    @Test
    fun `host disconnect returns to search with message`() {
        val next = ScreenReducer.reduce(ArenaScreen(GameMode.DUO), UiAction.HostLost)
        assertEquals(SearchScreen(GameMode.DUO, "HOST DESCONECTADO"), next)
    }

    @Test
    fun `result can start a rematch of the same mode`() {
        val next = ScreenReducer.reduce(ResultScreen(GameMode.DUO, GameOutcome.Defeat), UiAction.Rematch)
        assertEquals(SearchScreen(GameMode.DUO), next)
    }
}

class MenuLayoutTest {
    @Test
    fun `home actions stay inside the screen and do not overlap`() {
        listOf(1920f to 1080f, 1280f to 720f, 2400f to 1080f).forEach { (width, height) ->
            val buttons = MenuLayout.home(width, height)
            assertEquals(listOf("DUPLA", "CONTRA", "TREINO", "AJUSTES"), buttons.map { it.label })
            buttons.forEach { button ->
                assertTrue(button.rect.left >= 0f)
                assertTrue(button.rect.top >= 0f)
                assertTrue(button.rect.right <= width)
                assertTrue(button.rect.bottom <= height)
            }
            for (first in buttons.indices) {
                for (second in first + 1 until buttons.size) {
                    assertFalse(buttons[first].rect.intersects(buttons[second].rect))
                }
            }
        }
    }

    @Test
    fun `result offers rematch and home`() {
        val buttons = MenuLayout.result(1920f, 1080f)
        assertEquals(UiAction.Rematch, buttons.first { it.label == "REVANCHE" }.action)
        assertEquals(UiAction.Home, buttons.first { it.label == "INÍCIO" }.action)
    }

    @Test
    fun `team victory names the winning side`() {
        assertEquals("LIME VENCEU", MenuLayout.outcomeLabel(GameOutcome.TeamWon(Team.LIME)))
        assertEquals("ONDAS ENCERRADAS", MenuLayout.outcomeLabel(GameOutcome.Defeat))
    }
}
