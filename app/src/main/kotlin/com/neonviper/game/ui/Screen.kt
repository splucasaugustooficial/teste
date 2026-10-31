package com.neonviper.game.ui

import com.neonviper.game.engine.GameMode
import com.neonviper.game.engine.GameOutcome
import com.neonviper.game.input.ControlScheme

sealed interface Screen

data object SplashScreen : Screen
data object HomeScreen : Screen
data class SearchScreen(val mode: GameMode, val message: String? = null) : Screen
data class LobbyScreen(val mode: GameMode, val message: String? = null) : Screen
data class ArenaScreen(val mode: GameMode) : Screen
data class ResultScreen(val mode: GameMode, val outcome: GameOutcome) : Screen
data object SettingsScreen : Screen

sealed interface UiAction {
    data class Play(val mode: GameMode) : UiAction
    data object SplashFinished : UiAction
    data object HostLost : UiAction
    data object OpenSettings : UiAction
    data object Back : UiAction
    data object Home : UiAction
    data object Rematch : UiAction
    data object Rename : UiAction
    data class SetControl(val scheme: ControlScheme) : UiAction
}

object ScreenReducer {
    fun reduce(screen: Screen, action: UiAction): Screen = when (action) {
        UiAction.SplashFinished -> if (screen is SplashScreen) HomeScreen else screen
        is UiAction.Play -> SearchScreen(action.mode)
        UiAction.HostLost -> SearchScreen(screen.modeOf(), "HOST DESCONECTADO")
        UiAction.OpenSettings -> SettingsScreen
        UiAction.Back -> when (screen) {
            is SettingsScreen, is SearchScreen, is LobbyScreen, is ResultScreen -> HomeScreen
            else -> screen
        }
        UiAction.Home -> HomeScreen
        UiAction.Rematch -> SearchScreen(screen.modeOf())
        is UiAction.SetControl, UiAction.Rename -> screen
    }
}

fun Screen.modeOf(): GameMode = when (this) {
    is SearchScreen -> mode
    is LobbyScreen -> mode
    is ArenaScreen -> mode
    is ResultScreen -> mode
    else -> GameMode.VERSUS
}
