// ==UserScript==
// @name         Hydra BPM Tools
// @namespace    https://github.com/beatmelab/hydra-bpm-tools
// @version      2.2.0
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

(function () {
  "use strict";
  if (window.__hydraBpmToolsInstalled) {
    console.log("[Hydra BPM Tools] already installed");
    return;
  }
  window.__hydraBpmToolsMode = "userscript";
  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/gh/beatmelab/hydra-bpm-tools@v2.2.0/hydra-bpm-tools.lib.js";
  document.head.appendChild(script);
})();
