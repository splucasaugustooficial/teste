package com.cobraarena.app;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

class HostServer {
    private final LanBridge bridge;
    private final Map<String, Client> clients = new ConcurrentHashMap<>();
    private final AtomicInteger seq = new AtomicInteger(1);
    private volatile boolean running;
    private ServerSocket server;
    private Thread acceptThread;

    HostServer(LanBridge bridge) {
        this.bridge = bridge;
    }

    synchronized void start(String name, String mode) {
        stop();
        running = true;
        acceptThread = new Thread(() -> {
            try {
                server = new ServerSocket(LanBridge.TCP_PORT);
                server.setReuseAddress(true);
                while (running) {
                    Socket sock = server.accept();
                    sock.setTcpNoDelay(true);
                    String id = "c" + seq.getAndIncrement();
                    Client c = new Client(id, sock);
                    clients.put(id, c);
                    bridge.emitClient(id);
                    c.thread = new Thread(() -> readLoop(c));
                    c.thread.start();
                }
            } catch (Exception ignored) {
            }
        }, "cobra-host");
        acceptThread.setDaemon(true);
        acceptThread.start();
    }

    void broadcast(String json) {
        String line = json.endsWith("\n") ? json : json + "\n";
        for (Client c : clients.values()) c.write(line);
    }

    void sendTo(String id, String json) {
        Client c = clients.get(id);
        if (c == null) return;
        c.write(json.endsWith("\n") ? json : json + "\n");
    }

    synchronized void stop() {
        running = false;
        for (Client c : clients.values()) c.close();
        clients.clear();
        try {
            if (server != null) server.close();
        } catch (Exception ignored) {
        }
        server = null;
    }

    private void readLoop(Client c) {
        try (BufferedReader in = new BufferedReader(new InputStreamReader(c.socket.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = in.readLine()) != null) {
                if (!line.isEmpty()) bridge.emitMessage(c.id, line);
            }
        } catch (Exception ignored) {
        } finally {
            clients.remove(c.id);
            c.close();
            bridge.emitDisconnect(c.id);
        }
    }

    static class Client {
        final String id;
        final Socket socket;
        Thread thread;

        Client(String id, Socket socket) {
            this.id = id;
            this.socket = socket;
        }

        void write(String line) {
            try {
                OutputStream out = socket.getOutputStream();
                synchronized (socket) {
                    out.write(line.getBytes(StandardCharsets.UTF_8));
                    out.flush();
                }
            } catch (Exception ignored) {
            }
        }

        void close() {
            try {
                socket.close();
            } catch (Exception ignored) {
            }
        }
    }
}
