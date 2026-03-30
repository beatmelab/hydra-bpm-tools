// ==UserScript==
// @name         Hydra autoload libs
// @namespace    https://github.com/beatmelab/hydra-bpm-tools
// @version      1.0
// @description  Auto-load external Hydra libraries
// @author       @alt234vj | @beatmelab | https://www.beatmelab.com
// @license      GPL-3.0-only
// @homepageURL  https://github.com/beatmelab/hydra-bpm-tools
// @supportURL   https://github.com/beatmelab/hydra-bpm-tools/issues
// @downloadURL  none
// @updateURL    none
// @match        https://hydra.ojack.xyz/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(() => {
  const libs = [
    "https://metagrowing.org/extra-shaders-for-hydra/all.js", // doc: https://gitlab.com/metagrowing/extra-shaders-for-hydra
    //"https://another-url.com/lib.js",
  ]

  const s = document.createElement("script")
  s.textContent = `
    ;(async () => {
      while (typeof window.loadScript !== "function") {
        await new Promise(r => setTimeout(r, 50))
      }
      for (const url of ${JSON.stringify(libs)}) {
        await window.loadScript(url)
      }
    })()
  `
  document.documentElement.appendChild(s)
  s.remove()
})()
