"use strict";

(function () {
  var ctx = null;
  var lastEat = 0;

  function unlock() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") ctx.resume();
  }

  function tone(freq, dur, type, gainValue) {
    if (api.muted || !ctx) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    gain.gain.value = gainValue;
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  var api = {
    muted: false,
    unlock: unlock,
    eat: function () {
      var now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (now - lastEat < 70) return;
      lastEat = now;
      tone(680, 0.06, "sine", 0.045);
    },
    die: function () {
      tone(140, 0.28, "triangle", 0.05);
    },
    win: function () {
      tone(523, 0.12, "sine", 0.05);
      setTimeout(function () { tone(659, 0.14, "sine", 0.05); }, 90);
      setTimeout(function () { tone(784, 0.18, "sine", 0.05); }, 180);
    },
  };

  window.SnakeAudio = api;
})();
