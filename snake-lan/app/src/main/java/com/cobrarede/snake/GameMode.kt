package com.cobrarede.snake

enum class GameMode(val wire: String) {
    VERSUS("versus"),
    DUO("duo"),
    ;

    companion object {
        fun fromWire(value: String): GameMode =
            entries.firstOrNull { it.wire == value } ?: VERSUS
    }
}
