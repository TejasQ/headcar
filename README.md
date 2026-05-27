# headcar

Brain-controlled 4WD RC car using a Muse 2 EEG headband. **Jaw clench drives forward (with variable speed by clench intensity), eyebrow raise drives reverse, head tilt steers.** Built with an ESP32 on the car and a Next.js browser app on the laptop as the BLE host.

## Repo structure

```
laptop/   Next.js dashboard — connects to Muse via Web Bluetooth, sends commands to car over WebSocket
car/      ESP32 Arduino sketch — WiFi, WebSocket server, GPIO to TB6612FNG motor driver
```

## Prerequisites

- Node.js 18+
- Chrome or Edge (Web Bluetooth is Chromium-only)
- Arduino IDE 2.x with ESP32 board support added:
  `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
- CP2102 USB driver (Windows/macOS may need this for the AZ-Delivery ESP32)

## Running the laptop dashboard

```bash
cd laptop
npm install
npm run dev
```

Open `http://localhost:3000` in Chrome. Use localhost, not the Vercel URL, when driving — HTTPS blocks plain `ws://` WebSocket connections.

## Flashing the ESP32

1. Open `car/car.ino` in Arduino IDE 2.x
2. Set your WiFi credentials in the two `const char*` lines at the top
3. Select board: ESP32 Dev Module
4. Select the correct COM port
5. Click Upload

After flashing, the Serial Monitor (115200 baud) will print the IP address and confirm when the WebSocket server is ready.

## Driving

1. Power the car (18650 pack)
2. Run `npm run dev` in `laptop/`
3. Open `http://localhost:3000` in Chrome
4. Click Connect Muse, then Connect car
5. Clench your jaw to drive forward (harder clench = faster); raise your eyebrows briefly to reverse; tilt your head to steer

## Simulate mode

No Muse yet? Click Simulate on the dashboard. It fires fake forward bursts (varying intensity) and reverse pulses so you can test the full browser-to-car pipeline before the headband arrives.

## Signal processing

Jaw clench (forward) and eyebrow raise (reverse) are both EMG bursts in the EEG high band. They're separated by **where on the scalp the signal lands**:

- Jaw clench → masseter muscles → EMG propagates broadly, lighting up both AF7/AF8 (forehead) AND TP9/TP10 (temples/ears).
- Eyebrow raise → frontalis muscle → EMG is localized to the forehead, hitting AF7/AF8 only while TP stays near baseline.

The detector in `laptop/app/detector.ts`:

1. **Bandpass split.** Each EEG sample feeds two 2nd-order Butterworth biquads:
   - Low band — lowpass at 10 Hz (kept for future use; not currently used for any gesture)
   - High band — highpass at 20 Hz (isolates fast EMG crackle)
2. **Sliding-window features.** A 64-sample (250 ms) ring buffer per band tracks RMS power, plus a zero-crossing rate (ZCR) on the high band.
3. **Classification rules** (in `laptop/app/page.tsx`):
   - Every 50 ms tick computes `afHigh = mean(AF7.highRms, AF8.highRms)` and `tpHigh = mean(TP9.highRms, TP10.highRms)`, then EMA-smooths each (α = 0.3, ~150 ms effective window) before evaluation.
   - `ratio = afHigh / max(tpHigh, 1)` is the **AF/TP ratio discriminator**. Clench produces ratio ≈ 1 (masseter ≈ frontalis in size, both fire). Eyebrow produces ratio ≈ 2–3 (frontalis ≫ auricularis, AF dominates). Replaces the older strict TP-ceiling rule which broke when ear muscles co-fired during eyebrow raises on some users.
   - **Forward (jaw clench)** — `tpHigh > tpThr_fwd` AND `ratio < 1.6` AND any channel ZCR > 0.20, sustained for 3 consecutive ticks (150 ms debounce). TP-primary because on consumer hardware (Muse 2 + casual contact), masseter EMG lands almost entirely on TP9/TP10 and barely on AF7/AF8 — contradicting the laboratory EMG-on-EEG literature; see thesis §2026-05-27. Continuous; intensity = `tpHigh / tpThr_fwd` mapped from [1.0, 3.0] → drive [0.30, 1.00].
   - **Reverse (eyebrow raise)** — `afHigh > afThr_rev` AND `ratio > 1.6` AND any channel ZCR > 0.20. Discrete trigger → 800 ms reverse pulse at drive −0.7, with a 1.5 s cooldown.
   - Forward suppresses reverse when they would both fire (clench wins ambiguities).

### Auto-calibration

Absolute μV thresholds drift with headset fit and skin contact, so thresholds are derived from a per-session noise floor measurement:

- On Muse connect (and on demand via **Recalibrate**), a 5 s window collects `mean(AF highRms)` and `mean(TP highRms)` per ~50 ms tick. The 90th percentile of each becomes the **baseline** — robust to a stray twitch.
- Thresholds are `baseline × sensitivity` for both AF and TP, with separate sensitivity multipliers for forward and reverse (2×–8×, default 4×, persisted as `forwardSensitivity.v4` / `reverseSensitivity.v4`).
- Detection is gated on calibration completing; until a baseline exists, thresholds are `Infinity`.

### Wire protocol

The laptop streams two commands to the car over WebSocket:
- `drive:X` where X ∈ [−1, 1] — positive forward, negative reverse, magnitude scales PWM from MIN_PWM (120) to MAX_PWM (255). Sent at 10 Hz while a gesture is active, plus one `drive:0` on transition to idle.
- `steer:X` where X ∈ [−1, 1] — left/right differential, sent at 10 Hz continuously while connected.

The car has a 500 ms watchdog on `drive:` — if no message arrives within that window the motors stop. Protects against laptop disconnect, browser tab crash, or BLE drop while moving.

### Contact quality

Each channel's raw 250 ms RMS feeds a `'good' | 'fair' | 'bad'` classifier (green/yellow/red dot above the meter bar):
- `< 3 μV` or `> 250 μV` → bad (flatline or rail/saturation)
- `< 8 μV` or `> 120 μV` → fair
- `8–120 μV` → good

Watch the dots during calibration — all four channels should be green for the resulting baseline to be meaningful (especially AF7/AF8 and TP9/TP10 since both pairs are now load-bearing for gesture discrimination). If calibration produces near-zero numbers it bails with a warning.

The dashboard's per-channel meter shows the high-band RMS bar, current ZCR, and two dashed threshold lines: yellow = forward gate (AF: trigger floor, TP: required floor), red = reverse gate (AF: trigger floor, TP: ceiling — clench discrimination).

## Hardware

See `SUMMARY.md` for the full parts list, wiring diagram, GPIO pinout, and power architecture.
