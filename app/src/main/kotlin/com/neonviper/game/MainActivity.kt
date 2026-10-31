package com.neonviper.game

import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.view.WindowInsets
import android.view.WindowInsetsController
import com.neonviper.game.ui.NeonViperView

class MainActivity : Activity() {
    private lateinit var game: NeonViperView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
            window.insetsController?.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        game = NeonViperView(this)
        setContentView(game)
    }

    override fun onPause() {
        game.onHostPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        game.onHostResume()
    }
}
