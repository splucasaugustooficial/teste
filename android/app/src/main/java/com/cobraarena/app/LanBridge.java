package com.cobraarena.app;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Collections;
import java.util.Locale;

public class LanBridge {
    static final int TCP_PORT = 42425;
    static final int UDP_PORT = 42424;

    private final Context context;
    private final WebView webView;
    private final HostServer server;
    private final Discovery discovery;
    private TcpClient client;

    public LanBridge(Context context, WebView webView) {
        this.context = context.getApplicationContext();
        this.webView = webView;
        this.server = new HostServer(this);
        this.discovery = new Discovery(this);
    }

    void eval(String js) {
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    void emit(String type, String payload) {
        String safe = jsonEscape(payload);
        eval("window.CobraBridge && CobraBridge.on" + type + "(" + safe + ")");
    }

    void emitMessage(String id, String json) {
        eval("window.CobraBridge && CobraBridge.onMessage(" + jsonEscape(id) + "," + jsonEscape(json) + ")");
    }

    void emitClient(String id) {
        eval("window.CobraBridge && CobraBridge.onClient(" + jsonEscape(id) + ")");
    }

    void emitDisconnect(String id) {
        eval("window.CobraBridge && CobraBridge.onDisconnect(" + jsonEscape(id) + ")");
    }

    static String jsonEscape(String raw) {
        if (raw == null) return "\"\"";
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            switch (c) {
                case '\\':
                case '"':
                    sb.append('\\').append(c);
                    break;
                case '\n':
                    sb.append("\\n");
                    break;
                case '\r':
                    sb.append("\\r");
                    break;
                default:
                    if (c < 0x20) sb.append(String.format(Locale.US, "\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        sb.append('"');
        return sb.toString();
    }

    @JavascriptInterface
    public String getLocalIp() {
        return findLocalIp();
    }

    @JavascriptInterface
    public String startHost(String raw) {
        stopClient();
        String name = "Cobra";
        String mode = "contra";
        try {
            JSONObject o = new JSONObject(raw == null || raw.isEmpty() ? "{}" : raw);
            name = o.optString("name", name);
            mode = o.optString("mode", mode);
        } catch (Exception ignored) {
        }
        server.start(name, mode);
        discovery.startHost(name, mode, findLocalIp(), TCP_PORT);
        JSONObject out = new JSONObject();
        try {
            out.put("ok", true);
            out.put("ip", findLocalIp());
            out.put("port", TCP_PORT);
            out.put("role", "host");
        } catch (Exception ignored) {
        }
        return out.toString();
    }

    @JavascriptInterface
    public String joinHost(String raw) {
        server.stop();
        discovery.stop();
        String ip = "";
        int port = TCP_PORT;
        try {
            JSONObject o = new JSONObject(raw);
            ip = o.optString("ip", "");
            port = o.optInt("port", TCP_PORT);
        } catch (Exception ignored) {
        }
        stopClient();
        client = new TcpClient(this, ip, port);
        client.start();
        JSONObject out = new JSONObject();
        try {
            out.put("ok", true);
            out.put("ip", findLocalIp());
            out.put("port", port);
        } catch (Exception ignored) {
        }
        return out.toString();
    }

    @JavascriptInterface
    public String scanHosts(String rawMs) {
        int ms = 1400;
        try {
            ms = Integer.parseInt(rawMs);
        } catch (Exception ignored) {
        }
        discovery.scan(ms);
        return "{\"ok\":true}";
    }

    @JavascriptInterface
    public void sendToAll(String json) {
        server.broadcast(json);
    }

    @JavascriptInterface
    public void sendTo(String raw) {
        try {
            JSONObject o = new JSONObject(raw);
            Object body = o.opt("body");
            String payload = body instanceof JSONObject ? body.toString() : o.optString("body");
            server.sendTo(o.optString("id"), payload);
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void send(String json) {
        if (client != null) client.send(json);
    }

    @JavascriptInterface
    public void stop() {
        stopClient();
        server.stop();
        discovery.stop();
    }

    private void stopClient() {
        if (client != null) {
            client.close();
            client = null;
        }
    }

    String findLocalIp() {
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                for (InetAddress addr : Collections.list(ni.getInetAddresses())) {
                    if (addr instanceof Inet4Address && !addr.isLoopbackAddress()) {
                        return addr.getHostAddress();
                    }
                }
            }
        } catch (Exception ignored) {
        }
        try {
            WifiManager wifi = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);
            if (wifi != null && wifi.getConnectionInfo() != null) {
                int ip = wifi.getConnectionInfo().getIpAddress();
                if (ip != 0) {
                    return String.format(Locale.US, "%d.%d.%d.%d",
                            ip & 0xff, (ip >> 8) & 0xff, (ip >> 16) & 0xff, (ip >> 24) & 0xff);
                }
            }
        } catch (Exception ignored) {
        }
        return "0.0.0.0";
    }
}
