"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const librarySource = fs.readFileSync(
  path.join(__dirname, "..", "hydra-bpm-tools.lib.js"),
  "utf8"
);

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.style = {};
    this.listeners = new Map();
    this.parentNode = null;
    this.textContent = "";
    this.innerHTML = "";
    this.offsetWidth = 150;
    this.offsetHeight = 32;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  animate() {
    return { cancel() {} };
  }

  closest(selector) {
    return selector === "button" && this.tagName === "BUTTON" ? this : null;
  }

  get offsetLeft() {
    return Number.parseFloat(this.style.left) || 0;
  }

  get offsetTop() {
    return Number.parseFloat(this.style.top) || 0;
  }
}

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

function createHarness(options = {}) {
  let nowMs = 0;
  const body = new FakeElement("body");
  const codeMirror = options.evaluate
    ? { CodeMirror: { getValue: () => "testSketch()" } }
    : null;
  const document = {
    body,
    documentElement: body,
    referrer: options.referrer || "",
    createElement: (tagName) => new FakeElement(tagName),
    contains: (element) => element === body || element.parentNode === body,
    querySelector: (selector) => selector === ".CodeMirror" ? codeMirror : null
  };
  const windowListeners = new Map();
  const localStorage = createStorage();
  const hydra = {
    bpm: 120,
    time: 0,
    hush: options.hush || (() => {})
  };
  const silentConsole = {
    log() {},
    warn() {},
    error() {}
  };
  const window = {
    innerWidth: 1280,
    innerHeight: 720,
    bpm: 120,
    hydraSynth: { synth: hydra },
    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) || [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    },
    dispatchEvent(event) {
      for (const listener of windowListeners.get(event.type) || []) listener(event);
    },
    eval: options.evaluate || (() => Promise.resolve())
  };
  window.window = window;

  const context = {
    URL,
    clearInterval() {},
    clearTimeout() {},
    console: silentConsole,
    document,
    localStorage,
    performance: { now: () => nowMs },
    requestAnimationFrame() {},
    setInterval(callback) {
      callback();
      return 1;
    },
    setTimeout() {
      return 1;
    },
    window
  };

  vm.runInNewContext(librarySource, context, { filename: "hydra-bpm-tools.lib.js" });

  return {
    body,
    hydra,
    window,
    setNow(value) {
      nowMs = value;
    }
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function dispatchKeyDown(window, code, options = {}) {
  const event = {
    type: "keydown",
    code,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    repeat: false,
    defaultPrevented: false,
    propagationStopped: false,
    immediatePropagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
    stopImmediatePropagation() {
      this.immediatePropagationStopped = true;
    },
    ...options
  };
  window.dispatchEvent(event);
  return event;
}

function dispatchCtrlShiftEnter(window) {
  return dispatchKeyDown(window, "Enter", { ctrlKey: true, shiftKey: true });
}

async function flushMicrotasksUntil(predicate) {
  for (let attempt = 0; attempt < 20 && !predicate(); attempt += 1) {
    await Promise.resolve();
  }
  assert.ok(predicate(), "expected asynchronous operation did not start");
}

{
  for (const code of ["Space", "KeyT"]) {
    test(`Ctrl+Shift+${code} taps tempo and consumes the shortcut`, () => {
      const { window, setNow } = createHarness();

      for (const now of [1000, 2000, 3000, 4000]) {
        setNow(now);
        const event = dispatchKeyDown(window, code, { ctrlKey: true, shiftKey: true });
        assert.equal(event.defaultPrevented, true);
        assert.equal(event.propagationStopped, true);
        assert.equal(event.immediatePropagationStopped, true);
      }

      assert.equal(window.hydraBpmTools.getBpm(), 60);
      assert.equal(window.hydraBpmTools.getEffectiveBpm(), 60);
    });
  }

  test(`Space and T share one tap sequence`, () => {
    const { window, setNow } = createHarness();

    for (const [index, code] of ["Space", "KeyT", "Space", "KeyT"].entries()) {
      setNow(1000 + index * 1000);
      dispatchKeyDown(window, code, { ctrlKey: true, shiftKey: true });
    }

    assert.equal(window.hydraBpmTools.getBpm(), 60);
  });
}

for (const code of ["Space", "KeyT"]) {
  test(`holding Ctrl+Shift+${code} consumes repeats without adding taps`, () => {
    const { window, setNow } = createHarness();

    setNow(1000);
    dispatchKeyDown(window, code, { ctrlKey: true, shiftKey: true });

    for (const now of [1200, 1400, 1600, 1800]) {
      setNow(now);
      const event = dispatchKeyDown(window, code, {
        ctrlKey: true,
        shiftKey: true,
        repeat: true
      });
      assert.equal(event.defaultPrevented, true);
      assert.equal(event.propagationStopped, true);
      assert.equal(event.immediatePropagationStopped, true);
    }

    assert.equal(window.hydraBpmTools.getBpm(), 120);

    for (const now of [2000, 3000, 4000]) {
      setNow(now);
      dispatchKeyDown(window, code, { ctrlKey: true, shiftKey: true });
    }

    assert.equal(window.hydraBpmTools.getBpm(), 60);
  });
}

test("Space requires exactly Ctrl+Shift and leaves other combinations untouched", () => {
  const { window, setNow } = createHarness();
  let nowMs = 1000;

  for (const ctrlKey of [false, true]) {
    for (const shiftKey of [false, true]) {
      for (const altKey of [false, true]) {
        for (const metaKey of [false, true]) {
          if (ctrlKey && shiftKey && !altKey && !metaKey) continue;

          for (let tap = 0; tap < 4; tap += 1) {
            setNow(nowMs);
            nowMs += 1000;
            const event = dispatchKeyDown(window, "Space", {
              ctrlKey, shiftKey, altKey, metaKey
            });
            assert.equal(event.defaultPrevented, false);
            assert.equal(event.propagationStopped, false);
            assert.equal(event.immediatePropagationStopped, false);
          }

          assert.equal(window.hydraBpmTools.getBpm(), 120);
        }
      }
    }
  }
});

test("beats ramps down while beats_ ramps up over a beat", () => {
  const { hydra, window } = createHarness();
  const down = window.beats();
  const up = window.beats_();

  hydra.time = 0;
  assert.equal(down(), 1);
  assert.equal(up(), 0);

  hydra.time = 0.125;
  assert.equal(down(), 0.75);
  assert.equal(up(), 0.25);

  hydra.time = 0.375;
  assert.equal(down(), 0.25);
  assert.equal(up(), 0.75);
});

test("beatsTri follows the documented down-up triangle and beatsTri_ is inverted", () => {
  const { hydra, window } = createHarness();
  window.hydraBpmTools.setBpm(60);
  const downUp = window.beatsTri();
  const upDown = window.beatsTri_();

  hydra.time = 0;
  assert.equal(downUp(), 1);
  assert.equal(upDown(), 0);

  hydra.time = 0.5;
  assert.equal(downUp(), 0.5);
  assert.equal(upDown(), 0.5);

  hydra.time = 1;
  assert.equal(downUp(), 0);
  assert.equal(upDown(), 1);

  hydra.time = 1.5;
  assert.equal(downUp(), 0.5);
  assert.equal(upDown(), 0.5);

  hydra.time = 2;
  assert.equal(downUp(), 1);
  assert.equal(upDown(), 0);
});

test("setBpm and setRate accept finite numeric strings", () => {
  const { hydra, window } = createHarness();

  window.hydraBpmTools.setBpm("140");
  window.hydraBpmTools.setRate("0.5");

  assert.equal(window.hydraBpmTools.getBpm(), 140);
  assert.equal(window.hydraBpmTools.getRate(), 0.5);
  assert.equal(window.hydraBpmTools.getEffectiveBpm(), 70);
  assert.equal(window.bpm, 70);
  assert.equal(hydra.bpm, 70);
});

test("setBpm and setRate reject invalid values without throwing or mutating state", () => {
  const { hydra, window } = createHarness();
  const invalidValues = [
    "not-a-number",
    "",
    "   ",
    NaN,
    Infinity,
    -Infinity,
    null,
    true,
    false,
    undefined,
    Symbol("invalid")
  ];

  window.hydraBpmTools.setBpm(140);
  window.hydraBpmTools.setRate(0.5);

  for (const value of invalidValues) {
    assert.doesNotThrow(() => window.hydraBpmTools.setBpm(value));
    assert.doesNotThrow(() => window.hydraBpmTools.setRate(value));
  }

  assert.equal(window.hydraBpmTools.getBpm(), 140);
  assert.equal(window.hydraBpmTools.getRate(), 0.5);
  assert.equal(window.hydraBpmTools.getEffectiveBpm(), 70);
  assert.equal(window.bpm, 70);
  assert.equal(hydra.bpm, 70);
});

test("hush blanks immediately and unhush restores through evaluation", async () => {
  let evaluationCalls = 0;
  let hushCalls = 0;
  let outputActive = true;
  const { body, window } = createHarness({
    evaluate: () => {
      evaluationCalls += 1;
      outputActive = true;
      return Promise.resolve();
    },
    hush: () => {
      hushCalls += 1;
      outputActive = false;
    }
  });
  const hushButton = body.children[0].children.find((element) => element.tagName === "BUTTON");

  await window.hydraBpmTools.hush();

  assert.equal(evaluationCalls, 0);
  assert.equal(hushCalls, 1);
  assert.equal(outputActive, false);
  assert.match(hushButton.innerHTML, /<circle[^>]+fill="none"/);

  await window.hydraBpmTools.unhush();

  assert.equal(evaluationCalls, 1);
  assert.equal(outputActive, true);
  assert.match(hushButton.innerHTML, /<circle[^>]+fill="currentColor"/);
});

test("a late obsolete unhush is reconciled to a newer hush", async () => {
  const delayedEvaluation = deferred();
  let evaluationCalls = 0;
  let hushCalls = 0;
  let outputActive = true;
  const { body, window } = createHarness({
    evaluate: () => {
      evaluationCalls += 1;
      return delayedEvaluation.promise.then(() => {
        outputActive = true;
      });
    },
    hush: () => {
      hushCalls += 1;
      outputActive = false;
    }
  });
  const hushButton = body.children[0].children.find((element) => element.tagName === "BUTTON");

  await window.hydraBpmTools.hush();
  const obsoleteUnhush = window.hydraBpmTools.unhush();
  await flushMicrotasksUntil(() => evaluationCalls === 1);
  await window.hydraBpmTools.hush();

  delayedEvaluation.resolve();
  await obsoleteUnhush;
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(evaluationCalls, 1);
  assert.equal(hushCalls, 3);
  assert.equal(outputActive, false);
  assert.match(hushButton.innerHTML, /<circle[^>]+fill="none"/);
});

test("a stale effect during the current unhush triggers a final reconciliation", async () => {
  const obsoleteEvaluation = deferred();
  const currentEvaluation = deferred();
  let evaluationCalls = 0;
  let outputActive = true;
  const { window } = createHarness({
    evaluate: () => {
      evaluationCalls += 1;
      if (evaluationCalls === 1) {
        return obsoleteEvaluation.promise.then(() => {
          outputActive = false;
        });
      }
      if (evaluationCalls === 2) {
        outputActive = true;
        return currentEvaluation.promise;
      }
      outputActive = true;
      return Promise.resolve();
    }
  });

  const obsoleteUnhush = window.hydraBpmTools.unhush();
  const currentUnhush = window.hydraBpmTools.unhush();
  await flushMicrotasksUntil(() => evaluationCalls === 2);

  obsoleteEvaluation.resolve();
  await obsoleteUnhush;
  assert.equal(outputActive, false);

  currentEvaluation.resolve();
  await currentUnhush;
  await flushMicrotasksUntil(() => evaluationCalls === 3);
  await Promise.resolve();

  assert.equal(outputActive, true);
});

test("a hung obsolete evaluation does not block a newer hush operation", async () => {
  const hungEvaluation = deferred();
  let evaluationCalls = 0;
  let hushCalls = 0;
  let outputActive = true;
  const { window } = createHarness({
    evaluate: () => {
      evaluationCalls += 1;
      return hungEvaluation.promise;
    },
    hush: () => {
      hushCalls += 1;
      outputActive = false;
    }
  });

  await window.hydraBpmTools.hush();
  void window.hydraBpmTools.unhush();
  await flushMicrotasksUntil(() => evaluationCalls === 1);
  await window.hydraBpmTools.hush();

  assert.equal(evaluationCalls, 1);
  assert.equal(hushCalls, 2);
  assert.equal(outputActive, false);
});

test("a failed sketch restore keeps the tool in the hushed state", async () => {
  let shouldReject = false;
  let hushCalls = 0;
  const { body, window } = createHarness({
    evaluate: () => shouldReject
      ? Promise.reject(new Error("invalid sketch"))
      : Promise.resolve(),
    hush: () => { hushCalls += 1; }
  });
  const hushButton = body.children[0].children.find((element) => element.tagName === "BUTTON");

  await window.hydraBpmTools.hush();
  shouldReject = true;
  await window.hydraBpmTools.unhush();

  assert.equal(hushCalls, 2);
  assert.match(hushButton.innerHTML, /<circle[^>]+fill="none"/);
});

test("an empty editor cannot report a successful unhush", async () => {
  let hushCalls = 0;
  const { body, window } = createHarness({
    hush: () => { hushCalls += 1; }
  });
  const hushButton = body.children[0].children.find((element) => element.tagName === "BUTTON");

  await window.hydraBpmTools.hush();
  await window.hydraBpmTools.unhush();

  assert.equal(hushCalls, 2);
  assert.match(hushButton.innerHTML, /<circle[^>]+fill="none"/);
});

test("running the sketch supersedes and reconciles a pending unhush", async () => {
  const delayedEvaluation = deferred();
  let evaluationCalls = 0;
  let hushCalls = 0;
  let outputActive = true;
  const { body, window } = createHarness({
    evaluate: () => {
      evaluationCalls += 1;
      if (evaluationCalls === 1) {
        return delayedEvaluation.promise.then(() => {
          outputActive = false;
        });
      }
      outputActive = true;
      return Promise.resolve();
    },
    hush: () => {
      hushCalls += 1;
      outputActive = false;
    }
  });
  const hushButton = body.children[0].children.find((element) => element.tagName === "BUTTON");

  await window.hydraBpmTools.hush();
  const obsoleteUnhush = window.hydraBpmTools.unhush();
  await flushMicrotasksUntil(() => evaluationCalls === 1);
  dispatchCtrlShiftEnter(window);
  outputActive = true;

  delayedEvaluation.resolve();
  await obsoleteUnhush;
  await flushMicrotasksUntil(() => evaluationCalls === 2);
  await Promise.resolve();

  assert.equal(hushCalls, 1);
  assert.equal(outputActive, true);
  assert.match(hushButton.innerHTML, /<circle[^>]+fill="currentColor"/);
});

test("two rapid toggleHush calls alternate the pending intent", async () => {
  const evaluation = deferred();
  let evaluationCalls = 0;
  let hushCalls = 0;
  let outputActive = true;
  const { window } = createHarness({
    evaluate: () => {
      evaluationCalls += 1;
      return evaluation.promise.then(() => {
        outputActive = true;
      });
    },
    hush: () => {
      hushCalls += 1;
      outputActive = false;
    }
  });

  window.hydraBpmTools.toggleHush();
  window.hydraBpmTools.toggleHush();
  await flushMicrotasksUntil(() => evaluationCalls === 1);
  evaluation.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(evaluationCalls, 1);
  assert.equal(hushCalls, 1);
  assert.equal(outputActive, true);
});
