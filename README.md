# Hydra BPM Tools

Tempo control for [Hydra](https://hydra.ojack.xyz/), closer to how BPM is handled in VJ software: tap tempo, resync, BPM nudging, a draggable HUD, and beat-synced helpers.

![Hydra BPM Tools HUD](assets/hud.png)

## Quick Start

Paste this at the top of the Hydra editor:

```js
await loadScript("https://link.beatmelab.com/hydra-bpm-tools")
```

You get:

- A draggable BPM HUD
- Tap tempo and resync controls
- BPM nudging and rate multipliers
- Hush control for blanking output and clearing persistent feedback
- Beat-synced helper functions for modulation
- An optional userscript for automatic loading◊

<details>
<summary>Direct jsDelivr URL</summary>

```js
await loadScript("https://cdn.jsdelivr.net/gh/beatmelab/hydra-bpm-tools@v2.0.0/hydra-bpm-tools.lib.js")
```
</details>

## Why Use It

Hydra does not provide direct BPM controls out of the box. You can set `bpm` manually, but that is awkward during rehearsal or performance.

- Tap tempo when you need to match external music or video quickly
- Resync beat-driven modulation when the tempo is right but phase has drifted
- Nudge BPM live without stopping the patch
- Use the same BPM for both transport control and patch modulation

## Features

- Draggable BPM HUD that stays visible while you work
- Tap tempo for fast matching
- Resync to restart beat-driven motion from a clean point
- Keyboard shortcuts for tempo, rate, hush, and HUD visibility
- Hush toggle for blanking output while keeping timing state
- Beat-synced helpers like `beats()` and `beatsTri()`
- Rate multipliers for fast half-time and double-time changes
- Userscript support for automatic loading in the Hydra editor

## Shortcuts

All shortcuts use `Ctrl+Shift` plus one additional key.

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+T` | Tap tempo |
| `Ctrl+Shift+R` | Resync |
| `Ctrl+Shift+↑/↓` | Adjust BPM |
| `Ctrl+Shift+←/→` | Halve or double the rate multiplier |
| `Ctrl+Shift+B` | Toggle `hush()` |
| `Ctrl+Shift+Enter` | Run sketch and clear hush state |
| `Ctrl+Shift+J` | Toggle HUD visibility |

## Beat Envelopes

These helpers return values that move with the current BPM, so they can drive Hydra parameters like `scale()`, `rotate()`, or `color()` with beat-synced motion.

```js
beats(n)      // Ramp 1->0 over n beats
beats_(n)     // Ramp 0->1 over n beats
beatsTri(n)   // Triangle wave 1->0->1 over n beats
beatsTri_(n)  // Triangle wave 0->1->0 over n beats
```

- `.curve(q)` changes the response curve without changing BPM sync.
- `.range(min, max)` remaps the normalized output to the interval your patch needs.

Example:

```js
osc().scale(beatsTri(2).curve(2).range(1, 2))
```

## How it works internally

Under the hood, Hydra BPM Tools updates Hydra’s internal BPM value and resyncs beat-based motion by resetting Hydra’s internal time variable.

## Programmatic API

The same controls are available from code through `window.hydraBpmTools`:

```js
hydraBpmTools.setBpm(140)
hydraBpmTools.getBpm()
hydraBpmTools.getEffectiveBpm()
hydraBpmTools.setRate(2)
hydraBpmTools.getRate()
hydraBpmTools.resync()
hydraBpmTools.toggleHudVisibility()
hydraBpmTools.hush()
hydraBpmTools.unhush()
hydraBpmTools.toggleHush()
```

## Userscript

If you want the tool available every time the Hydra editor opens, you can install it as a userscript. With a userscript manager, the library loads automatically whenever the Hydra editor opens.

1. Install a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Open the install URL below and let your userscript manager handle the installation.

[![Install](https://img.shields.io/badge/Install-Hydra%20BPM%20Tools-blue)](https://raw.githubusercontent.com/beatmelab/hydra-bpm-tools/main/hydra-bpm-tools.user.js)

For screenshots and a more visual overview, see the landing page:
[beatmelab.com/hydra-bpm-tools](https://beatmelab.com/hydra-bpm-tools/)

## Attribution

The envelope API is adapted from [`geikha/hyper-hydra`](https://github.com/geikha/hyper-hydra).

## Author

[@alt234vj](https://www.instagram.com/alt234vj) · [@beatmelab](https://www.instagram.com/beatmelab) · [beatmelab.com](https://www.beatmelab.com)

## License

GPL-3.0
