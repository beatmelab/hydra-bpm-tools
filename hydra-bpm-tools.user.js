// ==UserScript==
// @name         Hydra BPM Tools
// @namespace    https://github.com/beatmelab/hydra-bpm-tools
// @version      2.0.0
// @description  Adds small HUD with VJ tools (BPM, beat visualizer, resync, tap tempo, rate multiplier and hush toggle).
// @author       @alt234vj | @beatmelab | https://www.beatmelab.com
// @license      GPL-3.0
// @homepageURL  https://github.com/beatmelab/hydra-bpm-tools
// @supportURL   https://github.com/beatmelab/hydra-bpm-tools/issues
// @downloadURL  https://raw.githubusercontent.com/beatmelab/hydra-bpm-tools/main/hydra-bpm-tools.user.js
// @updateURL    https://raw.githubusercontent.com/beatmelab/hydra-bpm-tools/main/hydra-bpm-tools.user.js
// @match        https://hydra.ojack.xyz/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

/*
This userscript includes adapted functionality from `geikha/hyper-hydra`.
Source: https://github.com/geikha/hyper-hydra
Original license: GPL-3.0
*/

(function () {
  "use strict";

  if (window.__hydraBpmToolsInstalled) {
    console.log("[Hydra BPM Tools] already installed");
    return;
  }
  window.__hydraBpmToolsInstalled = true;

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

    hudToggleKey: "KeyJ",
    hudToggleCtrl: true,
    hudToggleShift: true,
    hudToggleAlt: false,
    hudToggleMeta: false,

    hudModeKey: "KeyK",
    hudModeCtrl: true,
    hudModeShift: true,
    hudModeAlt: false,
    hudModeMeta: false,

    hudStorageKey: "hydra-userscript-hud-pos",
    hudVisibleKey: "hydra-userscript-hud-visible",
    hudModeStorageKey: "hydra-userscript-hud-mode",
    sessionBpmKey: "hydra-userscript-session-bpm",
    sessionRateKey: "hydra-userscript-session-rate",

    defaultHudX: 12,
    defaultHudY: 12,
    viewportPadding: 8,

    tapTimeoutMs: 2000,
    tapHistorySize: 6,
    tapApplyAlpha: 0.25,
    tapMaxDeltaBpm: 3
  };

  let hud = null;
  let minimalHud = null;
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Utility functions
  // ─────────────────────────────────────────────────────────────────────────────

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  const ALLOWED_RATES = [1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32];

  function roundRateMultiplier(value) {
    return ALLOWED_RATES.reduce((nearest, candidate) =>
      Math.abs(value - candidate) < Math.abs(value - nearest) ? candidate : nearest
    );
  }

  function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Storage (sessionStorage for BPM/rate, localStorage for HUD position)
  // ─────────────────────────────────────────────────────────────────────────────

  function loadFromStorage(storage, key, parser, validator, fallback) {
    try {
      const raw = storage.getItem(key);
      if (raw !== null) {
        const val = parser(raw);
        if (validator(val)) return val;
      }
    } catch (e) {}
    return fallback;
  }

  function saveToStorage(storage, key, value) {
    try {
      storage.setItem(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    } catch (e) {}
  }

  function loadSessionBpm() {
    return loadFromStorage(
      sessionStorage,
      CONFIG.sessionBpmKey,
      (v) => clamp(Math.round(Number(v)), CONFIG.minBpm, CONFIG.maxBpm),
      Number.isFinite,
      null
    );
  }

  function loadSessionRateMultiplier() {
    return loadFromStorage(
      sessionStorage,
      CONFIG.sessionRateKey,
      (v) => clamp(roundRateMultiplier(Number(v)), CONFIG.minRateMultiplier, CONFIG.maxRateMultiplier),
      Number.isFinite,
      null
    );
  }

  function saveSessionBpm(value = baseBpm) {
    saveToStorage(sessionStorage, CONFIG.sessionBpmKey, clamp(Math.round(value), CONFIG.minBpm, CONFIG.maxBpm));
  }

  function saveSessionRateMultiplier(value = rateMultiplier) {
    saveToStorage(sessionStorage, CONFIG.sessionRateKey, clamp(roundRateMultiplier(value), CONFIG.minRateMultiplier, CONFIG.maxRateMultiplier));
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

  let baseBpm = CONFIG.defaultBpm;
  let rateMultiplier = CONFIG.defaultRateMultiplier;

  function getCodeMirrorInstance() {
    const el = document.querySelector(".CodeMirror");
    return el?.CodeMirror ?? null;
  }

  function getCurrentSketchCode() {
    return getCodeMirrorInstance()?.getValue() ?? "";
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Hydra integration
  // ─────────────────────────────────────────────────────────────────────────────

  function getHydraObj() {
    return window.hydraSynth?.synth ?? window.hydraSynth ?? null;
  }

  function getHydraTime() {
    return window.hydraSynth?.synth?.time ?? window.hydraSynth?.time ?? null;
  }

  function getCurrentBaseBpm() {
    return baseBpm;
  }

  function getCurrentEffectiveBpm() {
    return clamp(Math.round(baseBpm * rateMultiplier), CONFIG.minBpm, CONFIG.maxBpm);
  }

  function getRateBadgeText() {
    if (rateMultiplier === 1) return "";
    return rateMultiplier > 1 ? `x${rateMultiplier}` : `/${1 / rateMultiplier}`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Beat helper API (adapted from `hydra-tap.js` in `geikha/hyper-hydra`)
  // ─────────────────────────────────────────────────────────────────────────────
  
  function getHydraBpmValue() {
    const bpm = Number(window.bpm);
    if (Number.isFinite(bpm) && bpm > 0) return bpm;
    return getCurrentEffectiveBpm();
  }

  function getNormalizedBeatProgress(divisor = 1) {
    const time = getHydraTime();
    const bpm = getHydraBpmValue();

    if (!Number.isFinite(time) || !Number.isFinite(bpm) || bpm <= 0) {
      return 0;
    }

    const beatLength = 60 / bpm;
    const cycleLength = beatLength * divisor;

    if (!Number.isFinite(cycleLength) || cycleLength <= 0) {
      return 0;
    }

    return ((time % cycleLength) + cycleLength) % cycleLength / cycleLength;
  }

  function applyRangeToFunction(fn) {
    fn.range = (min = 0, max = 1) => {
      const ranged = () => fn() * (max - min) + min;
      return applyCurveToFunction(applyRangeToFunction(ranged));
    };
    return fn;
  }

  function applyCurveToFunction(fn) {
    fn.curve = (q = 1) => {
      const curved = () => {
        const value = clamp(fn(), 0, 1);
        return q > 0
          ? Math.pow(value, q)
          : 1 - Math.pow(1 - value, -q);
      };
      return applyRangeToFunction(applyCurveToFunction(curved));
    };
    return fn;
  }

  function createBeatFunction(fn) {
    return applyCurveToFunction(applyRangeToFunction(fn));
  }

  function beatsRampDown(divisor = 1) {
    return getNormalizedBeatProgress(divisor);
  }

  function beatsRampUp(divisor = 1) {
    return 1 - getNormalizedBeatProgress(divisor);
  }

  function beatsTriRampDown(divisor = 1) {
    const progress = getNormalizedBeatProgress(divisor * 2);
    return progress >= 0.5
      ? getNormalizedBeatProgress(divisor)
      : 1 - getNormalizedBeatProgress(divisor);
  }

  function beatsTriRampUp(divisor = 1) {
    const progress = getNormalizedBeatProgress(divisor * 2);
    return progress >= 0.5
      ? 1 - getNormalizedBeatProgress(divisor)
      : getNormalizedBeatProgress(divisor);
  }

  function installBeatHelpers() {
    window.range = (fn) => applyRangeToFunction(fn);
    window.curve = (fn) => applyCurveToFunction(fn);
    window.beats = (n = 1) => createBeatFunction(() => beatsRampDown(n));
    window.beats_ = (n = 1) => createBeatFunction(() => beatsRampUp(n));
    window.beatsTri = (n = 1) => createBeatFunction(() => beatsTriRampDown(n));
    window.beatsTri_ = (n = 1) => createBeatFunction(() => beatsTriRampUp(n));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HUD (position, visibility, rendering)
  // ─────────────────────────────────────────────────────────────────────────────

  const defaultHudPos = null;

  function loadHudPosition() {
    return loadFromStorage(
      localStorage,
      CONFIG.hudStorageKey,
      JSON.parse,
      (p) => typeof p?.x === "number" && typeof p?.y === "number",
      defaultHudPos
    );
  }

  function saveHudPosition(x, y) {
    saveToStorage(localStorage, CONFIG.hudStorageKey, { x, y });
  }

  function isHudVisible() {
    return loadFromStorage(localStorage, CONFIG.hudVisibleKey, (v) => v, (v) => v !== null, "true") === "true";
  }

  function applyHudVisibility() {
    const visible = isHudVisible();
    if (isMinimalMode()) {
      if (minimalHud) minimalHud.style.display = visible ? "" : "none";
      return;
    }
    if (!hud) return;
    hud.style.opacity = visible ? "1" : "0";
    hud.style.pointerEvents = visible ? "auto" : "none";
    hud.style.visibility = visible ? "visible" : "hidden";
  }

  function isMinimalMode() {
    return loadFromStorage(localStorage, CONFIG.hudModeStorageKey,
      (v) => v, (v) => v !== null, "false") === "true";
  }

  function saveHudMode(minimal) {
    saveToStorage(localStorage, CONFIG.hudModeStorageKey, minimal ? "true" : "false");
  }

  function ensureMinimalHud() {
    if (minimalHud && document.contains(minimalHud)) return minimalHud;
    minimalHud = document.createElement("div");
    minimalHud.id = "hydra-bpm-minimal";
    minimalHud.style.position = "fixed";
    minimalHud.style.bottom = "5px";
    minimalHud.style.right = "20px";
    minimalHud.style.fontFamily = "monospace";
    minimalHud.style.fontSize = "14px";
    minimalHud.style.color = "#aaaaaa";
    minimalHud.style.pointerEvents = "none";
    minimalHud.style.zIndex = "6";
    minimalHud.style.userSelect = "none";
    minimalHud.textContent = String(getCurrentBaseBpm());
    (document.body || document.documentElement).appendChild(minimalHud);
    return minimalHud;
  }

  function applyHudMode() {
    const minimal = isMinimalMode();
    const visible = isHudVisible();
    if (minimal) {
      if (hud) {
        hud.style.opacity = "0";
        hud.style.pointerEvents = "none";
        hud.style.visibility = "hidden";
      }
      const mhud = ensureMinimalHud();
      mhud.style.display = visible ? "" : "none";
      mhud.textContent = String(getCurrentBaseBpm());
    } else {
      if (minimalHud) minimalHud.style.display = "none";
      applyHudVisibility();
    }
  }

  function toggleHudMode() {
    const wasMinimal = isMinimalMode();
    saveHudMode(!wasMinimal);
    if (!wasMinimal) {
      ensureMinimalHud();
    } else {
      ensureHud();
    }
    applyHudMode();
    console.log("[Hydra userscript] HUD mode =", !wasMinimal ? "minimal" : "normal");
  }

  function toggleHudVisibility() {
    const visible = isHudVisible();
    saveToStorage(localStorage, CONFIG.hudVisibleKey, !visible ? "true" : "false");
    applyHudVisibility();
    console.log("[Hydra userscript] HUD", !visible ? "shown" : "hidden");
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
      applyHudMode();
      keepHudInBounds();
      return hud;
    }

    const pos = loadHudPosition();

    hud = document.createElement("div");
    hud.id = "hydra-bpm-hud";
    hud.style.position = "fixed";
    hud.style.left = pos ? `${pos.x}px` : "-9999px";
    hud.style.top = pos ? `${pos.y}px` : "-9999px";
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

    if (!pos) {
      const pad = CONFIG.viewportPadding;
      const x = Math.max(pad, window.innerWidth - hud.offsetWidth - pad);
      const y = Math.max(pad, window.innerHeight - hud.offsetHeight - pad);
      hud.style.left = `${x}px`;
      hud.style.top = `${y}px`;
      saveHudPosition(x, y);
    }

    makeHudDraggable(hud);
    applyHudMode();
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

    if (minimalHud) minimalHud.textContent = String(getCurrentBaseBpm());
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

    if (intervals.length < 2) return;

    const candidateInterval = median(intervals);
    if (!candidateInterval || candidateInterval <= 0) return;

    const candidateBpm = 60000 / candidateInterval;
    const currentBpm = getCurrentBaseBpm();

    const maxInterval = Math.max(...intervals);
    const minInterval = Math.min(...intervals);
    const spreadMs = maxInterval - minInterval;
    const consistent = spreadMs < 60;

    const difference = Math.abs(candidateBpm - currentBpm);

    if (consistent && intervals.length >= 3 && difference >= 8) {
      setBaseBpm(candidateBpm);
      return;
    }

    const smoothedBpm =
      currentBpm + (candidateBpm - currentBpm) * CONFIG.tapApplyAlpha;

    const delta = clamp(
      smoothedBpm - currentBpm,
      -CONFIG.tapMaxDeltaBpm,
      CONFIG.tapMaxDeltaBpm
    );

    setBaseBpm(currentBpm + delta);
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
    const clockwiseOrder = [1, 3, 2, 0];
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

    // Border pulse on first beat of every 16-beat cycle (stays for full beat)
    const isFirstBeatOf16 = beatIndex % 16 === 0;
    beatWrap.style.boxShadow = isFirstBeatOf16
      ? "0 0 0 1px rgba(255,255,255,0.95), 0 0 12px rgba(255,255,255,0.8)"
      : "none";
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
      // Don't clear if we're on first beat of 16-beat cycle
      if (beatWrap && lastBeatIndex % 16 !== 0) {
        beatWrap.style.boxShadow = "none";
      }
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Hush / Unhush
  // ─────────────────────────────────────────────────────────────────────────────

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
    const hushFn = getHydraObj()?.hush ?? window.hush;
    if (typeof hushFn === "function") {
      hushFn();
      return true;
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
    void (isHushed ? unhushNow() : hushNow());
  }

  function resync() {
    const target = window.hydraSynth?.synth ?? window.hydraSynth;
    if (!target) {
      console.warn("[Hydra userscript] Hydra instance not found");
      return;
    }
    target.time = 0;
    flashBeatVisualizer();
    lastBeatIndex = -1;
    console.log("[Hydra userscript] time = 0");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Keyboard shortcuts
  // ─────────────────────────────────────────────────────────────────────────────

  function matchShortcut(e, key, ctrl = false, shift = false, alt = false, meta = false) {
    return e.code === key && e.ctrlKey === ctrl && e.shiftKey === shift && e.altKey === alt && e.metaKey === meta;
  }

  function isCtrlShift(e, code) {
    return matchShortcut(e, code, true, true, false, false);
  }

  function handleShortcut(e, action) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
    action();
  }

  function onKeyDown(e) {
    forceInitialBpmOnce();

    // Ctrl+Shift+Enter: run sketch (clear hush state)
    if (isCtrlShift(e, "Enter")) {
      setHushed(false);
      return;
    }

    // Ctrl+Shift+T: tap tempo
    if (matchShortcut(e, CONFIG.tapKey, CONFIG.tapCtrl, CONFIG.tapShift, CONFIG.tapAlt, CONFIG.tapMeta)) {
      return handleShortcut(e, registerTapTempo);
    }

    // Ctrl+Shift+J: toggle HUD visibility
    if (matchShortcut(e, CONFIG.hudToggleKey, CONFIG.hudToggleCtrl, CONFIG.hudToggleShift, CONFIG.hudToggleAlt, CONFIG.hudToggleMeta)) {
      return handleShortcut(e, toggleHudVisibility);
    }

    // Ctrl+Shift+K: toggle HUD mode (normal / minimal)
    if (matchShortcut(e, CONFIG.hudModeKey, CONFIG.hudModeCtrl, CONFIG.hudModeShift, CONFIG.hudModeAlt, CONFIG.hudModeMeta)) {
      return handleShortcut(e, toggleHudMode);
    }

    // Ctrl+Shift+B: toggle hush
    if (matchShortcut(e, CONFIG.hushKey, CONFIG.hushCtrl, CONFIG.hushShift, CONFIG.hushAlt, CONFIG.hushMeta)) {
      return handleShortcut(e, toggleHush);
    }

    // Ctrl+Shift+R: resync
    if (matchShortcut(e, CONFIG.resyncKey, CONFIG.resyncCtrl, CONFIG.resyncShift, CONFIG.resyncAlt, CONFIG.resyncMeta)) {
      return handleShortcut(e, resync);
    }

    // Ctrl+Shift+Arrows: BPM and rate control
    if (isCtrlShift(e, "ArrowLeft")) return handleShortcut(e, halveRateMultiplier);
    if (isCtrlShift(e, "ArrowRight")) return handleShortcut(e, doubleRateMultiplier);
    if (isCtrlShift(e, "ArrowUp")) return handleShortcut(e, () => setBaseBpm(baseBpm + CONFIG.bpmStep));
    if (isCtrlShift(e, "ArrowDown")) return handleShortcut(e, () => setBaseBpm(baseBpm - CONFIG.bpmStep));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Initialization
  // ─────────────────────────────────────────────────────────────────────────────

  function waitForHydraThenInitBpm() {
    let tries = 0;
    const timer = setInterval(() => {
      if (++tries >= 200 || initialBpmApplied) {
        clearInterval(timer);
        return;
      }
      forceInitialBpmOnce();
    }, 100);
  }

  function install() {
    installBeatHelpers();
    ensureHud();
    renderHud();
    applyHudMode();
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
