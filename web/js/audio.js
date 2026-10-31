(function (root) {
  "use strict";

  function createAudio() {
    let ctx = null;
    let muted = false;

    function ac() {
      if (!ctx) {
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        ctx = new C();
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }

    function beep(freq, dur, type, gain) {
      if (muted) return;
      const c = ac();
      if (!c) return;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || "square";
      o.frequency.value = freq;
      g.gain.value = gain == null ? 0.05 : gain;
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start();
      o.stop(c.currentTime + dur);
    }

    return {
      unlock() {
        ac();
      },
      eat() {
        beep(620, 0.07, "square", 0.04);
      },
      kill() {
        beep(180, 0.18, "sawtooth", 0.06);
        setTimeout(() => beep(320, 0.1, "square", 0.04), 70);
      },
      die() {
        beep(110, 0.28, "triangle", 0.07);
      },
      start() {
        beep(440, 0.08, "square", 0.05);
        setTimeout(() => beep(660, 0.1, "square", 0.05), 90);
      },
      win() {
        beep(523, 0.12, "square", 0.05);
        setTimeout(() => beep(659, 0.12, "square", 0.05), 110);
        setTimeout(() => beep(784, 0.18, "square", 0.05), 220);
      },
      toggle() {
        muted = !muted;
        return muted;
      },
      get muted() {
        return muted;
      },
    };
  }

  root.CobraAudio = { createAudio };
})(typeof globalThis !== "undefined" ? globalThis : this);
