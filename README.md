# SUMMARY.md

## Project
Brain-controlled 4WD car using a Muse 2 EEG headband. The "brain control" is really head movement + blink/jaw artifacts that the Muse picks up — that's what actually works with consumer EEG. Every viral "mind-controlled X" demo on YouTube works this way.

## Key decisions (in order)
1. **Started:** DIY EEG headband + Pi relay + Node.js
2. **Pivoted:** Build our own EEG board (Cerelog ESP-EEG, ADS1299)
3. **Pivoted again:** Skip the Pi, two ESP32s only (one on head, one on car)
4. **Pivoted again:** Just buy a Muse 2 — the EEG build was the excuse, the car is the goal
5. **Software pivot 1:** JavaScript via Electron + muse-js (not Python)
6. **Software pivot 2:** Drop Electron, use pure terminal Node with `@abandonware/noble` for BLE

## Architecture
```
[Muse 2] --BLE--> [Laptop: Node + noble] --WiFi UDP--> [ESP32 on car] --GPIO--> motors
```

Laptop is a required middleman because Muse only speaks BLE and BLE needs a real host stack. **ESP-NOW direct (Muse → ESP32) is impossible** — Muse is not an ESP32. Only way to eliminate the laptop is to build your own headband (Cerelog path) — out of scope.

## Reality checks
- Consumer EEG cannot reliably decode "turn left" thoughts
- What the Muse *can* detect reliably:
  - **Eye blinks** — huge artifact on AF7/AF8
  - **Jaw clenches** — EMG burst across all 4 channels
  - **Head tilt (pitch/roll)** — accelerometer, very reliable
  - **Attention / alpha power** — slower, less reliable, but real
- Muse 2: 4 EEG channels (AF7, AF8, TP9, TP10) + 3-axis accel/gyro + PPG. Forehead + behind-ears only, no through-hair coverage — fine for this project.

## Software stack
- **Node.js** (pure terminal, no Electron, no GUI)
- **`@abandonware/noble`** — Node BLE library, talks to Muse 2 directly
- **`dgram`** (UDP) or **`ws`** (WebSocket) — sends commands to car
- **Arduino IDE 2.x** — flashes ESP32 with C++ firmware (uses `esptool.py` under the hood, hidden behind Upload button)
- ESP32 board support URL: `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
- Alternative: PlatformIO in VS Code (better long-term, same toolchain underneath)

## ESP32 ↔ laptop (USB, dev only)
- USB does power + serial during development
- AZ-Delivery board has **Micro-USB**, not USB-C (USB-C adapter needed on modern MacBooks)
- CP2102 chip on board translates USB ↔ ESP32 serial
- macOS may need Silicon Labs CP2102 driver
- Linux: `sudo usermod -a -G dialout $USER`
- Once flashed, car runs on battery — USB only for dev

## ESP32 ↔ home WiFi
- Credentials hardcoded in sketch (`const char* ssid = "..."`)
- **ESP32 is 2.4 GHz only** — no 5 GHz networks
- Laptop and ESP32 must be on the same network (phone hotspot works too)
- Router-assigned IP may change → use mDNS (`car.local`) instead of hardcoded IP

## Power architecture (car)
Chassis ships with 4× AA holder — **ignore it**, use 2× 18650 holder instead. Two parallel paths from same battery pack, isolated by the buck so motor noise doesn't crash ESP32:
```
2× 18650 (7.4V) ─┬─→ TB6612 VM ─→ motors
                 │
                 └─→ MP1584 buck (set to 5V) ─→ ESP32 VIN

All grounds tied together. ESP32 3.3V → TB6612 VCC (logic power).
```

**Headband power:** Muse 2's internal LiPo, charges via USB. Done.

## ESP32 → motor driver wiring
6 signal wires + shared ground + logic power. Direction pins are steady on/off. PWM pins flicker rapidly (duty cycle = speed). The motor driver translates these into battery power flowing to motors.

| ESP32 GPIO | TB6612 | Purpose |
|---|---|---|
| 4 | PWMA | Left speed (PWM) |
| 5 | AIN1 | Left direction A |
| 6 | AIN2 | Left direction B |
| 7 | PWMB | Right speed (PWM) |
| 15 | BIN1 | Right direction A |
| 16 | BIN2 | Right direction B |
| 17 | STBY | Enable (HIGH = on) |
| 3.3V | VCC | TB6612 logic power |
| GND | GND | **ALL grounds tied together** |

**Direction truth table:**
- A=on, B=off → forward
- A=off, B=on → reverse
- A=off, B=off → coast
- A=on, B=on → brake

## Build phases (revised)
1. **Phase 1 — Terminal hello world.** Node script connects to Muse via noble, prints "blink", "jaw clench", and accelerometer values to terminal in real time. No car involved.
2. **Phase 2 — Forward only.** ESP32 sketch: WiFi connect, UDP listener, drive forward 200ms on any packet. Node script sends a packet on every blink.
3. **Phase 3 — Add reverse.** Jaw clench = reverse packet. Packet content tells ESP32 direction.
4. **Phase 4 — Add steering.** Stream accelerometer roll continuously, differential motor control.

## Shopping list (ordered, ~€380-430 from Amazon.de)
**Headband:** Muse 2 EEG Headset (~€280-310)

**Car electronics:**
- AZ-Delivery ESP32 NodeMCU CP2102 (~€10)
- TB6612FNG motor driver breakout (~€5-8)
- MP1584 buck converter, 5-pack (~€7-10)
- 2× 18650 protected Li-Ion cells (~€15-20)
- 2× 18650 battery holder with bare leads (~€5) — replaces the AA holder from chassis
- 18650 USB charger, 2-bay (Liitokala Lii-202 / XTAR VC2, ~€15-20)

**Car body:** Bare 4WD Robot Chassis Kit with TT motors (~€20-30) — NOT the full ELEGOO V4 with Arduino

**Tools:**
- Breadboard + **mixed-gender** jumper kit (M2M + M2F + F2F, ~€10-12) — explicitly skipped GTIWUNG male-only set
- Digital multimeter (~€15) — set buck to exactly 5V before connecting ESP32

## Critical gotchas
- **All grounds tied together** — the #1 thing that bites first-timers
- **Verify buck output = 5V** with multimeter *before* connecting ESP32 (non-negotiable)
- **2.4 GHz WiFi only** for ESP32
- **Micro-USB** on this board, not USB-C
- Muse forces a laptop middleman — no way around it without custom hardware
- Chassis ships with AA holder — ignore, use 2× 18650 holder instead

## Berlin logistics
- Location: 10245 Friedrichshain
- Makerspace if needed: **xHain hack+makespace**, Grünberger Str. 16, 10243. Mon/Tue/Wed/Fri 18:00–00:00, donation-based. Not strictly needed for current plan (Muse path), useful for custom enclosures later.

## Sayings to remember
- "ESP32 whispers to the motor driver" = 6 signal wires going high/low; PWM is rapid on/off averaging to a desired voltage
- "All grounds tied together" = the #1 thing that bites first-time builders
- Battery → motors and battery → buck → ESP32 are two parallel power paths from the same source, isolated by the buck

## Open items
- Phase 1 Node script (noble + Muse → terminal output) — pending
- Phase 2 ESP32 sketch (WiFi + UDP listener + drive forward on packet) — pending
- Verify chassis ships with TT motors (yellow ones) when it arrives
- Once parts arrive: install Arduino IDE 2.x, add ESP32 board support, install CP2102 driver if needed