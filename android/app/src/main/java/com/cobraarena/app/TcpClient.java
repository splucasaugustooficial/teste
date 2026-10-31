package com.cobraarena.app;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

class TcpClient {
    private final LanBridge bridge;
    private final String ip;
    private final int port;
    private volatile Socket socket;
    private Thread thread;

    TcpClient(LanBridge bridge, String ip, int port) {
        this.bridge = bridge;
        this.ip = ip;
        this.port = port;
    }

    void start() {
        thread = new Thread(() -> {
            try {
                Socket s = new Socket();
                s.connect(new InetSocketAddress(ip, port), 2500);
                s.setTcpNoDelay(true);
                socket = s;
                BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
                String line;
                while ((line = in.readLine()) != null) {
                    if (!line.isEmpty()) {
                        bridge.eval("window.CobraBridge && CobraBridge.onMessage('host'," + LanBridge.jsonEscape(line) + ")");
                    }
                }
            } catch (Exception ignored) {
            }
        }, "cobra-client");
        thread.setDaemon(true);
        thread.start();
    }

    void send(String json) {
        Socket s = socket;
        if (s == null) return;
        String line = json.endsWith("\n") ? json : json + "\n";
        try {
            OutputStream out = s.getOutputStream();
            synchronized (s) {
                out.write(line.getBytes(StandardCharsets.UTF_8));
                out.flush();
            }
        } catch (Exception ignored) {
        }
    }

    void close() {
        try {
            if (socket != null) socket.close();
        } catch (Exception ignored) {
        }
    }
}
