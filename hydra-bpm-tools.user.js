// ==UserScript==
// @name         Hydra BPM tools
// @namespace    https://hydra.ojack.xyz/
// @version      1.6
// @description  Adds small HUD with VJ tools (BPM, beat visualizer, resync, hush toggle, tap tempo, rate multiplier). Shortcuts: ctrl+shift+R = resync // ctrl+shift+B = hush/unhush // ctrl+shift+T = tap tempo // ctrl+shift+arrowup/arrowdown = change base bpm // ctrl+shift+arrowleft/arrowright = halve/double effective bpm
// @match        https://hydra.ojack.xyz/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  const CONFIG = {
    defaultBpm: 120,
    defaultRateMultiplier: 1,
    bpmStep: 1,
    minBpm: 1,
    maxBpm: 999,

    minRateMultiplier: 1 / 32,
    maxRateMultiplier: 32,

    resyncKey: "KeyR",
    resyncCtrl: true,
    resyncShift: true,
    resyncAlt: false,
    resyncMeta: false,

    hushKey: "KeyB",
    hushCtrl: true,
    hushShift: true,
    hushAlt: false,
    hushMeta: false,

    tapKey: "KeyT",
    tapCtrl: true,
    tapShift: true,
    tapAlt: false,
    tapMeta: false,

    hudStorageKey: "hydra-userscript-hud-pos",
    hudVisibleKey: "hydra-userscript-hud-visible",
    sessionBpmKey: "hydra-userscript-session-bpm",
    sessionRateKey: "hydra-userscript-session-rate",

    defaultHudX: 12,
    defaultHudY: 12,
    viewportPadding: 8,

    tapTimeoutMs: 2000,
    tapHistorySize: 6
  };

  let hud = null;
  let bpmWrap = null;
  let bpmEl = null;
  let rateBadgeEl = null;
  let hushButton = null;
  let beatWrap = null;
  let beatCells = [];
  let initialBpmApplied = false;
  let lastBeatIndex = -1;
  let flashTimeout = null;
  let isHushed = false;
  let beatLoopStarted = false;
  let tapTimes = [];

  let baseBpm = CONFIG.defaultBpm;
  let rateMultiplier = CONFIG.defaultRateMultiplier;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function roundRateMultiplier(value) {
    const allowed = [1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32];
    let nearest = allowed[0];
    let minDiff = Math.abs(value - nearest);

    for (const candidate of allowed) {
      const diff = Math.abs(value - candidate);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = candidate;
      }
    }

    return nearest;
  }

  function cameFromHydraPage() {
    try {
      if (!document.referrer) return false;
      const ref = new URL(document.referrer);
      return ref.origin === window.location.origin && ref.hostname === "hydra.ojack.xyz";
    } catch (e) {
      return false;
    }
  }

  function initializeSessionState() {
    if (cameFromHydraPage()) {
      baseBpm = loadSessionBpm() ?? CONFIG.defaultBpm;
      rateMultiplier = loadSessionRateMultiplier() ?? CONFIG.defaultRateMultiplier;
    } else {
      baseBpm = CONFIG.defaultBpm;
      rateMultiplier = CONFIG.defaultRateMultiplier;
      saveSessionBpm(baseBpm);
      saveSessionRateMultiplier(rateMultiplier);
    }
  }

  function getCodeMirrorInstance() {
    const el = document.querySelector(".CodeMirror");
    return el && el.CodeMirror ? el.CodeMirror : null;
  }

  function getCurrentSketchCode() {
    const cm = getCodeMirrorInstance();
    return cm ? cm.getValue() : "";
  }

  function getHydraObj() {
    if (window.hydraSynth?.synth) return window.hydraSynth.synth;
    if (window.hydraSynth) return window.hydraSynth;
    return null;
  }

  function getHydraTime() {
    if (window.hydraSynth?.synth?.time !== undefined) return window.hydraSynth.synth.time;
    if (window.hydraSynth?.time !== undefined) return window.hydraSynth.time;
    return null;
  }

  function loadSessionBpm() {
    try {
      const raw = sessionStorage.getItem(CONFIG.sessionBpmKey);
      const value = Number(raw);
      if (Number.isFinite(value)) {
        return clamp(Math.round(value), CONFIG.minBpm, CONFIG.maxBpm);
      }
    } catch (e) {}
    return null;
  }

  function saveSessionBpm(value = baseBpm) {
    try {
      const next = clamp(Math.round(Number(value)), CONFIG.minBpm, CONFIG.maxBpm);
      sessionStorage.setItem(CONFIG.sessionBpmKey, String(next));
    } catch (e) {}
  }

  function loadSessionRateMultiplier() {
    try {
      const raw = sessionStorage.getItem(CONFIG.sessionRateKey);
      const value = Number(raw);
      if (Number.isFinite(value)) {
        return clamp(
          roundRateMultiplier(value),
          CONFIG.minRateMultiplier,
          CONFIG.maxRateMultiplier
        );
      }
    } catch (e) {}
    return null;
  }

  function saveSessionRateMultiplier(value = rateMultiplier) {
    try {
      const next = clamp(
        roundRateMultiplier(Number(value)),
        CONFIG.minRateMultiplier,
        CONFIG.maxRateMultiplier
      );
      sessionStorage.setItem(CONFIG.sessionRateKey, String(next));
    } catch (e) {}
  }

  function getCurrentBaseBpm() {
    return baseBpm;
  }

  function getCurrentEffectiveBpm() {
    return clamp(
      Math.round(baseBpm * rateMultiplier),
      CONFIG.minBpm,
      CONFIG.maxBpm
    );
  }

  function getRateBadgeText() {
    if (rateMultiplier === 1) return "";

    if (rateMultiplier > 1) {
      return `x${rateMultiplier}`;
    }

    return `/${1 / rateMultiplier}`;
  }

  function loadHudPosition() {
    try {
      const raw = localStorage.getItem(CONFIG.hudStorageKey);
      if (!raw) return { x: CONFIG.defaultHudX, y: CONFIG.defaultHudY };
      const parsed = JSON.parse(raw);
      if (typeof parsed.x === "number" && typeof parsed.y === "number") {
        return parsed;
      }
    } catch (e) {}
    return { x: CONFIG.defaultHudX, y: CONFIG.defaultHudY };
  }

  function saveHudPosition(x, y) {
    localStorage.setItem(CONFIG.hudStorageKey, JSON.stringify({ x, y }));
  }

  function isHudVisible() {
    const raw = localStorage.getItem(CONFIG.hudVisibleKey);
    if (raw === null) return true;
    return raw === "true";
  }

  function applyHudVisibility() {
    if (!hud) return;
    hud.style.display = isHudVisible() ? "flex" : "none";
  }

  function applyHushButtonState() {
    if (!hushButton) return;

    hushButton.style.opacity = isHushed ? "0.92" : "1";
    hushButton.style.color = isHushed ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.86)";

    hushButton.innerHTML = isHushed
      ? `
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" stroke-width="1.3"/>
        </svg>
      `
      : `
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="7" cy="7" r="4.2" fill="currentColor"/>
        </svg>
      `;
  }

  function keepHudInBounds() {
    if (!hud || !document.contains(hud)) return;
    if (!isHudVisible()) return;

    const pad = CONFIG.viewportPadding;
    const maxX = Math.max(pad, window.innerWidth - hud.offsetWidth - pad);
    const maxY = Math.max(pad, window.innerHeight - hud.offsetHeight - pad);

    const currentX = hud.offsetLeft;
    const currentY = hud.offsetTop;

    const nextX = clamp(currentX, pad, maxX);
    const nextY = clamp(currentY, pad, maxY);

    if (nextX !== currentX || nextY !== currentY) {
      hud.style.left = `${nextX}px`;
      hud.style.top = `${nextY}px`;
      saveHudPosition(nextX, nextY);
    }
  }

  function ensureHud() {
    if (hud && document.contains(hud)) {
      applyHudVisibility();
      keepHudInBounds();
      return hud;
    }

    const pos = loadHudPosition();

    hud = document.createElement("div");
    hud.id = "hydra-bpm-hud";
    hud.style.position = "fixed";
    hud.style.left = `${pos.x}px`;
    hud.style.top = `${pos.y}px`;
    hud.style.zIndex = "2147483647";
    hud.style.display = "flex";
    hud.style.alignItems = "center";
    hud.style.gap = "8px";
    hud.style.padding = "6px 8px";
    hud.style.background = "rgba(0,0,0,0.9)";
    hud.style.color = "#fff";
    hud.style.fontFamily = "monospace";
    hud.style.fontSize = "13px";
    hud.style.lineHeight = "1";
    hud.style.border = "1px solid rgba(255,255,255,0.18)";
    hud.style.borderRadius = "8px";
    hud.style.boxShadow = "0 6px 18px rgba(0,0,0,0.35)";
    hud.style.userSelect = "none";
    hud.style.pointerEvents = "auto";
    hud.style.cursor = "move";

    beatWrap = document.createElement("div");
    beatWrap.style.width = "20px";
    beatWrap.style.height = "20px";
    beatWrap.style.display = "grid";
    beatWrap.style.gridTemplateColumns = "1fr 1fr";
    beatWrap.style.gridTemplateRows = "1fr 1fr";
    beatWrap.style.gap = "1px";
    beatWrap.style.padding = "1px";
    beatWrap.style.border = "1px solid rgba(255,255,255,0.55)";
    beatWrap.style.borderRadius = "2px";
    beatWrap.style.background = "rgba(255,255,255,0.03)";
    beatWrap.style.boxSizing = "border-box";
    beatWrap.style.flex = "0 0 auto";

    beatCells = [];
    for (let i = 0; i < 4; i++) {
      const cell = document.createElement("div");
      cell.style.background = "rgba(255,255,255,0.12)";
      cell.style.transition = "background 80ms linear, opacity 80ms linear";
      cell.style.opacity = "0.45";
      beatWrap.appendChild(cell);
      beatCells.push(cell);
    }

    bpmWrap = document.createElement("div");
    bpmWrap.style.display = "flex";
    bpmWrap.style.alignItems = "center";
    bpmWrap.style.gap = "6px";
    bpmWrap.style.minWidth = "72px";
    bpmWrap.style.whiteSpace = "nowrap";

    bpmEl = document.createElement("div");
    bpmEl.style.fontWeight = "bold";
    bpmEl.textContent = `BPM ${getCurrentBaseBpm()}`;

    rateBadgeEl = document.createElement("div");
    rateBadgeEl.style.display = "none";
    rateBadgeEl.style.fontFamily = "monospace";
    rateBadgeEl.style.fontSize = "13px";
    rateBadgeEl.style.fontWeight = "bold";
    rateBadgeEl.style.lineHeight = "1";
    rateBadgeEl.style.color = "rgb(255, 0, 0)";
    rateBadgeEl.style.background = "transparent";
    rateBadgeEl.style.border = "none";
    rateBadgeEl.style.padding = "0";
    rateBadgeEl.style.margin = "0";
    rateBadgeEl.textContent = "";

    bpmWrap.appendChild(bpmEl);
    bpmWrap.appendChild(rateBadgeEl);

    hushButton = document.createElement("button");
    hushButton.type = "button";
    hushButton.title = "Hush / Unhush";
    hushButton.setAttribute("aria-label", "Hush / Unhush");
    hushButton.style.width = "18px";
    hushButton.style.height = "18px";
    hushButton.style.padding = "0";
    hushButton.style.display = "flex";
    hushButton.style.alignItems = "center";
    hushButton.style.justifyContent = "center";
    hushButton.style.border = "none";
    hushButton.style.outline = "none";
    hushButton.style.background = "transparent";
    hushButton.style.boxShadow = "none";
    hushButton.style.cursor = "pointer";
    hushButton.style.pointerEvents = "auto";
    hushButton.style.flex = "0 0 auto";
    hushButton.style.color = "rgba(255,255,255,0.86)";
    hushButton.style.appearance = "none";
    hushButton.style.webkitAppearance = "none";

    hushButton.addEventListener("mouseenter", () => {
      hushButton.style.color = "rgba(255,255,255,0.98)";
    });

    hushButton.addEventListener("mouseleave", () => {
      applyHushButtonState();
    });

    hushButton.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleHush();
    });

    hud.appendChild(beatWrap);
    hud.appendChild(bpmWrap);
    hud.appendChild(hushButton);

    const appendTarget = document.body || document.documentElement;
    appendTarget.appendChild(hud);

    makeHudDraggable(hud);
    applyHudVisibility();
    applyHushButtonState();
    renderHud();
    keepHudInBounds();

    return hud;
  }

  function makeHudDraggable(panel) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let panelX = 0;
    let panelY = 0;

    panel.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;

      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      panelX = panel.offsetLeft;
      panelY = panel.offsetTop;
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;

      const pad = CONFIG.viewportPadding;
      const nextX = clamp(
        panelX + (e.clientX - startX),
        pad,
        Math.max(pad, window.innerWidth - panel.offsetWidth - pad)
      );
      const nextY = clamp(
        panelY + (e.clientY - startY),
        pad,
        Math.max(pad, window.innerHeight - panel.offsetHeight - pad)
      );

      panel.style.left = `${nextX}px`;
      panel.style.top = `${nextY}px`;
    });

    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      keepHudInBounds();
      saveHudPosition(panel.offsetLeft, panel.offsetTop);
    });
  }

  function applyEffectiveBpm() {
    window.bpm = getCurrentEffectiveBpm();
  }

  function renderHud() {
    ensureHud();

    bpmEl.textContent = `BPM ${getCurrentBaseBpm()}`;

    const badgeText = getRateBadgeText();
    if (badgeText) {
      rateBadgeEl.textContent = badgeText;
      rateBadgeEl.style.display = "block";
    } else {
      rateBadgeEl.textContent = "";
      rateBadgeEl.style.display = "none";
    }
  }

  function flashBpmText() {
    if (!bpmWrap) return;

    bpmWrap.animate(
      [
        { opacity: 1, transform: "scale(1)", textShadow: "0 0 0 rgba(255,255,255,0)" },
        { opacity: 1, transform: "scale(1.06)", textShadow: "0 0 8px rgba(255,255,255,0.95)" },
        { opacity: 1, transform: "scale(1)", textShadow: "0 0 0 rgba(255,255,255,0)" }
      ],
      {
        duration: 140,
        easing: "ease-out"
      }
    );
  }

  function setBaseBpm(value) {
    baseBpm = clamp(Math.round(value), CONFIG.minBpm, CONFIG.maxBpm);
    applyEffectiveBpm();
    saveSessionBpm(baseBpm);
    renderHud();
    console.log("[Hydra userscript] bpm base =", baseBpm, "| effective =", window.bpm);
  }

  function setRateMultiplier(value) {
    rateMultiplier = clamp(
      roundRateMultiplier(value),
      CONFIG.minRateMultiplier,
      CONFIG.maxRateMultiplier
    );
    applyEffectiveBpm();
    saveSessionRateMultiplier(rateMultiplier);
    renderHud();
    flashBpmText();
    console.log("[Hydra userscript] rate =", rateMultiplier, "| effective =", window.bpm);
  }

  function halveRateMultiplier() {
    setRateMultiplier(rateMultiplier / 2);
  }

  function doubleRateMultiplier() {
    setRateMultiplier(rateMultiplier * 2);
  }

  function registerTapTempo() {
    const now = performance.now();
    const lastTap = tapTimes[tapTimes.length - 1];

    if (lastTap && now - lastTap > CONFIG.tapTimeoutMs) {
      tapTimes = [];
    }

    tapTimes.push(now);

    if (tapTimes.length > CONFIG.tapHistorySize) {
      tapTimes.shift();
    }

    flashBpmText();

    if (tapTimes.length < 2) return;

    const intervals = [];
    for (let i = 1; i < tapTimes.length; i++) {
      intervals.push(tapTimes[i] - tapTimes[i - 1]);
    }

    if (!intervals.length) return;

    const averageInterval = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    if (averageInterval <= 0) return;

    const tappedBpm = 60000 / averageInterval;
    setBaseBpm(tappedBpm);
  }

  function renderBeatVisualizer() {
    ensureHud();

    const bpm = getCurrentEffectiveBpm();
    const t = getHydraTime();

    if (t === null || !Number.isFinite(t) || bpm <= 0) {
      beatCells.forEach((cell) => {
        cell.style.background = "rgba(255,255,255,0.12)";
        cell.style.opacity = "0.45";
      });
      return;
    }

    const totalBeats = (t * bpm) / 60;
    const beatIndex = Math.floor(totalBeats);
    const clockwiseOrder = [0, 1, 3, 2];
    const activeIndex = clockwiseOrder[((beatIndex % 4) + 4) % 4];

    beatCells.forEach((cell, i) => {
      const active = i === activeIndex;
      cell.style.background = active ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.12)";
      cell.style.opacity = active ? "1" : "0.45";
    });

    if (beatIndex !== lastBeatIndex) {
      lastBeatIndex = beatIndex;
      beatWrap.animate(
        [
          { transform: "scale(1)" },
          { transform: "scale(1.05)" },
          { transform: "scale(1)" }
        ],
        { duration: 110, easing: "ease-out" }
      );
    }
  }

  function startBeatLoop() {
    if (beatLoopStarted) return;
    beatLoopStarted = true;

    const tick = () => {
      renderBeatVisualizer();
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }

  function flashBeatVisualizer() {
    if (!beatWrap) return;

    beatWrap.style.boxShadow = "0 0 0 2px rgba(255,255,255,0.95), 0 0 10px rgba(255,255,255,0.85)";
    clearTimeout(flashTimeout);
    flashTimeout = setTimeout(() => {
      if (beatWrap) beatWrap.style.boxShadow = "none";
    }, 180);
  }

  function forceInitialBpmOnce() {
    if (initialBpmApplied) return;

    if (window.hydraSynth || typeof window.bpm === "number") {
      initializeSessionState();
      applyEffectiveBpm();
      saveSessionBpm(baseBpm);
      saveSessionRateMultiplier(rateMultiplier);
      initialBpmApplied = true;
      renderHud();
      console.log("[Hydra userscript] initial bpm base =", baseBpm, "| rate =", rateMultiplier, "| effective =", window.bpm);
    }
  }

  function setHushed(value) {
    isHushed = !!value;
    applyHushButtonState();
  }

  async function evaluateCurrentSketch() {
    const code = getCurrentSketchCode();
    if (!code.trim()) return;

    try {
      await window.eval(`(async () => {\n${code}\n})()`);
    } catch (err) {
      console.error("[Hydra userscript] eval error", err);
    }
  }

  function callHush() {
    try {
      const hydra = getHydraObj();
      if (hydra && typeof hydra.hush === "function") {
        hydra.hush();
        return true;
      }
      if (typeof window.hush === "function") {
        window.hush();
        return true;
      }
    } catch (err) {
      console.error("[Hydra userscript] hush error", err);
    }
    return false;
  }

  async function hushNow() {
    setHushed(true);
    await evaluateCurrentSketch();
    callHush();
  }

  async function unhushNow() {
    setHushed(false);
    await evaluateCurrentSketch();
  }

  function toggleHush() {
    if (isHushed) {
      void unhushNow();
    } else {
      void hushNow();
    }
  }

  function resync() {
    try {
      if (window.hydraSynth?.synth) {
        window.hydraSynth.synth.time = 0;
        flashBeatVisualizer();
        lastBeatIndex = -1;
        console.log("[Hydra userscript] hydraSynth.synth.time = 0");
        return;
      }

      if (window.hydraSynth) {
        window.hydraSynth.time = 0;
        flashBeatVisualizer();
        lastBeatIndex = -1;
        console.log("[Hydra userscript] hydraSynth.time = 0");
        return;
      }

      console.warn("[Hydra userscript] Hydra instance not found");
    } catch (err) {
      console.error("[Hydra userscript] resync error", err);
    }
  }

  function matchShortcut(e, cfgKey, cfgCtrl, cfgShift, cfgAlt, cfgMeta) {
    return (
      e.code === cfgKey &&
      e.ctrlKey === cfgCtrl &&
      e.shiftKey === cfgShift &&
      e.altKey === cfgAlt &&
      e.metaKey === cfgMeta
    );
  }

  function isResyncShortcut(e) {
    return matchShortcut(
      e,
      CONFIG.resyncKey,
      CONFIG.resyncCtrl,
      CONFIG.resyncShift,
      CONFIG.resyncAlt,
      CONFIG.resyncMeta
    );
  }

  function isHushShortcut(e) {
    return matchShortcut(
      e,
      CONFIG.hushKey,
      CONFIG.hushCtrl,
      CONFIG.hushShift,
      CONFIG.hushAlt,
      CONFIG.hushMeta
    );
  }

  function isTapShortcut(e) {
    return matchShortcut(
      e,
      CONFIG.tapKey,
      CONFIG.tapCtrl,
      CONFIG.tapShift,
      CONFIG.tapAlt,
      CONFIG.tapMeta
    );
  }

  function isRunShortcut(e) {
    return e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === "Enter";
  }

  function isBpmUpShortcut(e) {
    return e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === "ArrowUp";
  }

  function isBpmDownShortcut(e) {
    return e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === "ArrowDown";
  }

  function isRateDownShortcut(e) {
    return e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === "ArrowLeft";
  }

  function isRateUpShortcut(e) {
    return e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === "ArrowRight";
  }

  function onKeyDown(e) {
    forceInitialBpmOnce();

    if (isRunShortcut(e)) {
      setHushed(false);
      return;
    }

    if (isTapShortcut(e)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      registerTapTempo();
      return;
    }

    if (isHushShortcut(e)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      toggleHush();
      return;
    }

    if (isResyncShortcut(e)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      resync();
      return;
    }

    if (isRateDownShortcut(e)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      halveRateMultiplier();
      return;
    }

    if (isRateUpShortcut(e)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      doubleRateMultiplier();
      return;
    }

    if (isBpmUpShortcut(e)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      setBaseBpm(getCurrentBaseBpm() + CONFIG.bpmStep);
      return;
    }

    if (isBpmDownShortcut(e)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      setBaseBpm(getCurrentBaseBpm() - CONFIG.bpmStep);
    }
  }

  function waitForHydraThenInitBpm() {
    const maxTries = 200;
    let tries = 0;

    const timer = setInterval(() => {
      tries += 1;
      forceInitialBpmOnce();

      if (initialBpmApplied || tries >= maxTries) {
        clearInterval(timer);
      }
    }, 100);
  }

  function install() {
    ensureHud();
    renderHud();
    applyHudVisibility();
    applyHushButtonState();
    keepHudInBounds();

    startBeatLoop();
    waitForHydraThenInitBpm();

    window.addEventListener("keydown", onKeyDown, true);

    window.addEventListener("beforeunload", () => {
      saveSessionBpm(baseBpm);
      saveSessionRateMultiplier(rateMultiplier);
    });

    window.addEventListener("pagehide", () => {
      saveSessionBpm(baseBpm);
      saveSessionRateMultiplier(rateMultiplier);
    });

    window.addEventListener("resize", () => {
      keepHudInBounds();
    });

    console.log("[Hydra userscript] installed");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();