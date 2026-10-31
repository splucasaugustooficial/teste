package com.cobrarede.snake

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.cobrarede.snake.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.btnVersusHost.setOnClickListener {
            openLobby(GameMode.VERSUS, host = true)
        }
        binding.btnVersusJoin.setOnClickListener {
            openLobby(GameMode.VERSUS, host = false)
        }
        binding.btnDuoHost.setOnClickListener {
            openLobby(GameMode.DUO, host = true)
        }
        binding.btnDuoJoin.setOnClickListener {
            openLobby(GameMode.DUO, host = false)
        }
    }

    private fun openLobby(mode: GameMode, host: Boolean) {
        startActivity(
            Intent(this, LobbyActivity::class.java).apply {
                putExtra(LobbyActivity.EXTRA_MODE, mode.name)
                putExtra(LobbyActivity.EXTRA_HOST, host)
            },
        )
    }
}
