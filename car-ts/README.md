# car-ts — TypeScript firmware spike (Moddable XS)

**Status: SPIKE, not yet flashed or validated.** This is a TypeScript port of the
working `car/car.ino`, built to run on the **ESP32 itself** via the
[Moddable SDK](https://github.com/Moddable-OpenSource/moddable) (the XS JavaScript
engine). The goal is to prove the TS version matches the C++ behavior **before**
it replaces anything. The C++ firmware in `car/` remains the source of truth and
is untouched.

> ⚠️ I could not compile or flash this here — there's no Moddable toolchain in
> this environment. Treat `main.ts` as a structural translation to build and test,
> not a guaranteed-flashable binary. Lines marked `VERIFY:` are Moddable API
> details to confirm against your installed SDK version on the first build.

## Why this is a bigger change than "rewrite a file"
The ESP32 can't run TypeScript directly. Moddable flashes its **XS JavaScript
engine** onto the chip, then runs your (TS-compiled-to-JS) app on top. So adopting
this means a **new on-chip runtime + a new build/flash toolchain** replacing the
Arduino IDE — not just swapping the language of one file.

## What it does (1:1 with `car/car.ino`)
- Joins WiFi (creds from `manifest.json` → `mc/config`), advertises `car.local`.
- WebSocket server on **port 81**.
- Parses `drive:X` / `steer:X` (X ∈ [-1, 1]).
- L298N control, **same pins**: PWMA 4, AIN1 5, AIN2 18, PWMB 19, BIN1 15, BIN2 16
  (STBY 17 unused). Signed per-side mix (`drive ± steer`), `STEER_DIFFERENTIAL = 1.0`,
  `MOTOR_TRIM = 0.0`, stiction floor at the same 120/255 duty.
- **500 ms watchdog**: no `drive:` within the window → motors stop.

## Prerequisites
1. Install the **Moddable SDK** and set `$MODDABLE` — see the
   [getting-started guide](https://github.com/Moddable-OpenSource/moddable/blob/public/documentation/Moddable%20SDK%20-%20Getting%20Started.md).
2. Install the **ESP32 tools** for Moddable (esp-idf + xtensa toolchain) per
   that guide's ESP32 section.
3. Put your WiFi SSID/password in `manifest.json` → `config`.

## Build & flash
```bash
cd car-ts
# build + flash to a connected ESP32, open the debug console:
mcconfig -d -m -p esp32
```
(`-p esp32` targets the chip; `-d` debug build; `-m` build the manifest.)

## What to verify on first build (the `VERIFY:` markers)
- **PWM resolution / duty range.** `main.ts` assumes 10-bit duty (0..1023) and
  scales the 120/255 stiction floor accordingly. Confirm the Moddable `PWM` default
  resolution on ESP32 and adjust `DUTY_MAX` / `MIN_DUTY` if it differs (the C++ was
  8-bit, 0..255).
- **`websocket` `Server` API.** Confirm the `Server.receive` / `Server.disconnect`
  message constants and the `callback(message, value)` signature for your version.
- **`pins/digital` & `pins/pwm` constructor options** (`{ pin, mode }` / `{ pin }`).
- **`mdns` module API** — hostname claim may be async; confirm the callback shape.
- **`wifi` events** (`WiFi.gotIP`, `WiFi.disconnected`) and `Net.get("IP")`.

## How to validate against the C++ (acceptance for this spike)
Run the **same checks the C++ passed**, against the laptop dashboard unchanged:
1. Manual Forward/Reverse/Stop buttons move the wheels in the correct directions.
2. `steer:` produces the right differential / counter-rotation.
3. **Watchdog**: kill the laptop WiFi mid-drive → wheels stop within ~0.5 s.
4. A short Muse-driven drive behaves like the C++ build (no stutter/lag added).

Only once all four pass should we consider `car-ts/` replacing `car/`.

## Open questions for a real migration
- Flash size / memory headroom of XS + networking vs the bare C++ sketch.
- Latency of the JS control loop vs the C++ `loop()` (watchdog timing margin).
- Whether to keep `car/` as a fallback or fully switch.
