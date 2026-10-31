package com.cobrarede.snake

import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import com.cobrarede.snake.databinding.ActivityGameBinding

class GameActivity : AppCompatActivity() {
    companion object {
        const val EXTRA_MODE = "mode"
        const val EXTRA_HOST = "host"
        const val EXTRA_NAME = "name"
    }

    private lateinit var binding: ActivityGameBinding
    private var isHost = false
    private var inputSeq = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityGameBinding.inflate(layoutInflater)
        setContentView(binding.root)

        isHost = intent.getBooleanExtra(EXTRA_HOST, false)
        val mode = GameMode.valueOf(intent.getStringExtra(EXTRA_MODE) ?: GameMode.VERSUS.name)
        val localId = GameSession.localPlayerId

        binding.gameView.configure(mode, localId)

        binding.gameView.onSteer = { angle ->
            inputSeq++
            if (isHost) {
                GameSession.server?.setHostInput(angle)
            } else {
                GameSession.client?.sendInput(angle, inputSeq)
            }
        }

        binding.gameView.onFrame = {
            val engine =
                if (isHost) {
                    GameSession.server?.snapshotEngine()
                } else {
                    GameSession.clientEngine
                }
            engine?.let { binding.gameView.renderEngine(it) }
            val me = engine?.snakes?.firstOrNull { it.id == localId }
            if (me != null) {
                binding.hudScore.text = getString(R.string.score, me.score)
                if (!me.alive) {
                    binding.hudMessage.visibility = View.VISIBLE
                    binding.hudMessage.text = getString(R.string.you_died)
                } else {
                    binding.hudMessage.visibility = View.GONE
                }
            }
        }

        binding.gameView.startLoop()
    }

    override fun onDestroy() {
        binding.gameView.stopLoop()
        GameSession.reset()
        super.onDestroy()
    }
}
