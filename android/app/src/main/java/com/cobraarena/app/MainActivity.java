package com.cobraarena.app;

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import android.app.Activity;

public class MainActivity extends Activity {
    private WebView webView;
    private LanBridge bridge;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (android.os.Build.VERSION.SDK_INT >= 21) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        bridge = new LanBridge(this, webView);
        webView.addJavascriptInterface(bridge, "CobraNative");
        webView.setWebViewClient(new WebViewClient());
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    protected void onDestroy() {
        if (bridge != null) bridge.stop();
        if (webView != null) webView.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        webView.evaluateJavascript(
                "(function(){var m=document.getElementById('menu');return m&&!m.classList.contains('hidden');})()",
                value -> {
                    if ("true".equals(value)) {
                        MainActivity.super.onBackPressed();
                    } else {
                        webView.evaluateJavascript(
                                "document.getElementById('btn-back-menu')&&document.getElementById('btn-back-menu').click();document.getElementById('btn-again')&&document.getElementById('btn-again').click();",
                                null);
                    }
                });
    }
}
