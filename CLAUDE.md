# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo status

Two codebases live here:

- `laptop/` — Next.js app (the browser-based dashboard). Muse BLE connect, gesture detection, accel display, simulate mode, WebSocket client to car. Adaptive calibration + contact-quality indicators.
- `car/` — ESP32 Arduino sketch. WiFi, mDNS (`car.local`), WebSocket server on port 81, motor control via TB6612FNG with PWM speed scaling and a 500 ms watchdog.

The README is the source of truth for decisions, architecture, and the build plan; read it before suggesting changes.

## Architecture

```
[Muse 2] --BLE--> [Browser on Laptop: Web Bluetooth + muse-js] --ws://car.local--> [ESP32 on car] --GPIO--> motors
```

Two codebases:

1. **Laptop side** (`laptop/`) — Next.js app. Uses the **Web Bluetooth API** + `muse-js` in the browser to talk BLE to the Muse 2, then a WebSocket client to send commands to the ESP32. The laptop browser is the required BLE host. Deployed to Vercel for hosting, but **must be run locally (`npm run dev`) when driving the car** — Vercel's HTTPS would block `ws://car.local` (plain WS) due to mixed content. Never add a cloud relay or proxy to work around this; just use dev mode.
2. **Car side** (`car/`) — C++ Arduino sketch for an ESP32 (AZ-Delivery NodeMCU, CP2102). WiFi + WebSocket server + GPIO to a TB6612FNG motor driver. Flashed via Arduino IDE 2.x (ESP32 board support URL in README) or PlatformIO.

"Brain control" in practice means Muse-detectable artifacts, mapped to driving controls:

- **Jaw clench → forward** (variable speed by clench intensity). Masseter EMG propagates broadly → detected when *both* AF (forehead) and TP (ear/temple) high-band RMS exceed their thresholds. Intensity is mapped to a drive value in `[0.30, 1.00]`.
- **Eyebrow raise → reverse** (discrete pulse). Frontalis EMG is local to the forehead → detected when AF high-band fires *while TP stays near baseline*. 800 ms pulse at drive `-0.7`.
- **Head tilt → steer**. Accelerometer X-axis with dead zone ±0.1.

Real EEG intent decoding is out of scope.

Earlier prototypes used blink detection (TP9/TP10 low-band) for forward; that was removed when variable-intensity clench proved more reliable and usable. Don't suggest reviving blink unless the user asks — they explicitly pivoted away.

## Build phases

Work follows the four phases in the README (§ Build phases). Don't skip ahead — Phase 1 is the browser dashboard showing live Muse readings with no car involved; Phase 2 is the minimum ESP32 sketch (WebSocket → drive forward); steering comes last.

## Hardware constraints that affect code

- **ESP32 is 2.4 GHz WiFi only.** WiFi creds are hardcoded in the sketch.
- Use **mDNS (`car.local`)** rather than hardcoded IP — router IP changes.
- **GPIO pinout to TB6612** is fixed in README (PWMA=4, AIN1=5, AIN2=18, PWMB=19, BIN1=15, BIN2=16, STBY=17). Use these. GPIO 6 and 7 are flash pins on ESP32 — unusable.
- Direction truth table: A=on/B=off → forward; A=off/B=on → reverse; both off → coast; both on → brake.
- Muse 2 channels: AF7, AF8, TP9, TP10 + accel/gyro + PPG.
- **Web Bluetooth** requires a secure context (HTTPS or localhost). Works on `localhost` in dev and on the Vercel deployment URL, but not on plain HTTP.
- Web Bluetooth is Chromium-only (Chrome, Edge). Firefox and Safari are not supported.

## Commands

From `laptop/`:
- `npm run dev` — start local dev server (use this when driving the car)
- `npm run build` — production build
- `npm run lint` — lint

For the ESP32 sketch, flashing is done via Arduino IDE 2.x Upload button (esptool.py under the hood) — no CLI workflow is set up.
