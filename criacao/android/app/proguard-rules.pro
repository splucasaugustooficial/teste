# O jogo não ofusca o debug. Se um dia minificar, preserve a ponte do WebView.
-keepclassmembers class app.snakelivre.GameBridge {
    @android.webkit.JavascriptInterface <methods>;
}
