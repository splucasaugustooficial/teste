package app.snakelivre;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Descobre salas por anúncio UDP na rede local e carrega o jogo por TCP.
 * O NSD do Android falha em vários aparelhos; o anúncio na porta de broadcast
 * e o IP escrito na tela cobrem a mesma Wi-Fi sem servidor na internet.
 */
final class NetEngine {
    static final int GAME_PORT = 47655;
    static final int BEACON_PORT = 47656;
    private static final int MAX_LINE = 65536;

    interface Listener {
        void onEvent(String json);
    }

    private static final class Peer {
        final String id;
        final Socket socket;

        Peer(String id, Socket socket) {
            this.id = id;
            this.socket = socket;
        }
    }

    private static final class Room {
        String ip;
        int port;
        String name;
        String mode;
        int players;
        int max;
        long seen;
    }

    private final Context context;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Map<String, Peer> peers = new LinkedHashMap<>();
    private final Map<String, Room> rooms = new LinkedHashMap<>();

    private int generation;
    private int peerSeq;
    private boolean hosting;
    private boolean listening;
    private boolean expectClient;
    private ServerSocket server;
    private Socket clientSock;
    private DatagramSocket beaconSock;
    private DatagramSocket listenSock;
    private Thread beaconThread;
    private WifiManager.MulticastLock multicastLock;
    private int hostPort;
    private String beaconName = "Sala";
    private String beaconMode = "contra";
    private int beaconPlayers = 1;
    private int beaconMax = 8;
    private String beaconBody = "";

    private final Runnable roomTicker = new Runnable() {
        @Override
        public void run() {
            if (!listening) return;
            if (expireRooms()) emitRooms();
            main.postDelayed(this, 1000);
        }
    };

    NetEngine(Context context, Listener listener) {
        this.context = context.getApplicationContext();
        this.listener = listener;
    }

    void host(JSONObject opts) {
        stop();
        beaconName = clip(opts.optString("name", "Sala"), 24);
        beaconMode = "dupla".equals(opts.optString("mode")) ? "dupla" : "contra";
        beaconPlayers = clamp(opts.optInt("players", 1), 1, 8);
        beaconMax = clamp(opts.optInt("max", 8), 1, 8);
        try {
            server = openServer();
        } catch (IOException e) {
            emitError("Não consegui abrir a sala na rede.");
            return;
        }
        hosting = true;
        int gen = generation;
        refreshBeacon();
        try {
            beaconSock = new DatagramSocket();
            beaconSock.setBroadcast(true);
        } catch (IOException e) {
            emitError("A sala abriu, mas o anúncio na Wi-Fi falhou. Use o IP.");
        }
        startAccept(gen);
        startBeacon(gen);
        emitReady();
    }

    void advertise(JSONObject opts) {
        if (!hosting) return;
        if (opts.has("name")) beaconName = clip(opts.optString("name", beaconName), 24);
        if (opts.has("mode")) beaconMode = "dupla".equals(opts.optString("mode")) ? "dupla" : "contra";
        if (opts.has("players")) beaconPlayers = clamp(opts.optInt("players", beaconPlayers), 0, 8);
        if (opts.has("max")) beaconMax = clamp(opts.optInt("max", beaconMax), 1, 8);
        refreshBeacon();
    }

    void discover() {
        stop();
        listening = true;
        int gen = generation;
        acquireMulticast();
        try {
            listenSock = new DatagramSocket(null);
            listenSock.setReuseAddress(true);
            listenSock.setBroadcast(true);
            listenSock.bind(new InetSocketAddress(BEACON_PORT));
        } catch (IOException e) {
            listening = false;
            emitError("Não consegui procurar salas neste celular.");
            emitStatus();
            return;
        }
        synchronized (rooms) {
            rooms.clear();
        }
        emitRooms();
        emitStatus();
        Thread thread = new Thread(() -> listen(gen), "snake-listen");
        thread.setDaemon(true);
        thread.start();
        main.postDelayed(roomTicker, 1000);
    }

    void join(String ip, int port) {
        stop();
        if (!validIpv4(ip) || port < 1 || port > 65535) {
            emitDisconnected("Digite um IP local, por exemplo 192.168.0.10.");
            return;
        }
        expectClient = true;
        int gen = generation;
        Thread thread = new Thread(() -> connect(ip, port, gen), "snake-client");
        thread.setDaemon(true);
        thread.start();
    }

    void send(String to, String data) {
        if (!oneLine(data)) return;
        if (expectClient && clientSock != null) {
            write(clientSock, data);
            return;
        }
        if (!hosting) return;
        Peer peer;
        synchronized (peers) {
            peer = peers.get(to);
        }
        if (peer != null) write(peer.socket, data);
    }

    void broadcast(String data) {
        if (!hosting || !oneLine(data)) return;
        List<Peer> copy;
        synchronized (peers) {
            copy = new ArrayList<>(peers.values());
        }
        for (Peer peer : copy) write(peer.socket, data);
    }

    void stop() {
        generation++;
        hosting = false;
        listening = false;
        expectClient = false;
        hostPort = 0;
        beaconBody = "";
        closeQuiet(server);
        server = null;
        closeQuiet(clientSock);
        clientSock = null;
        closeQuiet(beaconSock);
        beaconSock = null;
        closeQuiet(listenSock);
        listenSock = null;
        if (beaconThread != null) beaconThread.interrupt();
        beaconThread = null;
        List<Peer> copy;
        synchronized (peers) {
            copy = new ArrayList<>(peers.values());
            peers.clear();
        }
        for (Peer peer : copy) closeQuiet(peer.socket);
        if (multicastLock != null && multicastLock.isHeld()) multicastLock.release();
        multicastLock = null;
        main.removeCallbacks(roomTicker);
    }

    private ServerSocket openServer() throws IOException {
        IOException last = new IOException("sem porta");
        for (int port = GAME_PORT; port < GAME_PORT + 10; port++) {
            try {
                ServerSocket socket = new ServerSocket();
                socket.setReuseAddress(true);
                socket.bind(new InetSocketAddress(port));
                hostPort = port;
                return socket;
            } catch (IOException e) {
                last = e;
            }
        }
        throw last;
    }

    private void startAccept(int gen) {
        Thread thread = new Thread(() -> {
            while (hosting && gen == generation && server != null && !server.isClosed()) {
                try {
                    Socket socket = server.accept();
                    if (gen != generation || !hosting) {
                        closeQuiet(socket);
                        return;
                    }
                    socket.setTcpNoDelay(true);
                    socket.setKeepAlive(true);
                    String id = "c" + (++peerSeq);
                    Peer peer = new Peer(id, socket);
                    synchronized (peers) {
                        peers.put(id, peer);
                    }
                    emit(event("peer-open").put("id", id));
                    startRead(peer, gen);
                } catch (IOException e) {
                    if (gen == generation && hosting) emitError("A sala de rede caiu.");
                    break;
                } catch (JSONException e) {
                    break;
                }
            }
        }, "snake-accept");
        thread.setDaemon(true);
        thread.start();
    }

    private void startRead(Peer peer, int gen) {
        Thread thread = new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(peer.socket.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while (gen == generation && hosting && (line = reader.readLine()) != null) {
                    if (line.length() > MAX_LINE) {
                        dropPeer(peer.id, gen);
                        return;
                    }
                    if (line.isEmpty()) continue;
                    JSONObject obj = new JSONObject();
                    obj.put("t", "peer-msg");
                    obj.put("id", peer.id);
                    obj.put("data", line);
                    emit(obj);
                }
            } catch (IOException ignored) {
                // o fim do soquete também passa pelo finally
            } catch (JSONException e) {
                android.util.Log.w(MainActivity.TAG, "peer", e);
            } finally {
                dropPeer(peer.id, gen);
            }
        }, "snake-read-" + peer.id);
        thread.setDaemon(true);
        thread.start();
    }

    private void dropPeer(String id, int gen) {
        Peer peer;
        synchronized (peers) {
            peer = peers.remove(id);
        }
        if (peer == null) return;
        closeQuiet(peer.socket);
        if (gen != generation || !hosting) return;
        try {
            emit(event("peer-close").put("id", id));
        } catch (JSONException ignored) {
            // id é nosso, não vem da rede
        }
    }

    private void startBeacon(int gen) {
        beaconThread = new Thread(() -> {
            while (gen == generation && hosting && !Thread.currentThread().isInterrupted()) {
                sendBeacon();
                try {
                    Thread.sleep(1000);
                } catch (InterruptedException e) {
                    return;
                }
            }
        }, "snake-beacon");
        beaconThread.setDaemon(true);
        beaconThread.start();
    }

    private void refreshBeacon() {
        if (hostPort == 0) return;
        try {
            JSONObject obj = new JSONObject();
            obj.put("game", "snake-livre");
            obj.put("v", 1);
            obj.put("name", beaconName);
            obj.put("mode", beaconMode);
            obj.put("players", beaconPlayers);
            obj.put("max", beaconMax);
            obj.put("port", hostPort);
            beaconBody = obj.toString();
        } catch (JSONException ignored) {
            beaconBody = "";
        }
    }

    private void sendBeacon() {
        if (beaconSock == null || beaconBody.isEmpty()) return;
        byte[] bytes = beaconBody.getBytes(StandardCharsets.UTF_8);
        for (InetAddress address : broadcastAddresses()) {
            try {
                beaconSock.send(new DatagramPacket(bytes, bytes.length, address, BEACON_PORT));
            } catch (IOException ignored) {
                // um endereço de broadcast ruim não derruba os outros
            }
        }
    }

    private void listen(int gen) {
        byte[] buf = new byte[2048];
        while (gen == generation && listening && listenSock != null && !listenSock.isClosed()) {
            DatagramPacket packet = new DatagramPacket(buf, buf.length);
            try {
                listenSock.receive(packet);
            } catch (IOException e) {
                break;
            }
            if (!(packet.getAddress() instanceof Inet4Address)) continue;
            String ip = packet.getAddress().getHostAddress();
            if (ip == null || ip.equals(localIpv4())) continue;
            String text = new String(packet.getData(), 0, packet.getLength(), StandardCharsets.UTF_8);
            try {
                JSONObject obj = new JSONObject(text);
                if (!"snake-livre".equals(obj.optString("game")) || obj.optInt("v") != 1) continue;
                int port = obj.optInt("port");
                if (port < 1 || port > 65535) continue;
                Room room = new Room();
                room.ip = ip;
                room.port = port;
                room.name = clip(obj.optString("name", "Sala"), 24);
                room.mode = "dupla".equals(obj.optString("mode")) ? "dupla" : "contra";
                room.players = clamp(obj.optInt("players", 1), 0, 8);
                room.max = clamp(obj.optInt("max", 8), 1, 8);
                room.seen = System.currentTimeMillis();
                synchronized (rooms) {
                    rooms.put(ip + ":" + port, room);
                }
                emitRooms();
            } catch (JSONException ignored) {
                // anúncio de outro app na mesma porta
            }
        }
    }

    private boolean expireRooms() {
        long now = System.currentTimeMillis();
        boolean changed = false;
        synchronized (rooms) {
            Iterator<Room> it = rooms.values().iterator();
            while (it.hasNext()) {
                if (now - it.next().seen > 3500) {
                    it.remove();
                    changed = true;
                }
            }
        }
        return changed;
    }

    private void connect(String ip, int port, int gen) {
        boolean told = false;
        boolean up = false;
        try {
            Socket socket = new Socket();
            socket.connect(new InetSocketAddress(ip, port), 4000);
            if (gen != generation || !expectClient) {
                closeQuiet(socket);
                return;
            }
            socket.setTcpNoDelay(true);
            socket.setKeepAlive(true);
            clientSock = socket;
            up = true;
            emit(event("connected"));
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while (gen == generation && expectClient && (line = reader.readLine()) != null) {
                    if (line.length() > MAX_LINE) break;
                    if (line.isEmpty()) continue;
                    emit(event("net").put("data", line));
                }
            }
            if (gen == generation && expectClient && !told) {
                told = true;
                emitDisconnected("A conexão com a sala caiu.");
            }
        } catch (IOException e) {
            if (gen == generation && expectClient && !told) {
                told = true;
                emitDisconnected(up
                        ? "A conexão com a sala caiu."
                        : "Não achei essa sala. Confira o IP e se os dois estão na mesma Wi-Fi.");
            }
        } catch (JSONException e) {
            android.util.Log.w(MainActivity.TAG, "cliente", e);
        }
    }

    private void emitReady() {
        try {
            String ip = localIpv4();
            JSONObject obj = event("ready");
            obj.put("ip", ip == null ? "" : ip);
            obj.put("port", hostPort);
            obj.put("wifi", isWifi());
            emit(obj);
        } catch (JSONException e) {
            android.util.Log.w(MainActivity.TAG, "ready", e);
        }
    }

    private void emitStatus() {
        try {
            String ip = localIpv4();
            JSONObject obj = event("status");
            obj.put("ip", ip == null ? "" : ip);
            obj.put("wifi", isWifi());
            emit(obj);
        } catch (JSONException e) {
            android.util.Log.w(MainActivity.TAG, "status", e);
        }
    }

    private void emitRooms() {
        try {
            JSONArray arr = new JSONArray();
            synchronized (rooms) {
                for (Room room : rooms.values()) {
                    JSONObject obj = new JSONObject();
                    obj.put("ip", room.ip);
                    obj.put("port", room.port);
                    obj.put("name", room.name);
                    obj.put("mode", room.mode);
                    obj.put("players", room.players);
                    obj.put("max", room.max);
                    arr.put(obj);
                }
            }
            emit(event("rooms").put("rooms", arr));
        } catch (JSONException e) {
            android.util.Log.w(MainActivity.TAG, "rooms", e);
        }
    }

    private void emitError(String message) {
        try {
            emit(event("error").put("message", message));
        } catch (JSONException ignored) {
            // mensagem é texto fixo nosso
        }
    }

    private void emitDisconnected(String reason) {
        expectClient = false;
        try {
            emit(event("disconnected").put("reason", reason));
        } catch (JSONException ignored) {
            // razão é texto fixo nosso
        }
    }

    private void emit(JSONObject obj) {
        listener.onEvent(obj.toString());
    }

    private static JSONObject event(String type) throws JSONException {
        JSONObject obj = new JSONObject();
        obj.put("t", type);
        return obj;
    }

    private void write(Socket socket, String data) {
        try {
            synchronized (socket) {
                if (socket.isClosed()) return;
                OutputStream out = socket.getOutputStream();
                out.write(data.getBytes(StandardCharsets.UTF_8));
                out.write('\n');
                out.flush();
            }
        } catch (IOException e) {
            closeQuiet(socket);
        }
    }

    private void acquireMulticast() {
        try {
            WifiManager wifi = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);
            if (wifi == null) return;
            multicastLock = wifi.createMulticastLock("snake-livre");
            multicastLock.setReferenceCounted(false);
            multicastLock.acquire();
        } catch (RuntimeException e) {
            android.util.Log.w(MainActivity.TAG, "multicast", e);
        }
    }

    private boolean isWifi() {
        ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        Network network = cm.getActiveNetwork();
        if (network == null) return false;
        NetworkCapabilities caps = cm.getNetworkCapabilities(network);
        if (caps == null) return false;
        return caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
                || caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET);
    }

    private String localIpv4() {
        String bestSite = null;
        String bestWifi = null;
        String any = null;
        try {
            Enumeration<NetworkInterface> ifaces = NetworkInterface.getNetworkInterfaces();
            while (ifaces != null && ifaces.hasMoreElements()) {
                NetworkInterface nif = ifaces.nextElement();
                if (!nif.isUp() || nif.isLoopback()) continue;
                boolean wifiLike = wifiLike(nif.getName());
                Enumeration<InetAddress> addresses = nif.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress address = addresses.nextElement();
                    if (!(address instanceof Inet4Address) || address.isLoopbackAddress()) continue;
                    String host = address.getHostAddress();
                    if (any == null) any = host;
                    if (address.isSiteLocalAddress() && bestSite == null) bestSite = host;
                    if (address.isSiteLocalAddress() && wifiLike) bestWifi = host;
                }
            }
        } catch (IOException e) {
            android.util.Log.w(MainActivity.TAG, "ip", e);
        }
        if (bestWifi != null) return bestWifi;
        if (bestSite != null) return bestSite;
        return any;
    }

    private static List<InetAddress> broadcastAddresses() {
        List<InetAddress> out = new ArrayList<>();
        try {
            out.add(InetAddress.getByName("255.255.255.255"));
            Enumeration<NetworkInterface> ifaces = NetworkInterface.getNetworkInterfaces();
            while (ifaces != null && ifaces.hasMoreElements()) {
                NetworkInterface nif = ifaces.nextElement();
                if (!nif.isUp() || nif.isLoopback()) continue;
                for (InterfaceAddress address : nif.getInterfaceAddresses()) {
                    InetAddress broadcast = address.getBroadcast();
                    if (broadcast != null) out.add(broadcast);
                }
            }
        } catch (IOException e) {
            android.util.Log.w(MainActivity.TAG, "broadcast", e);
        }
        return out;
    }

    private static boolean wifiLike(String name) {
        String n = name == null ? "" : name.toLowerCase(Locale.US);
        return n.contains("wlan") || n.contains("wifi") || n.contains("eth") || n.contains("ap") || n.contains("p2p");
    }

    private static boolean validIpv4(String ip) {
        if (ip == null || !ip.matches("^(\\d{1,3}\\.){3}\\d{1,3}$")) return false;
        String[] parts = ip.split("\\.");
        for (String part : parts) {
            int n = Integer.parseInt(part);
            if (n > 255) return false;
        }
        return true;
    }

    private static boolean oneLine(String data) {
        return data != null && !data.isEmpty() && data.length() <= MAX_LINE
                && data.indexOf('\n') < 0 && data.indexOf('\r') < 0;
    }

    private static String clip(String value, int max) {
        if (value == null) return "";
        String clean = value.replaceAll("[\\u0000-\\u001f]", "").trim();
        if (clean.length() > max) return clean.substring(0, max);
        return clean;
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static void closeQuiet(ServerSocket socket) {
        if (socket == null) return;
        try {
            socket.close();
        } catch (IOException ignored) {
            // já está fechando
        }
    }

    private static void closeQuiet(Socket socket) {
        if (socket == null) return;
        try {
            socket.close();
        } catch (IOException ignored) {
            // já está fechando
        }
    }

    private static void closeQuiet(DatagramSocket socket) {
        if (socket == null) return;
        socket.close();
    }
}
