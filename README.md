# Hydra BPM Tools
A library for [Hydra](https://hydra.ojack.xyz/) that adds a minimal HUD for visualizing and controlling BPM, beat-synced envelopes, and keyboard shortcuts for live performance.

![Hydra BPM Tools HUD](assets/hud.png)

## Quick Start

Add this line at the beginning of your Hydra sketch:

```js
await loadScript("https://raw.githubusercontent.com/beatmelab/hydra-bpm-tools/main/hydra-bpm-tools.lib.js")
```

That's it. You now have a BPM HUD and beat-synced functions like `beats()`, `beatsTri()`, and more.

## Features

- BPM display
- 4-step beat visualizer
- BPM shortcut control
- Resync shortcut
- Tap tempo
- BPM rate multiplier
- Hush / unhush toggle
- Draggable HUD
- Beat helper functions: `beats`, `beats_`, `beatsTri`, `beatsTri_`, `curve`, `range`

## Shortcuts

- `Ctrl + Shift + ↑` → increase base BPM
- `Ctrl + Shift + ↓` → decrease base BPM
- `Ctrl + Shift + T` → tap tempo
- `Ctrl + Shift + ←` → divide effective BPM by 2
- `Ctrl + Shift + →` → multiply effective BPM by 2
- `Ctrl + Shift + R` → resync
- `Ctrl + Shift + B` → bypass output

## BPM behavior

The HUD displays:

- **Base BPM** as the main value
- **Rate multiplier** in red when active
- **Bypass output** status as a small circle, filled when on and unfilled when off

Examples:

- `[ BPM 120 x2 ● ]` → effective BPM = `240`
- `[ BPM 120 /2 ● ]` → effective BPM = `60`
- `[ BPM 120 ○ ]` → hush active (bypassed output)

## How it works

Hydra BPM Tools stays lightweight and works by interacting with Hydra's exposed global state.

### 1. It rewrites the `bpm` variable

The library controls tempo by writing to the global variable:

```js
window.bpm
```

This means the tempo used by Hydra becomes the value managed by the HUD.

The library keeps two related values:

- **Base BPM** → the main BPM number shown in the HUD
- **Effective BPM** → the actual value written into `window.bpm`

Example:

- HUD shows `BPM 120`
- multiplier is `x4`

Result:

- base BPM = `120`
- effective BPM = `480`

Hydra uses the effective BPM.

### 2. Resync resets Hydra time to `0`

The resync action does not change your sketch code. It resets Hydra’s internal time value.

Depending on the available object, it sets one of these to `0`:

```js
window.hydraSynth.time = 0
window.hydraSynth.synth.time = 0
```

This is useful for:

- Realigning loops
- Restarting time-based motion

### 3. Tempo controls

- `Ctrl + Shift + ↑` / `Ctrl + Shift + ↓`: Increase or decrease the base BPM by 1.

- `Ctrl + Shift + T`: Tap tempo calculates a BPM from repeated taps and updates the **base BPM**, similar to the **TAP** button in Resolume Arena/Avenue.

- `Ctrl + Shift + ←` / `Ctrl + Shift + →`: These shortcuts do not change the displayed base BPM value. Instead, they change the **rate multiplier** applied to the effective BPM sent to Hydra. The multiplier appears in red next to the BPM value.

### 4. Envelopes

The envelope helper API in this section is adapted from [`hydra-tap.js`](https://github.com/geikha/hyper-hydra/blob/main/hydra-tap.js) in `geikha/hyper-hydra`, keeping the original function names where possible for familiarity and compatibility.

- `beats(n=1)`: A linear ramp from 1 down to 0 every n beats
- `beats_(n=1)`: A linear ramp from 0 up to 1 every n beats
- `beatsTri(n=1)`: Goes from 1 to 0 on n beats, and then back to 1 in the same time, creating a triangle wave.
- `beatsTri_(n=1)`: Same as above but inverted.

#### Curve

You can set the curve of a beat envelope by calling `.curve(q)` on it. Positive values will ease in and negative values will ease out. For example, `beats().curve(3)` would be cubic easing in.

#### Range

You can also set the range for an envelope or a curved envelope by calling `.range(min=0, max=1)` on it. For example: `osc().scale(beatsTri(2).curve(2).range(1,2))`.

### 5. Hush / unhush hides the current output

The library uses Hydra's `hush()` behavior as a quick way to blank the current visual output, similar to the global B button (bypass output) in Resolume Arena/Avenue. This is intended as a quick blank / restore control during live visual work.

## Persistence (userscript only)

When using the userscript version:

### When navigating from one Hydra page to another Hydra page

The userscript keeps:

- base BPM
- rate multiplier

### When opening Hydra in a new tab or window from outside Hydra

The userscript resets to the following defaults:

- **BPM:** 120
- **Multiplier:** none
- **Hush:** off

## Installation

### Load in the Hydra editor (recommended)

Add this line at the beginning of your sketch:

```js
await loadScript("https://raw.githubusercontent.com/beatmelab/hydra-bpm-tools/main/hydra-bpm-tools.lib.js")
```

No extensions, no setup — just paste and run.

### Programmatic API

The library exposes `window.hydraBpmTools` for programmatic control:

```js
hydraBpmTools.setBpm(140)       // Set base BPM
hydraBpmTools.getBpm()          // Get current base BPM
hydraBpmTools.getEffectiveBpm() // Get effective BPM (with rate multiplier)
hydraBpmTools.setRate(2)        // Set rate multiplier (x2)
hydraBpmTools.getRate()         // Get current rate multiplier
hydraBpmTools.resync()          // Reset Hydra time to 0
hydraBpmTools.hush()            // Blank output
hydraBpmTools.unhush()          // Restore output
hydraBpmTools.toggleHush()      // Toggle hush state
```

### Alternative: Userscript (auto-load on every visit)

If you want Hydra BPM Tools to load automatically every time you open Hydra, you can install it as a browser userscript.

1. Install a userscript manager like [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)
2. Click the button below to install:

[![Install Hydra BPM Tools](https://img.shields.io/badge/Install-Hydra%20BPM%20Tools-blue)](https://raw.githubusercontent.com/beatmelab/hydra-bpm-tools/main/hydra-bpm-tools.user.js)

The userscript version also persists BPM and rate multiplier when navigating between Hydra pages.

## Notes

Hydra BPM Tools is designed to stay lightweight and interfere with Hydra's native UI as little as possible.

## Author

- [@alt234vj](https://www.instagram.com/alt234vj)
- [@beatmelab](https://www.instagram.com/beatmelab)
- https://www.beatmelab.com


## Attribution

This project includes adapted functionality from [`geikha/hyper-hydra`](https://github.com/geikha/hyper-hydra), including parts of the envelope helper API derived from `hydra-tap.js`.

Original upstream license: GPL-3.0.

## License

GPL-3.0
