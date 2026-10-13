"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const userscriptSource = fs.readFileSync(
  path.join(__dirname, "..", "extras", "hydra-autoload-libs.user.js"),
  "utf8"
);

function getInjectedSource() {
  let injectedSource = null;
  const script = {
    textContent: "",
    remove() {}
  };
  const document = {
    createElement(tagName) {
      assert.equal(tagName, "script");
      return script;
    },
    documentElement: {
      appendChild(element) {
        injectedSource = element.textContent;
      }
    }
  };

  vm.runInNewContext(userscriptSource, { document }, {
    filename: "hydra-autoload-libs.user.js"
  });

  assert.ok(injectedSource);
  return injectedSource;
}

test("autoload userscript is limited to the Hydra editor", () => {
  assert.match(userscriptSource, /@match\s+https:\/\/hydra\.ojack\.xyz\/$/m);
  assert.match(userscriptSource, /@exclude\s+https:\/\/hydra\.ojack\.xyz\/docs\/\*$/m);
  assert.doesNotMatch(userscriptSource, /@match\s+https:\/\/hydra\.ojack\.xyz\/\*$/m);
});

test("autoload library is pinned and protected by SRI", () => {
  const injectedSource = getInjectedSource();

  assert.doesNotThrow(() => new vm.Script(injectedSource));
  assert.match(
    injectedSource,
    /extra-shaders-for-hydra@a0a2898b2a4048ae78b671a006f1fbd64c92a9ee\/lib\/all\.js/
  );
  assert.match(
    injectedSource,
    /sha384-v7omXa4zRjQoJx15yVcvOJxH\+xDd0T7y6Ni\/ZDwXCS7PIVGh4OqZ4g\+2AbXxIMJR/
  );
});

test("autoload wait stops after its deadline", async () => {
  const injectedSource = getInjectedSource();
  let now = 0;
  let timerCalls = 0;
  let loggedError = null;

  class FakeDate extends Date {
    static now() {
      return now;
    }
  }

  const window = {
    addEventListener() {},
    removeEventListener() {}
  };
  const result = vm.runInNewContext(injectedSource, {
    AbortController,
    Date: FakeDate,
    Promise,
    clearTimeout() {},
    console: {
      error(_prefix, error) {
        loggedError = error;
      }
    },
    document: {
      createElement() {
        throw new Error("library loading must not start before Hydra is ready");
      }
    },
    queueMicrotask,
    setTimeout(callback, delayMs) {
      timerCalls += 1;
      now += delayMs;
      queueMicrotask(callback);
      return timerCalls;
    },
    window
  });

  await result;

  assert.ok(loggedError);
  assert.match(loggedError.message, /Timed out waiting for Hydra/);
  assert.ok(timerCalls > 1 && timerCalls < 100);
});

test("autoload applies integrity metadata to the external script", async () => {
  const injectedSource = getInjectedSource();
  const listeners = new Map();
  let appendedScript = null;
  let loggedError = null;
  const externalScript = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    remove() {}
  };
  const window = {
    loadScript() {},
    addEventListener() {},
    removeEventListener() {}
  };
  const result = vm.runInNewContext(injectedSource, {
    AbortController,
    Date,
    Promise,
    clearTimeout() {},
    console: {
      error(_prefix, error) {
        loggedError = error;
      }
    },
    document: {
      createElement(tagName) {
        assert.equal(tagName, "script");
        return externalScript;
      },
      head: {
        appendChild(script) {
          appendedScript = script;
          const onLoad = listeners.get("load");
          assert.ok(onLoad);
          onLoad();
        }
      }
    },
    setTimeout() {
      return 1;
    },
    window
  });

  await result;

  assert.equal(loggedError, null);
  assert.equal(appendedScript.crossOrigin, "anonymous");
  assert.equal(appendedScript.referrerPolicy, "no-referrer");
  assert.match(appendedScript.integrity, /^sha384-/);
  assert.match(appendedScript.src, /@a0a2898b2a4048ae78b671a006f1fbd64c92a9ee\//);
});
