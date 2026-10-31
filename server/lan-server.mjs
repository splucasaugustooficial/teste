#!/usr/bin/env node
/**
 * Servidor local para testar a sala no navegador.
 * O primeiro socket vira anfitrião; os demais entram na mesma sala.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "web");
const PORT = Number(process.env.PORT || 42425);
const HTTP_PORT = Number(process.env.HTTP_PORT || 4173);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

function localIp() {
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const n of list || []) {
      if (n.family === "IPv4" && !n.internal) return n.address;
    }
  }
  return "127.0.0.1";
}

const room = {
  hostId: null,
  clients: new Map(),
  info: { name: "Cobra Arena", mode: "contra" },
};

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

const httpServer = http.createServer((req, res) => {
  if (req.url === "/lan/rooms") {
    const rooms = room.hostId
      ? [{ ip: localIp(), port: HTTP_PORT, name: room.info.name, mode: room.info.mode, players: room.clients.size }]
      : [];
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ rooms }));
    return;
  }
  let url = req.url.split("?")[0];
  if (url === "/") url = "/index.html";
  const file = path.normalize(path.join(root, url));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server: httpServer, path: "/lan" });
let seq = 1;

wss.on("connection", (ws) => {
  const id = "c" + seq++;
  const isHost = !room.hostId;
  if (isHost) room.hostId = id;
  room.clients.set(id, ws);
  send(ws, { t: "you", role: isHost ? "host" : "client", id, ip: localIp() });
  if (!isHost && room.hostId) {
    const host = room.clients.get(room.hostId);
    send(host, { t: "client", id });
  }

  ws.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(String(buf));
    } catch (e) {
      return;
    }
    if (id === room.hostId) {
      if (msg.t === "broadcast") {
        for (const [cid, client] of room.clients) {
          if (cid !== id) send(client, msg.msg);
        }
      } else if (msg.t === "to") {
        const dest = room.clients.get(msg.id);
        if (dest) send(dest, msg.msg);
      } else {
        for (const [cid, client] of room.clients) {
          if (cid !== id) send(client, msg);
        }
      }
    } else {
      const host = room.clients.get(room.hostId);
      if (host) send(host, { t: "relay", id, msg });
    }
  });

  ws.on("close", () => {
    room.clients.delete(id);
    if (room.hostId === id) {
      room.hostId = room.clients.keys().next().value || null;
    } else if (room.hostId) {
      const host = room.clients.get(room.hostId);
      if (host) send(host, { t: "disconnect", id });
    }
  });
});

httpServer.listen(HTTP_PORT, "0.0.0.0", () => {
  console.log("Cobra Arena http://localhost:" + HTTP_PORT + "  (LAN " + localIp() + ")");
});
