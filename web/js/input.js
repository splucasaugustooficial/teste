(function (root) {
  "use strict";

  function createStick(el) {
    const knob = el.querySelector(".knob");
    const state = { active: false, x: 0, y: 0, dir: 0, mag: 0, pointer: null };
    const max = 46;

    function setKnob(dx, dy) {
      knob.style.transform = "translate(" + dx + "px," + dy + "px)";
    }

    function updateFrom(clientX, clientY) {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const mag = Math.hypot(dx, dy);
      if (mag > max) {
        dx = (dx / mag) * max;
        dy = (dy / mag) * max;
      }
      state.x = dx;
      state.y = dy;
      state.mag = Math.min(1, mag / max);
      if (state.mag > 0.12) state.dir = Math.atan2(dy, dx);
      setKnob(dx, dy);
    }

    function onDown(e) {
      e.preventDefault();
      state.active = true;
      state.pointer = e.pointerId;
      el.setPointerCapture(e.pointerId);
      updateFrom(e.clientX, e.clientY);
    }
    function onMove(e) {
      if (!state.active || e.pointerId !== state.pointer) return;
      updateFrom(e.clientX, e.clientY);
    }
    function onUp(e) {
      if (e.pointerId !== state.pointer) return;
      state.active = false;
      state.mag = 0;
      state.x = 0;
      state.y = 0;
      setKnob(0, 0);
    }

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);

    return state;
  }

  function createBoost(el) {
    const state = { on: false };
    const down = (e) => {
      e.preventDefault();
      state.on = true;
      el.classList.add("hot");
    };
    const up = () => {
      state.on = false;
      el.classList.remove("hot");
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", up);
    return state;
  }

  function createKeyboard() {
    const keys = new Set();
    window.addEventListener("keydown", (e) => {
      keys.add(e.key.toLowerCase());
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
    return {
      p1() {
        let x = 0;
        let y = 0;
        if (keys.has("a") || keys.has("arrowleft")) x -= 1;
        if (keys.has("d") || keys.has("arrowright")) x += 1;
        if (keys.has("w") || keys.has("arrowup")) y -= 1;
        if (keys.has("s") || keys.has("arrowdown")) y += 1;
        const boost = keys.has(" ") || keys.has("shift");
        if (!x && !y) return { dir: null, boost, mag: 0 };
        return { dir: Math.atan2(y, x), boost, mag: 1 };
      },
      p2() {
        let x = 0;
        let y = 0;
        if (keys.has("j") || keys.has("4")) x -= 1;
        if (keys.has("l") || keys.has("6")) x += 1;
        if (keys.has("i") || keys.has("8")) y -= 1;
        if (keys.has("k") || keys.has("5")) y += 1;
        const boost = keys.has(";") || keys.has("enter") || keys.has("0");
        if (!x && !y) return { dir: null, boost, mag: 0 };
        return { dir: Math.atan2(y, x), boost, mag: 1 };
      },
    };
  }

  function merge(stick, boost, kb) {
    const dir = stick.mag > 0.12 ? stick.dir : kb.dir;
    return { dir, boost: boost.on || kb.boost, active: stick.mag > 0.12 || kb.mag > 0 };
  }

  root.CobraInput = { createStick, createBoost, createKeyboard, merge };
})(typeof globalThis !== "undefined" ? globalThis : this);
