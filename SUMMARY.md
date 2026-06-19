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
2x 18650 (7.4V) --+---> L298N +12V ---> motors (L298N H-bridge)
                  |                 \--> L298N onboard 5V reg ---> L298N logic
                  |
                  +---> (untethered only) MP1584 buck 5V ---> ESP32 VIN
                                          (bench: ESP32 powered over USB instead)

All grounds tied on the negative rail: battery -, L298N GND, ESP32 GND.
```

**Driver swap (2026-06-15):** the original TB6612FNG was abandoned after four modules proved counterfeit (dead high-side — see thesis 2026-06-15). Now using an **L298N**, which self-powers its logic from +12V via its onboard 5V regulator (5V-enable jumper ON) — so unlike the TB6612 there is **no** ESP32-3.3V-to-driver-VCC wire. The MP1584 buck is now only for untethered ESP32 power (or the L298N's +5V output can feed ESP32 VIN). Buck cable colours, if used: white on IN (from battery), black on OUT (to ESP32 VIN).

Headband power: Muse 2 internal LiPo, charges via USB.

## ESP32 to motor driver wiring (L298N)

Same ESP32 GPIOs as the old TB6612 build, re-pointed to L298N pins. The firmware pin
*names* are unchanged (`car/car.ino` header documents the name→L298N mapping):

| ESP32 GPIO | L298N | code name  | Purpose                       |
|------------|-------|------------|-------------------------------|
| 4          | ENA   | PWMA       | Left speed (PWM)              |
| 5          | IN1   | AIN1       | Left direction 1              |
| 18         | IN2   | AIN2       | Left direction 2              |
| 19         | ENB   | PWMB       | Right speed (PWM)             |
| 15         | IN3   | BIN1       | Right direction 1             |
| 16         | IN4   | BIN2       | Right direction 2             |
| (none)     | —     | STBY (17)  | UNUSED on L298N (leave open)  |
| GND        | GND   | —          | common ground (negative rail) |

Power terminals (screw): battery + (7.4 V) → **+12V**; negative rail → **GND**; **+5V** left
empty (it's an output). GPIO 6/7 are flash pins on the ESP32 — unusable.

L298N jumper caps: **5V-enable ON** (self-powers logic from +12V); **ENA and ENB caps OFF**
(so the GPIO 4 / GPIO 19 PWM wires control speed — caps on = speed locked to full).

As-built wire colours: see the `l298n-wiring-colour-code` memory (ENA red, IN1 yellow, IN2
orange, IN3 blue, IN4 brown, ENB purple, +12V red, GND grey).

### Motor outputs (4 motors → 2 channels)

Two channels (A, B), each a pair of screw terminals. Pair each side **in parallel** — channel
**A = left**, **B = right** (matches firmware `leftSpeed → ENA`, `rightSpeed → ENB`):

| L298N output | Motors                              | Side              |
|--------------|-------------------------------------|-------------------|
| OUT1 / OUT2  | left-front + left-rear (parallel)   | LEFT (channel A)  |
| OUT3 / OUT4  | right-front + right-rear (parallel) | RIGHT (channel B) |

Parallel via the breadboard: OUT1 → its own row, both left motors' wire-1 into that row; same
for OUT2/OUT3/OUT4. Each output gets its OWN row — never two outputs in one row, never on the
+/− rails (that shorts the H-bridge). Motor current runs through the breadboard clips, the weak
spot under load — harden (twist into the screw terminal / solder) if the car browns out or a
junction warms.

Polarity: if one wheel spins opposite its partner, swap that motor's two wires; if a whole side
runs backward, swap both wires on that channel. Get all four spinning forward together before
tuning steering.

Direction truth table (per channel, e.g. A):
- IN1=H, IN2=L -> forward
- IN1=L, IN2=H -> reverse
- IN1=L, IN2=L -> coast (off)
- IN1=H, IN2=H -> brake
(ENA/ENB PWM duty sets speed; 0 = stopped.)

## Build phases

1. Phase 1 — Browser hello world. DONE. Next.js dashboard with Muse BLE connect, blink/jaw clench/accel display, simulate mode, and WebSocket client to car. Live tested with real Muse 2 — blink, jaw clench, and accelerometer all confirmed working.
2. Phase 2 — Forward only. Software fully working: ESP32 receives WebSocket commands, Serial Monitor confirms correct messages. Soldering done at xHain. Post-solder debug session (2026-05-22): (1) grounds not tied — ESP32 reset on motor activation, fixed by tying all grounds to negative rail; (2) VCC missing — TB6612 logic power (3.3V from ESP32 3V3 pin) was not wired to TB6612 VCC, causing outputs to be dead; (3) after fixing VCC, AO1/AO2 still read 0V on both the original and a spare TB6612 board despite all signals verified correct (VM=7.63V, VCC=3.3V, STBY=3.3V, PWMA=3.3V, AIN1=3.3V, AIN2=0V, BIN1=3.3V, BIN2=0V, breadboard halves correct, solder joints solid) — both boards confirmed counterfeit/defective batch. Motors confirmed working via direct battery test. Left motor wires paired to AO1/AO2, right motor wires paired to BO1/BO2 (parallel per side). Ordered Adafruit ADA2448 TB6612FNG breakout (genuine) — pending arrival and retest. **Resolution (2026-06-15):** the genuine-board path was overtaken — in total **four** TB6612 modules (original, a hand-replaced unit, and both boards of a fresh sealed 2-pack) all failed *identically*: low-side worked, but the **high-side never engaged** in either direction (forward output stuck at 0 V despite IN1=H, IN2=L, PWM=H, STBY=H, VM=7.34 V, all grounds tied, no shorts). Every input/power/ground measured correct at the chip pins, and a motor spun fine straight off the battery — isolating the fault to the driver silicon. This dead-high-side signature across four boards is the known failure mode of **counterfeit TB6612 chips** (non-functional internal high-side charge pump). Switched to an **L298N** (BJT H-bridge, no charge pump — immune to this fault); it drove on the first try. Full write-up: thesis 2026-06-15.
3. Phase 3 — Add reverse. DONE (sketch side). ESP32 now parses message payload: blink = forward 200ms, clench = reverse 200ms, stop = coast. Dashboard updated with manual Forward/Reverse/Stop buttons and configurable car URL input (no longer hardcoded).
4. Phase 4 — Add steering. DONE (software). ESP32 sketch refactored to non-blocking state machine (millis() instead of delay()). Accepts steer:X messages (-1.0 to +1.0) and applies differential PWM: left/right motor speeds shift based on roll value. Dashboard streams steer:X every 100ms when car is connected. **Update (2026-06-15):** after four counterfeit TB6612 modules failed (see Phase 2), the driver was swapped to an **L298N** and a single motor now drives under firmware control. Pending: parallel-wire all 4 motors (left→OUT1/2, right→OUT3/4), remove the temp self-test, restore normal dashboard control, then full closed-loop drive test.

## Dashboard signal quality work (2026-05-25)

Significant improvements to the browser dashboard to make Muse detection usable in practice:

**UX improvements:**
- Head tilt calibration button — snapshots accel.x as steering zero reference; display now shows adjusted value (x − offset) so calibration is visually confirmed
- Steering dead zone ±0.1 — prevents constant micro-corrections at neutral head position
- Threshold persistence — blink/clench thresholds saved to localStorage and restored on reload
- Live EEG signal meters — 4 vertical bars (TP9, AF7, AF8, TP10) showing per-channel peak amplitude at ~20Hz with EMA smoothing (α=0.2). Threshold reference lines overlaid. Makes it possible to see signal vs noise and set thresholds visually.

**Detection algorithm improvements:**
- Cooldown: blink suppressed 500ms after last fire, clench suppressed 1000ms — prevents single artifact from flooding the car with commands
- Rising edge detection for blink — fires once when signal crosses above threshold, re-arms only after dropping below. One blink = one command regardless of how long signal stays elevated.
- Multi-channel consensus for clench — requires 3+ of 4 channels to spike above threshold within 150ms. A real jaw clench hits all channels simultaneously; isolated single-channel noise cannot trigger it.
- EMG smoothness filter for blink — rejects forehead/eyebrow movement (high-frequency EMG) by computing hfRms/peak ratio within each 12-sample packet. Blinks are slow EOG deflections (ratio < 0.4); forehead muscle bursts are spiky (ratio ≥ 0.4). Prevents eyebrow raises from triggering forward command.
- Mutual exclusion — blink detection suppressed 500ms after any jaw clench fires, preventing clench EMG from simultaneously triggering the blink detector.

**Research finding:** muse-js v3.3.0 has no onboard artifact detection (`artifactEvents` does not exist in any version of this library — confirmed against source). All detection is custom-implemented on raw `eegReadings`.

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
- ESP32 + L298N on breadboard — breadboard adhesive backing sticks to plate
- Motor wires run up from bottom plate through chassis slots to L298N
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
