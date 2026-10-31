package com.cobrarede.snake

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.cobrarede.snake.databinding.ActivityLobbyBinding

class LobbyActivity : AppCompatActivity() {
    companion object {
        const val EXTRA_MODE = "mode"
        const val EXTRA_HOST = "host"
    }

    private lateinit var binding: ActivityLobbyBinding
    private lateinit var mode: GameMode
    private var isHost = false
    private var hostReady = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLobbyBinding.inflate(layoutInflater)
        setContentView(binding.root)

        mode = GameMode.valueOf(intent.getStringExtra(EXTRA_MODE) ?: GameMode.VERSUS.name)
        isHost = intent.getBooleanExtra(EXTRA_HOST, false)
        GameSession.prepare(mode)

        binding.titleMode.text =
            if (mode == GameMode.DUO) getString(R.string.mode_duo) else getString(R.string.mode_versus)

        binding.btnBack.setOnClickListener {
            GameSession.reset()
            finish()
        }

        if (isHost) {
            binding.labelHostIp.visibility = View.VISIBLE
            binding.textHostIp.visibility = View.VISIBLE
            binding.textPort.visibility = View.VISIBLE
            binding.layoutJoinIp.visibility = View.GONE
            binding.btnAction.text = getString(R.string.start_match)
            val ip = NetworkUtils.localWifiIpv4() ?: "—"
            binding.textHostIp.text = ip
            binding.textPort.text = getString(R.string.port_info, NetworkUtils.GAME_PORT)
            binding.textStatus.text = getString(R.string.waiting_players)
        } else {
            binding.layoutJoinIp.visibility = View.VISIBLE
            binding.btnAction.text = getString(R.string.connect)
            binding.textStatus.text = getString(R.string.host_ip_hint)
        }

        binding.btnAction.setOnClickListener {
            val name = binding.inputPlayerName.text?.toString()?.trim().orEmpty().ifBlank { "Jogador" }
            if (isHost) startAsHost(name) else connectAsClient(name)
        }
    }

    private fun startAsHost(name: String) {
        if (GameSession.server == null) {
            GameSession.server =
                LanServer(
                    mode = mode,
                    hostName = name,
                    onLobbyUpdate = { runOnUiThread { updatePlayerList(it) } },
                    onStarted = {
                        runOnUiThread { launchGame(isHost = true, name = name) }
                    },
                ).also { it.start() }
            GameSession.localPlayerId = 0
            hostReady = true
            binding.textStatus.text = getString(R.string.waiting_players)
            Toast.makeText(this, "Sala criada. Toque de novo para iniciar.", Toast.LENGTH_LONG).show()
            return
        }
        if (hostReady) {
            GameSession.server?.startMatch()
        }
    }

    private fun connectAsClient(name: String) {
        val ip = binding.inputHostIp.text?.toString()?.trim().orEmpty()
        if (ip.isEmpty()) {
            binding.inputHostIp.error = getString(R.string.host_ip_hint)
            return
        }
        binding.btnAction.isEnabled = false
        GameSession.client =
            LanClient(
                hostIp = ip,
                playerName = name,
                mode = mode,
                onLobby = { runOnUiThread { updatePlayerList(it) } },
                onWelcome = { id, _ ->
                    GameSession.localPlayerId = id
                },
                onStart = {
                    runOnUiThread { launchGame(isHost = false, name = name) }
                },
                onState = { GameSession.applyClientState(it) },
                onDisconnected = {
                    runOnUiThread {
                        Toast.makeText(this, "Conexão perdida", Toast.LENGTH_SHORT).show()
                        binding.btnAction.isEnabled = true
                    }
                },
            ).also { it.connect() }
        binding.textStatus.text = getString(R.string.waiting_players)
    }

    private fun updatePlayerList(players: List<String>) {
        binding.textPlayerList.text = players.joinToString("\n") { "• $it" }
        binding.textStatus.text = getString(R.string.players_connected, players.size)
    }

    private fun launchGame(isHost: Boolean, name: String) {
        startActivity(
            Intent(this, GameActivity::class.java).apply {
                putExtra(GameActivity.EXTRA_MODE, mode.name)
                putExtra(GameActivity.EXTRA_HOST, isHost)
                putExtra(GameActivity.EXTRA_NAME, name)
            },
        )
        finish()
    }
}
