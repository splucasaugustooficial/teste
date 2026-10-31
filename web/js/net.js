/**
 * Rede local: o primeiro aparelho vira anfitrião.
 * Android expõe CobraNative (TCP JSON por linha + UDP).
 * No PC, o server/lan-server.mjs faz o mesmo papel via WebSocket.
 */
(function (root) {
  "use strict";

  const PORT = 42425;
  const listeners = new Map();

  function emit(type, payload) {
    const fns = listeners.get(type);
    if (fns) fns.forEach((fn) => fn(payload));
  }

  function on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    return () => listeners.get(type).delete(fn);
  }

  function parseMaybe(raw) {
    if (raw == null) return null;
    if (typeof raw === "object") return raw;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function hasNative() {
    return !!(root.CobraNative && typeof root.CobraNative.startHost === "function");
  }

  function nativeCall(name, arg) {
    const n = root.CobraNative;
    if (!n || typeof n[name] !== "function") return null;
    try {
      return n[name](typeof arg === "undefined" ? "" : String(arg));
    } catch (e) {
      return null;
    }
  }

  const session = {
    role: "local",
    ip: "",
    hostIp: "",
    port: PORT,
    room: null,
    connected: false,
    ws: null,
  };

  root.CobraBridge = {
    onClient: function (id) {
      emit("client", { id: String(id) });
    },
    onMessage: function (id, json) {
      const msg = parseMaybe(json);
      if (msg) emit("message", { id: String(id), msg });
    },
    onDisconnect: function (id) {
      emit("disconnect", { id: String(id) });
    },
    onDiscovery: function (payload) {
      const msg = parseMaybe(payload) || payload;
      emit("discovery", msg);
    },
    onStatus: function (payload) {
      emit("status", parseMaybe(payload) || payload);
    },
  };

  function scanNative(ms) {
    return new Promise((resolve) => {
      const found = [];
      const off = on("discovery", (room) => {
        if (room && (room.ip || room.host)) found.push(room);
      });
      nativeCall("scanHosts", String(ms || 1400));
      setTimeout(() => {
        off();
        resolve(found);
      }, (ms || 1400) + 80);
    });
  }

  function startNativeHost(info) {
    const raw = nativeCall("startHost", JSON.stringify(info || {}));
    const parsed = parseMaybe(raw) || {};
    session.role = "host";
    session.ip = parsed.ip || parsed.localIp || "";
    session.hostIp = session.ip;
    session.port = parsed.port || PORT;
    session.connected = true;
    return session;
  }

  function joinNative(ip, port) {
    const raw = nativeCall("joinHost", JSON.stringify({ ip, port: port || PORT }));
    const parsed = parseMaybe(raw) || {};
    session.role = "client";
    session.hostIp = ip;
    session.ip = parsed.ip || "";
    session.port = port || PORT;
    session.connected = parsed.ok !== false;
    return session;
  }

  function sendNative(json, peerId) {
    if (peerId) nativeCall("sendTo", JSON.stringify({ id: peerId, body: json }));
    else if (session.role === "host") nativeCall("sendToAll", typeof json === "string" ? json : JSON.stringify(json));
    else nativeCall("send", typeof json === "string" ? json : JSON.stringify(json));
  }

  function stopNative() {
    nativeCall("stop");
    session.role = "local";
    session.connected = false;
  }

  function queryParam(name) {
    try {
      return new URLSearchParams(location.search).get(name);
    } catch (e) {
      return null;
    }
  }

  function wsUrl(host, port) {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return proto + "//" + host + ":" + (port || PORT);
  }

  function connectWs(url, asHostHint) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url);
      session.ws = ws;
      ws.onopen = function () {
        session.connected = true;
        session.role = asHostHint || "client";
        settled = true;
        resolve(session);
      };
      ws.onmessage = function (ev) {
        const msg = parseMaybe(ev.data);
        if (!msg) return;
        if (msg.t === "relay" && msg.msg) emit("message", { id: String(msg.id || "peer"), msg: msg.msg });
        else if (msg.t === "client") emit("client", { id: String(msg.id) });
        else if (msg.t === "disconnect") emit("disconnect", { id: String(msg.id) });
        else if (msg.t === "you") {
          session.role = msg.role;
          session.ip = msg.ip || session.ip;
          session.peerId = msg.id;
          emit("you", msg);
        } else emit("message", { id: msg.from || "host", msg });
      };
      ws.onerror = function () {
        if (!settled) {
          settled = true;
          reject(new Error("ws"));
        }
      };
      ws.onclose = function () {
        session.connected = false;
        emit("closed", {});
      };
    });
  }

  function sendWs(json, peerId) {
    if (!session.ws || session.ws.readyState !== 1) return;
    if (session.role === "host" && peerId) {
      session.ws.send(JSON.stringify({ t: "to", id: peerId, msg: json }));
    } else if (session.role === "host") {
      session.ws.send(JSON.stringify({ t: "broadcast", msg: json }));
    } else {
      session.ws.send(typeof json === "string" ? json : JSON.stringify(json));
    }
  }

  async function scanHttp(ms) {
    const host = location.hostname;
    if (!host || host === "file") return [];
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), ms || 900);
      const res = await fetch("/lan/rooms", { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return [];
      const data = await res.json();
      return data.rooms || [];
    } catch (e) {
      return [];
    }
  }

  async function becomeOrJoin(info) {
    session.room = info;
    if (hasNative()) {
      const rooms = await scanNative(info.scanMs || 1400);
      if (rooms.length) {
        const room = rooms[0];
        joinNative(room.ip || room.host, room.port || PORT);
        return { role: "client", room, ip: session.ip, hostIp: session.hostIp };
      }
      startNativeHost({
        name: info.name,
        mode: info.mode,
      });
      return { role: "host", room: info, ip: session.ip, hostIp: session.hostIp };
    }

    const forceHost = queryParam("host") === "1";
    const joinIp = queryParam("join");
    if (joinIp) {
      await connectWs(wsUrl(joinIp, PORT), "client");
      return { role: "client", ip: session.ip, hostIp: joinIp };
    }
    const rooms = await scanHttp(700);
    if (!forceHost && rooms.length) {
      const room = rooms[0];
      await connectWs(wsUrl(room.ip || location.hostname, room.port || PORT), "client");
      return { role: "client", room, ip: session.ip, hostIp: room.ip || location.hostname };
    }
    try {
      await connectWs((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/lan", "host");
      return { role: session.role || "host", ip: session.ip, hostIp: location.hostname };
    } catch (e) {
      session.role = "local";
      session.connected = false;
      return { role: "offline", error: "no-lan" };
    }
  }

  function send(json, peerId) {
    if (hasNative()) sendNative(json, peerId);
    else sendWs(json, peerId);
  }

  function stop() {
    if (hasNative()) stopNative();
    if (session.ws) {
      try {
        session.ws.close();
      } catch (e) {}
      session.ws = null;
    }
    session.role = "local";
    session.connected = false;
  }

  function localIp() {
    if (hasNative()) return nativeCall("getLocalIp") || session.ip;
    return session.ip || location.hostname || "";
  }

  root.CobraNet = {
    PORT,
    on,
    becomeOrJoin,
    send,
    stop,
    session,
    hasNative,
    localIp,
    emit,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
