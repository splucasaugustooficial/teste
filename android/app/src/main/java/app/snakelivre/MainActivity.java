package app.snakelivre;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedDispatcher;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayDeque;

public class MainActivity extends Activity {
    static final String TAG = "SnakeLivre";
    private static final String PREFS = "snake-livre";

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ArrayDeque<String> pending = new ArrayDeque<>();
    private WebView webView;
    private NetEngine net;
    private boolean jsReady;
    private boolean destroyed;
    private boolean finishing;
    private long lastBack;

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemBars();

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#07111F"));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        settings.setMediaPlaybackRequiresUserGesture(false);
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage message) {
                Log.d(TAG, message.message() + " (" + message.lineNumber() + ")");
                return true;
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return true;
            }
        });
        net = new NetEngine(this, this::enqueueFromAnyThread);
        webView.addJavascriptInterface(new GameBridge(this), "AndroidBridge");
        setContentView(webView);
        webView.loadUrl("file:///android_asset/www/index.html");

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::askJsBack);
        }
    }

    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    void postCommand(String payload) {
        main.post(() -> handleCommand(payload));
    }

    private void handleCommand(String payload) {
        if (destroyed) return;
        try {
            JSONObject obj = GameBridge.parse(payload);
            String op = obj.optString("op", "");
            switch (op) {
                case "ready":
                    jsReady = true;
                    flush();
                    break;
                case "loadPrefs":
                    emitPrefs();
                    break;
                case "savePrefs":
                    savePrefs(obj);
                    break;
                case "host":
                    net.host(obj);
                    break;
                case "discover":
                    net.discover();
                    break;
                case "join":
                    net.join(obj.optString("ip", ""), obj.optInt("port", NetEngine.GAME_PORT));
                    break;
                case "stop":
                    net.stop();
                    break;
                case "send":
                    net.send(obj.optString("to", ""), obj.optString("data", ""));
                    break;
                case "broadcast":
                    net.broadcast(obj.optString("data", ""));
                    break;
                case "advertise":
                    net.advertise(obj);
                    break;
                default:
                    break;
            }
        } catch (JSONException e) {
            Log.w(TAG, "comando invalido", e);
        }
    }

    private void emitPrefs() {
        SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
        try {
            JSONObject obj = new JSONObject();
            obj.put("t", "prefs");
            obj.put("name", sp.getString("name", ""));
            obj.put("mute", sp.getBoolean("mute", false));
            obj.put("best", sp.getInt("best", 0));
            enqueue(obj.toString());
        } catch (JSONException e) {
            Log.w(TAG, "prefs", e);
        }
    }

    private void savePrefs(JSONObject obj) {
        String name = obj.optString("name", "");
        if (name.length() > 16) name = name.substring(0, 16);
        getSharedPreferences(PREFS, MODE_PRIVATE)
                .edit()
                .putString("name", name)
                .putBoolean("mute", obj.optBoolean("mute", false))
                .putInt("best", Math.max(0, obj.optInt("best", 0)))
                .apply();
    }

    private void enqueueFromAnyThread(String json) {
        main.post(() -> enqueue(json));
    }

    private void enqueue(String json) {
        if (destroyed) return;
        if (!jsReady) pending.add(json);
        else deliver(json);
    }

    private void flush() {
        while (!pending.isEmpty()) deliver(pending.removeFirst());
    }

    private void deliver(String json) {
        if (destroyed || webView == null) return;
        String arg = JSONObject.quote(json);
        webView.evaluateJavascript("window.__snakeOnNative&&window.__snakeOnNative(" + arg + ")", null);
    }

    private void askJsBack() {
        long now = SystemClock.uptimeMillis();
        if (finishing || destroyed || webView == null || now - lastBack < 300) return;
        lastBack = now;
        webView.evaluateJavascript(
                "(function(){try{return !!(window.__snakeBack&&window.__snakeBack());}catch(e){return false;}})()",
                value -> {
                    if (!"true".equals(value) && !finishing && !destroyed) {
                        finishing = true;
                        finish();
                    }
                });
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (Build.VERSION.SDK_INT >= 33) return;
        askJsBack();
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemBars();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        destroyed = true;
        if (net != null) net.stop();
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidBridge");
            if (webView.getParent() instanceof ViewGroup) {
                ((ViewGroup) webView.getParent()).removeView(webView);
            }
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
