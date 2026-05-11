# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo status

This repo currently contains only `README.md` — a planning/design doc for a brain-controlled 4WD car project. There is no code yet. The README is the source of truth for decisions, architecture, and the build plan; read it before suggesting changes.

## Architecture (planned)

```
[Muse 2] --BLE--> [Laptop: Node + noble] --WiFi UDP--> [ESP32 on car] --GPIO--> motors
```

Two codebases will live here (neither exists yet):

1. **Laptop side** — Node.js (pure terminal, no Electron). Uses `@abandonware/noble` to talk BLE to the Muse 2, then `dgram` (UDP) or `ws` to send commands to the ESP32. The laptop is a required BLE host; it cannot be eliminated without custom hardware.
2. **Car side** — C++ Arduino sketch for an ESP32 (AZ-Delivery NodeMCU, CP2102). WiFi + UDP listener + GPIO to a TB6612FNG motor driver. Flashed via Arduino IDE 2.x (ESP32 board support URL in README) or PlatformIO.

"Brain control" in practice means Muse-detectable artifacts: **blinks** (AF7/AF8), **jaw clenches** (EMG burst), **head tilt** (accelerometer). Real EEG intent decoding is out of scope.

## Build phases

Work follows the four phases in the README (§ Build phases). Don't skip ahead — Phase 1 is a Node terminal script with no car involved; Phase 2 is the minimum ESP32 sketch (UDP → drive forward); steering comes last.

## Hardware constraints that affect code

- **ESP32 is 2.4 GHz WiFi only.** WiFi creds are hardcoded in the sketch.
- Use **mDNS (`car.local`)** rather than hardcoded IP — router IP changes.
- **GPIO pinout to TB6612** is fixed in README (PWMA=4, AIN1=5, AIN2=6, PWMB=7, BIN1=15, BIN2=16, STBY=17). Use these.
- Direction truth table: A=on/B=off → forward; A=off/B=on → reverse; both off → coast; both on → brake.
- Muse 2 channels: AF7, AF8, TP9, TP10 + accel/gyro + PPG.

## Commands

No build/test commands exist yet. When the Node project is initialized, this section should be updated with the actual `npm` scripts. For the ESP32 sketch, flashing is done via Arduino IDE 2.x Upload button (esptool.py under the hood) — no CLI workflow is set up.
