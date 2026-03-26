// ==UserScript==
// @name         Hydra Editor Width 50%
// @namespace    https://github.com/beatmelab/hydra-bpm-tools
// @version      1.0
// @description  Forces Hydra code area to 50% of the window width, helping prevent code from overlapping o1 and o3.
// @author       @alt234vj | @beatmelab | https://www.beatmelab.com
// @license      MIT
// @homepageURL  https://github.com/beatmelab/hydra-bpm-tools
// @supportURL   https://github.com/beatmelab/hydra-bpm-tools/issues
// @downloadURL  https://raw.githubusercontent.com/beatmelab/hydra-bpm-tools/main/extras/hydra-editor-width-50.user.js
// @updateURL    https://raw.githubusercontent.com/beatmelab/hydra-bpm-tools/main/extras/hydra-editor-width-50.user.js
// @match        https://hydra.ojack.xyz/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const style = document.createElement('style');
  style.textContent = `
    .CodeMirror-code {
      width: 50% !important;
      min-width: 50% !important;
      max-width: 50% !important;
    }
  `;
  document.head.appendChild(style);
})();