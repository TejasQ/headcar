# SUMMARY.md

## Project

Brain-controlled 4WD car using a Muse 2 EEG headband. The "brain control" is really head movement + blink/jaw artifacts that the Muse picks up — that's what actually works with consumer EEG. Every viral "mind-controlled X" demo on YouTube works this way.

## Key decisions (in order)

1. Started: DIY EEG headband + Pi relay + Node.js
2. Pivoted: Build our own EEG board (Cerelog ESP-EEG, ADS1299)
3. Pivoted again: Skip the Pi, two ESP32s only (one on head, one on car)
4. Pivoted again: Just buy a Muse 2 — the EEG build was the excuse, the car is the goal
5. Software pivot 1: JavaScript via Electron + muse-js (not Python)
6. Software pivot 2: Drop Electron, use pure terminal Node with @abandonware/noble for BLE
7. Software pivot 3: Drop terminal Node + noble, use Next.js + Web Bluetooth API in the browser (muse-js). Deployed to Vercel; run locally (npm run dev) when driving so ws://car.local is not blocked by mixed content.

## Architecture

```
[Muse 2] --BLE--> [Browser on Laptop: Web Bluetooth + muse-js] --ws://car.local--> [ESP32 on car] --GPIO--> motors
```

The browser (running on the laptop) is the required BLE host. ESP-NOW direct (Muse to ESP32) is impossible — Muse is not an ESP32. The only way to eliminate the laptop is to build your own headband (Cerelog path) — out of scope.

The app is deployed to Vercel but must be run locally (npm run dev) when driving — HTTPS Vercel to plain ws://car.local is blocked by browser mixed content policy.

## Reality checks

- Consumer EEG cannot reliably decode "turn left" thoughts
- What the Muse can detect reliably:
  - Eye blinks — huge artifact on AF7/AF8
  - Jaw clenches — EMG burst across all 4 channels
  - Head tilt (pitch/roll) — accelerometer, very reliable
  - Attention / alpha power — slower, less reliable, but real
- Muse 2: 4 EEG channels (AF7, AF8, TP9, TP10) + 3-axis accel/gyro + PPG. Forehead + behind-ears placement only.

## Software stack

- Next.js (App Router, TypeScript, Tailwind) — browser dashboard, deployed to Vercel, run locally when driving
- Web Bluetooth API — browser-native BLE, Chromium-only (Chrome, Edge)
- muse-js — GATT client for Muse 2 over Web Bluetooth
- WebSocket client (ws://car.local) — sends commands to car from the browser
- Arduino IDE 2.x — flashes ESP32 with C++ firmware
- ESP32 board support URL: https://espressif.github.io/arduino-esp32/package_esp32_index.json

## Power architecture (car)

Chassis ships with 4x AA holder — ignore it, use 2x 18650 holder instead. Two parallel paths from same battery pack, isolated by the buck so motor noise does not crash the ESP32:

```
2x 18650 (7.4V) --+---> TB6612 VM ---> motors
                  |
                  +---> MP1584 buck (set to 5V) ---> ESP32 VIN

All grounds tied together. ESP32 3.3V ---> TB6612 VCC (logic power).
```

Headband power: Muse 2 internal LiPo, charges via USB.

## ESP32 to motor driver wiring

| ESP32 GPIO | TB6612 | Purpose             |
|------------|--------|---------------------|
| 4          | PWMA   | Left speed (PWM)    |
| 5          | AIN1   | Left direction A    |
| 18         | AIN2   | Left direction B    |
| 19         | PWMB   | Right speed (PWM)   |
| 15         | BIN1   | Right direction A   |
| 16         | BIN2   | Right direction B   |
| 17         | STBY   | Enable (HIGH = on)  |
| 3.3V       | VCC    | TB6612 logic power  |
| GND        | GND    | ALL grounds tied    |

GPIO 6 and 7 are flash pins on the ESP32 — unusable. AIN2 and PWMB use 18 and 19 instead.

Direction truth table:
- A=on, B=off  -> forward
- A=off, B=on  -> reverse
- A=off, B=off -> coast
- A=on, B=on   -> brake

## Build phases

1. Phase 1 — Browser hello world. DONE. Next.js dashboard with Muse BLE connect, blink/jaw clench/accel display, simulate mode, and WebSocket client to car. Live tested with real Muse 2 — blink, jaw clench, and accelerometer all confirmed working.
2. Phase 2 — Forward only. Software fully working: ESP32 receives WebSocket commands, Serial Monitor confirms correct messages. Soldering done at xHain. Post-solder debug session (2026-05-22): (1) grounds not tied — ESP32 reset on motor activation, fixed by tying all grounds to negative rail; (2) VCC missing — TB6612 logic power (3.3V from ESP32 3V3 pin) was not wired to TB6612 VCC, causing outputs to be dead; (3) after fixing VCC, AO1/AO2 still read 0V on both the original and a spare TB6612 board despite all signals verified correct (VM=7.63V, VCC=3.3V, STBY=3.3V, PWMA=3.3V, AIN1=3.3V, AIN2=0V, BIN1=3.3V, BIN2=0V, breadboard halves correct, solder joints solid) — both boards confirmed counterfeit/defective batch. Motors confirmed working via direct battery test. Left motor wires paired to AO1/AO2, right motor wires paired to BO1/BO2 (parallel per side). Ordered Adafruit ADA2448 TB6612FNG breakout (genuine) — pending arrival and retest.
3. Phase 3 — Add reverse. DONE (sketch side). ESP32 now parses message payload: blink = forward 200ms, clench = reverse 200ms, stop = coast. Dashboard updated with manual Forward/Reverse/Stop buttons and configurable car URL input (no longer hardcoded).
4. Phase 4 — Add steering. DONE (software). ESP32 sketch refactored to non-blocking state machine (millis() instead of delay()). Accepts steer:X messages (-1.0 to +1.0) and applies differential PWM: left/right motor speeds shift based on roll value. Dashboard streams steer:X every 100ms when car is connected, using accelRef to avoid stale closure. Threshold sliders added for blink and clench. Pending: physical motor test after TB6612 replacement.

## Shopping list (~380-430 EUR from Amazon.de)

Headband: Muse 2 EEG Headset (~280-310 EUR) — ARRIVED

Car electronics:
- AZ-Delivery ESP32 NodeMCU CP2102 (~10 EUR)
- TB6612FNG motor driver breakout (~5-8 EUR)
- MP1584 buck converter, 5-pack (~7-10 EUR)
- 2x 18650 protected Li-Ion cells (~15-20 EUR)
- 2x 18650 battery holder with bare leads (~5 EUR)
- 18650 USB charger, 2-bay (~15-20 EUR)

Car body: Bare 4WD Robot Chassis Kit with TT motors (~20-30 EUR) — NOT the full ELEGOO V4 with Arduino

Tools:
- Breadboard + mixed-gender jumper kit (M2M + M2F + F2F, ~10-12 EUR)
- Digital multimeter (~15 EUR) — set buck to exactly 5V before connecting ESP32

## Networking gotchas

- car.local mDNS does not resolve reliably on Windows — use raw IP address instead
- Home routers often have AP isolation enabled, which blocks device-to-device communication on the same WiFi — use a phone hotspot instead (no AP isolation)
- ESP32 WiFi credentials are hardcoded in the sketch — reflash whenever switching networks
- Laptop and ESP32 must be on the same network for WebSocket to work

## Mounting plan (top plate of chassis)

- 18650 battery holder — velcro or zip tie
- Buck converter — double-sided tape or zip tie
- ESP32 + TB6612 on breadboard — breadboard adhesive backing sticks to plate
- Motor wires run up from bottom plate through chassis slots to TB6612
- All power and signal wires tied down with zip ties

Buy before xHain: velcro tape or double-sided foam tape + zip ties — Rossmann is closest in Friedrichshain.

## Critical gotchas

- All grounds tied together — the number one thing that bites first-timers
- Verify buck output = 5V with multimeter before connecting ESP32 (non-negotiable)
- ESP32 is 2.4 GHz WiFi only — no 5 GHz networks
- Micro-USB on the AZ-Delivery board, not USB-C
- Muse forces a laptop middleman — no way around it without custom hardware
- Chassis ships with AA holder — ignore it, use 2x 18650 holder instead

## Berlin logistics

- Location: 10245 Friedrichshain
- Makerspace if needed: xHain hack+makespace, Gruenberger Str. 16, 10243. Mon/Tue/Wed/Fri 18:00-00:00, donation-based.
