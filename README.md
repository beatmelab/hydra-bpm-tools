# Hydra BPM Tools
A userscript for [Hydra](https://hydra.ojack.xyz/) that adds a minimal HUD for visualizing and controlling BPM.

![Hydra BPM Tools HUD](assets/hud.png)

## Features

- BPM display
- 4-step beat visualizer
- BPM shortcut control
- Resync shortcut
- Tap tempo
- BPM rate multiplier
- Hush / unhush toggle
- Draggable HUD

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

## How the plugin works

This userscript stays lightweight and works by interacting with Hydra’s exposed global state.

### 1. It rewrites the `bpm` variable

The script controls tempo by writing to the global variable:

```js
window.bpm
```

This means the tempo used by Hydra becomes the value managed by the HUD.

The script keeps two related values:

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

### 3. Hush / unhush hides the current output

The script uses Hydra’s `hush()` behavior as a quick way to blank the current visual output, similar to the global B button (bypass output) in Resolume Arena/Avenue. This is intended as a quick blank / restore control during live visual work.

### 4. Tempo controls

- `Ctrl + Shift + ↑` / `Ctrl + Shift + ↓`: Increase or decrease the base BPM by 1.

- `Ctrl + Shift + T`: Tap tempo calculates a BPM from repeated taps and updates the **base BPM**, similar to the **TAP** button in Resolume Arena/Avenue.

- `Ctrl + Shift + ←` / `Ctrl + Shift + →`: These shortcuts do not change the displayed base BPM value. Instead, they change the **rate multiplier** applied to the effective BPM sent to Hydra. The multiplier appears in red next to the BPM value.

## Persistence

### When navigating from one Hydra page to another Hydra page

The script keeps:

- base BPM
- rate multiplier

### When opening Hydra in a new tab or window from outside Hydra

The script resets to the following defaults:

- **BPM:** 120
- **Multiplier:** none
- **Hush:** off

## Installation

### 1. Install a browser extension that can run custom user scripts

Before installing Hydra BPM Tools, you need an extension that can run user scripts.

Common options include:

- Tampermonkey
- Violentmonkey

Availability depends on your browser and operating system. Most desktop browsers are supported, while mobile support is more limited.

### 2. Install the script

Click the link below to install the latest version of the script:

[![Install Hydra BPM Tools](https://img.shields.io/badge/Install-Hydra%20BPM%20Tools-blue)](https://raw.githubusercontent.com/beatmelab/hydra-bpm-tools/main/hydra-bpm-tools.user.js)

If your userscript manager is installed correctly, it should detect the script automatically and open the installation screen.

### 3. Manual installation (alternative)

If automatic installation does not work, open your userscript manager and create a new script.

Replace the default content with the contents of:

`hydra-bpm-tools.user.js`

Then save the script and open:

`https://hydra.ojack.xyz/`

## Notes

This script is designed to stay lightweight and interfere with Hydra’s native UI as little as possible.

## Author

- [@alt234vj](https://www.instagram.com/alt234vj)
- [@beatmelab](https://www.instagram.com/beatmelab)
- https://www.beatmelab.com

## License

MIT
