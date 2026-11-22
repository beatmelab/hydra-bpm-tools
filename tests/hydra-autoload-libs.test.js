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

test("autoload example library is pinned", () => {
  const injectedSource = getInjectedSource();

  assert.doesNotThrow(() => new vm.Script(injectedSource));
  assert.match(
    injectedSource,
    /extra-shaders-for-hydra@a0a2898b2a4048ae78b671a006f1fbd64c92a9ee\/lib\/all\.js/
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

test("a failed library is reported and later libraries still load in order", async () => {
  const libs = [
    { url: "https://example.test/first.js" },
    { url: "https://example.test/second.js" }
  ];
  const source = getInjectedSource().replace(/const libs = .*\n/, `const libs = ${JSON.stringify(libs)}\n`);
  const loaded = [];
  const errors = [];
  const window = { loadScript() {}, addEventListener() {}, removeEventListener() {} };
  const document = {
    createElement() {
      const listeners = new Map();
      return {
        addEventListener(type, listener) { listeners.set(type, listener); },
        removeEventListener(type) { listeners.delete(type); },
        remove() {},
        dispatch(type) { listeners.get(type)(); }
      };
    },
    head: {
      appendChild(script) {
        loaded.push(script.src);
        script.dispatch(loaded.length === 1 ? "error" : "load");
      }
    }
  };

  await vm.runInNewContext(source, {
    AbortController, Date, Promise, document, window,
    console: { error(_prefix, error) { errors.push(error.message); } },
    setTimeout() { return 1; }, clearTimeout() {}
  });

  assert.deepEqual(loaded, libs.map((lib) => lib.url));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /first\.js/);
});

test("a configured library loads without requiring CORS", async () => {
  const source = getInjectedSource().replace(/const libs = .*\n/, 'const libs = [{"url":"https://example.test/library.js"}]\n');
  let appendedScript;
  const window = { loadScript() {}, addEventListener() {}, removeEventListener() {} };
  const document = {
    createElement() {
      const listeners = new Map();
      return {
        addEventListener(type, listener) { listeners.set(type, listener); },
        removeEventListener(type) { listeners.delete(type); },
        dispatch(type) { listeners.get(type)(); }
      };
    },
    head: { appendChild(script) { appendedScript = script; script.dispatch("load"); } }
  };
  await vm.runInNewContext(source, {
    AbortController, Date, Promise, document, window, console,
    setTimeout() { return 1; }, clearTimeout() {}
  });
  assert.equal(appendedScript.src, "https://example.test/library.js");
  assert.equal(appendedScript.crossOrigin, undefined);
});
