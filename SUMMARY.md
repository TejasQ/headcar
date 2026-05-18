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

1. Phase 1 — Browser hello world. DONE. Next.js dashboard with Muse BLE connect, blink/jaw clench/accel display, simulate mode, and WebSocket client to car.
2. Phase 2 — Forward only. ESP32 sketch written, WiFi confirmed working. Wiring partially done: battery power, GND, VCC, STBY, and all 6 signal wires connected. Blocked on loose female connectors not staying on TB6612 pins — needs tape fix or header pins soldered. Buck converter also needs soldering (xHain makerspace). ESP32 powered via USB in the meantime. End-to-end motor test pending.
3. Phase 3 — Add reverse. Jaw clench = reverse message. Message content tells ESP32 direction.
4. Phase 4 — Add steering. Stream accelerometer roll continuously, differential motor control.

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
