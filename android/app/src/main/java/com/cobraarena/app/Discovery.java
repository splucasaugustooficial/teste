package com.cobraarena.app;

import org.json.JSONObject;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;

class Discovery {
    private final LanBridge bridge;
    private volatile boolean hosting;
    private volatile boolean scanning;
    private Thread hostThread;
    private Thread scanThread;
    private DatagramSocket hostSock;
    private String name = "Cobra";
    private String mode = "contra";
    private String ip = "0.0.0.0";
    private int port = LanBridge.TCP_PORT;

    Discovery(LanBridge bridge) {
        this.bridge = bridge;
    }

    void startHost(String name, String mode, String ip, int port) {
        stop();
        this.name = name;
        this.mode = mode;
        this.ip = ip;
        this.port = port;
        hosting = true;
        hostThread = new Thread(this::hostLoop, "cobra-udp-host");
        hostThread.setDaemon(true);
        hostThread.start();
    }

    void scan(int ms) {
        scanning = true;
        scanThread = new Thread(() -> scanLoop(ms), "cobra-udp-scan");
        scanThread.setDaemon(true);
        scanThread.start();
    }

    void stop() {
        hosting = false;
        scanning = false;
        try {
            if (hostSock != null) hostSock.close();
        } catch (Exception ignored) {
        }
    }

    private String announce() {
        JSONObject o = new JSONObject();
        try {
            o.put("v", 1);
            o.put("name", name);
            o.put("mode", mode);
            o.put("ip", ip);
            o.put("host", ip);
            o.put("port", port);
        } catch (Exception ignored) {
        }
        return "COBRA1|" + o;
    }

    private void hostLoop() {
        try (DatagramSocket sock = new DatagramSocket(LanBridge.UDP_PORT)) {
            hostSock = sock;
            sock.setBroadcast(true);
            sock.setReuseAddress(true);
            byte[] buf = new byte[1024];
            while (hosting) {
                DatagramPacket pkt = new DatagramPacket(buf, buf.length);
                sock.receive(pkt);
                String text = new String(pkt.getData(), 0, pkt.getLength(), StandardCharsets.UTF_8);
                if (text.startsWith("COBRA1?")) {
                    byte[] out = announce().getBytes(StandardCharsets.UTF_8);
                    sock.send(new DatagramPacket(out, out.length, pkt.getAddress(), pkt.getPort()));
                    try {
                        sock.send(new DatagramPacket(out, out.length, InetAddress.getByName("255.255.255.255"), LanBridge.UDP_PORT));
                    } catch (Exception ignored) {
                    }
                }
            }
        } catch (Exception ignored) {
        }
    }

    private void scanLoop(int ms) {
        try (DatagramSocket sock = new DatagramSocket()) {
            sock.setBroadcast(true);
            sock.setSoTimeout(Math.max(200, ms / 4));
            byte[] q = "COBRA1?".getBytes(StandardCharsets.UTF_8);
            DatagramPacket query = new DatagramPacket(q, q.length, InetAddress.getByName("255.255.255.255"), LanBridge.UDP_PORT);
            long end = System.currentTimeMillis() + ms;
            while (scanning && System.currentTimeMillis() < end) {
                sock.send(query);
                try {
                    byte[] buf = new byte[1024];
                    DatagramPacket pkt = new DatagramPacket(buf, buf.length);
                    sock.receive(pkt);
                    String text = new String(pkt.getData(), 0, pkt.getLength(), StandardCharsets.UTF_8);
                    if (text.startsWith("COBRA1|")) {
                        String json = text.substring(7);
                        bridge.eval("window.CobraBridge && CobraBridge.onDiscovery(" + json + ")");
                    }
                } catch (Exception ignored) {
                }
            }
        } catch (Exception ignored) {
        }
    }
}
