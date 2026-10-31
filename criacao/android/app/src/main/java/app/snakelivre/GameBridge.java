package app.snakelivre;

import android.webkit.JavascriptInterface;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Ponte entre o jogo (JavaScript) e a rede local. O método único existe
 * porque a WebView só enxerga métodos anotados, e o jogo manda um JSON.
 */
public final class GameBridge {
    private final MainActivity activity;

    GameBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void command(String payload) {
        activity.postCommand(payload);
    }

    static JSONObject parse(String payload) throws JSONException {
        if (payload == null || payload.length() > 70000) {
            throw new JSONException("comando vazio ou grande demais");
        }
        return new JSONObject(payload);
    }
}
