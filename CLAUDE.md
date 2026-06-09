# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo status

Two codebases live here:

- `laptop/` — Next.js app (the browser-based dashboard). Muse BLE connect, gesture detection, accel display, simulate mode, WebSocket client to car. Adaptive calibration + contact-quality indicators.
- `car/` — ESP32 Arduino sketch. WiFi, mDNS (`car.local`), WebSocket server on port 81, motor control via TB6612FNG with PWM speed scaling and a 500 ms watchdog.

The README is the source of truth for decisions, architecture, and the build plan; read it before suggesting changes.

## Code-learning mode (Jonathan is learning to read code)

Jonathan is using this repo to **get better at reading and understanding code**. When he asks for explanations, follow this:

- **Style:** plain English, short, small digestible chunks he can commit to memory. Avoid jargon; when a term is unavoidable (float, class, server, PWM, WebSocket), define it in one line with an everyday analogy. He has already had: float vs int, class vs function, server vs client, WebSocket. Build on those, don't re-explain unless asked.
- **Two files already carry study-guide comments** (comments only, no logic changed; currently uncommitted in the working tree):
  - `car/car.ino` — top-of-file overview, the setup()/loop() model, pins, state globals, and every function annotated.
  - `laptop/app/detector.ts` — Biquad as a "frequency sieve" black box, the bands, RingBuffer/RMS/ZCR, and the per-electrode GestureDetector.
- **Recommended reading order** (smallest/most concrete first): `car/car.ino` → `laptop/app/detector.ts` → `laptop/app/recorder.ts` → `laptop/app/replayer.ts` → `laptop/app/page.tsx` (1500 lines, save for last; navigate by searching for known names).
- **The anchor exercise:** trace `drive:0.5` from the laptop → `onWsEvent` (saves `driveValue`) → `loop()` → `applyMotors()` → motor PWM. That one path explains the whole firmware.
- **Teaching method that works for him:** outside-in (start from an observed behavior, find the code), trace one path fully rather than skim, and have *him* explain a function back in his own words for confirmation.
- **Not yet annotated** (offer when he's ready): `recorder.ts`, `replayer.ts`, `page.tsx`.
- He reads code in **Cursor** (installed); open with `cursor "<repo path>" "<file>"`.

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
- **Head tilt → steer**. Accelerometer **Y-axis** with dead zone ±0.1. (Originally X; empirical validation on 2026-05-29 showed left/right head roll lands on Y for this Muse mounting — X barely moves. See thesis 2026-05-29 (extended). The live axis is the `STEER_AXIS` constant in `laptop/app/page.tsx`.)

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

## Project management (Linear via MCP) — CHECK FIRST, UPDATE ALWAYS

**Linear is the authoritative work queue for this project.** Before suggesting what to work on, before recommending a next step, before assuming a task is "done" — check Linear. The backlog in Linear outranks any TODO in code, any note in chat, and any plan in this file.

Workspace: `headcar` · team: `Headcar` · issue prefix `HEA-`. Work is split across **two Linear projects**, and every issue belongs to one of them:

- **Build path** — hardware → integration → tuning → validation → safety → doc-sync. Everything required to get the Muse-controlled car driving reliably end-to-end.
- **Presentation path** — slideshow, script, demo rehearsal, and final docs cleanup.

Read both at session start if you haven't this conversation (use `list_projects` then `get_project`). They are the organizing structure over the issues. The old `Headcar` project is deprecated — no live issues should live there; if you find one, move it to the correct path with `save_issue project="Build path"` or `"Presentation path"`.

Wired into Claude Code via the **`linear-server` MCP** (`/mcp` to authenticate if disconnected).

### Mandatory workflow

1. **Check Linear at session start.** Call `list_issues` for at least `assignee=me, state=backlog` and `state=In Progress`. Cross-reference with `project_current_state` memory. Do **not** propose a next step from memory or vibes alone.
2. **Move issues as work progresses — every time, no exceptions.**
   - Picking up an issue → `save_issue` with `state: "In Progress"`.
   - Merged / verified → `state: "Done"`.
   - Scope changed or abandoned → `state: "Canceled"` with a one-line reason in the description.
   Stale statuses make the backlog lie, and the user relies on it for thesis pacing.
   **No active-sprint issue may sit in Backlog.** When a sprint opens, every issue in that sprint's milestone must be at Todo (or further along). Future-sprint issues stay in Backlog — that's how the active board stays focused.
3. **Reflect repo changes into Linear.** If you tighten thresholds (HEA-21), run a battery test (HEA-17), update wiring docs (HEA-20), etc., immediately move the corresponding issue forward and add a `save_comment` linking the commit / change. Don't wait for the user to ask.
4. **Branch names = `gitBranchName` field.** Each issue exposes one (e.g. `estephanjonathan/hea-11-connect-car-to-ui-properly`). Use it verbatim so Linear auto-links the PR.
5. **Creating issues — propose first, file second.** Never create a new issue unilaterally. Suggest it in chat (title + one-line scope + estimate) and wait for explicit approval before calling `save_issue`. Matches the user's "no code without explicit instruction" rule applied to tracked work.
6. **Search before proposing.** `list_issues` with `query=...` before suggesting anything new — duplicates are noise.
7. **Use comments for durable context.** Validation results, blockers, decisions → `save_comment` on the relevant issue, not just chat history.
8. **Markdown content via MCP:** send real newlines, not literal `\n`.
9. **Estimates: Fibonacci points + T-shirt label.** Every new issue should ship with both. Fibonacci goes in the `estimate` field (1, 2, 3, 5, 8); the matching T-shirt label goes on as a tag so the size is visible on every board view. Mapping: 1=`Size: XS`, 2=`Size: S`, 3=`Size: M`, 5=`Size: L`, 8=`Size: XL`. Apply via `save_issue labels: ["Size: M"]`.
10. **If the user references an issue by ID** (e.g. "HEA-11"), pull the full issue with `get_issue` and treat that as the source of truth for scope.

Treat Linear hygiene the same way you treat README/thesis hygiene: it is part of the deliverable, not optional bookkeeping.

## Commands

From `laptop/`:
- `npm run dev` — start local dev server (use this when driving the car)
- `npm run build` — production build
- `npm run lint` — lint

For the ESP32 sketch, flashing is done via Arduino IDE 2.x Upload button (esptool.py under the hood) — no CLI workflow is set up.
