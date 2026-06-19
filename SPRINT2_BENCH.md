# Sprint 2 — Bench run-sheets

Operational checklists for the hands-on (bench) issues of Sprint 2. Follow the
**active** sheet laptop-in-hand; report numbers back and they get recorded into
`thesis.md` and the matching Linear issue. Order: HEA-10 → HEA-18 → HEA-21 →
HEA-19 → **HEA-16 + HEA-17 (one combined session, below)**. The first four are
done; the live drive (HEA-16) and the battery drain (HEA-17) are the same drive
— record the first few minutes for HEA-16, then keep going to cutoff for HEA-17.

---

## ▶️ HEA-10 — Get car to react (ACTIVE)

**Goal:** prove the full chain works end to end — Muse gesture in the browser
actually spins the wheels. This is a smoke test, not a tuning pass: we just need
*reaction*, in the right direction. Don't chase quality here (that's HEA-18/21).

**You'll need:** car + 18650 pack, Muse 2 (charged, worn), laptop on the
`Jon iPhone 16` hotspot, phone hotspot ON with "Maximize Compatibility".

### Setup
1. [ ] Power the car (18650 pack). ESP32 can stay on USB for the bench.
2. [ ] Open Serial Monitor @115200 — confirm it joins WiFi and prints `IP:` and
       `mDNS started → car.local`. **Note the IP** (expected `172.20.10.2`).
3. [ ] `cd laptop && npm run dev`, open the dashboard in Chrome/Edge.
4. [ ] Car URL field → `ws://<that IP>:81` (default is `ws://172.20.10.2:81`).
       Click connect → status goes **connected**.

### Smoke test A — wires & directions (no Muse yet, manual buttons)
5. [ ] Click **Forward** → all four wheels spin forward together.
       - If a wheel spins backward vs its partner → swap that motor's two wires.
       - If a whole side is backward → swap both wires on that channel.
6. [ ] Click **Reverse** → all four reverse. Click **Stop** → all stop.
7. [ ] ✅ Gate: car reacts to manual commands, correct directions. (If not, it's
       wiring — fix before touching the Muse.)

### Smoke test B — Muse gesture → motion
8. [ ] Connect Muse. Run **Calibrate** (sit still ~5 s) → aim for 4 green dots.
9. [ ] **Jaw clench** → car drives **forward**. Harder clench = faster (drive
       value climbs from 0.30 toward 1.00).
10. [ ] **Eyebrow raise** → car pulses **reverse** (~800 ms at -0.7).
11. [ ] **Head tilt L/R** → wheels speed up on one side (steering differential).
12. [ ] ✅ Gate: each of the three gestures produces the right motion at least
        a few times. Reliability/false-fires are NOT this issue — note them for
        HEA-21 but don't block here.

### Capture for other issues (same trip, saves a second setup)
13. [ ] 📷 **Photo of the as-built L298N breadboard** → closes HEA-20.
14. [ ] Jot quick impressions: does it pull to one side when driving straight?
        (→ HEA-18 trim) Do gestures mis-fire or miss? (→ HEA-21 thresholds)

### Report back
- Did manual control work? Did all 3 gestures react correctly?
- The IP it got, and whether `car.local` resolved (Windows often won't — raw IP
  is the fallback per SUMMARY networking gotchas).
- Anything odd → I log it to `thesis.md` and we move HEA-10 to Done.

---

## ▶️ HEA-18 — Steering tuning (ACTIVE · due 2026-06-17 · ~30 min)

**Goal:** confirm steering feels good on the moving chassis and lock in the final
values. Controls now: one **Steering sensitivity** slider (Head Tilt card, tilt→steer
gain) + a fixed firmware `STEER_DIFFERENTIAL = 1.2` (sharp counter-rotation turn).

### Setup (~5 min) — REQUIRED reflash
1. [ ] **Flash `car/car.ino`** (Arduino IDE → Upload). Firmware changed: signed
       per-side mixing + counter-rotation + fixed `STEER_DIFFERENTIAL = 1.2`.
2. [ ] Refresh dashboard → reconnect car → **▶ Start listening**.

### Tests (~15 min)
3. [ ] **Dead-zone / no creep:** head level, not driving → `steer cmd` reads **0**.
       Tilt slightly → it should stay 0 until past the dead zone. (No twitch at rest.)
4. [ ] **Straight tracking:** clench forward, head level → does it drive straight or
       **veer**? Note the direction (pulls left / right / straight).
5. [ ] **Sensitivity sweep:** clench-forward + tilt; drag the **Steering sensitivity**
       slider until a *comfortable* tilt gives a good turn (aim `steer cmd` ~±0.8 at a
       natural lean). Note the value that feels right.
6. [ ] **Sharpness feel:** at full tilt it should whip around (inside wheels
       counter-rotate). Too wild / not enough? Note which.

### Report back → I lock it in (~10 min, mostly my side)
- **Good sensitivity value** → I set it as the default (laptop edit, no reflash).
- **Veer direction** (if any) → I set `MOTOR_TRIM` in car.ino (one more quick reflash).
- **Sharpness verdict** → if 1.2 is off, I change `STEER_DIFFERENTIAL` (one line + reflash).
- Then HEA-18 closes (constants finalized; thesis tuning note already drafted 2026-06-15).

**Stretch if time:** the car's set up — knock out the HEA-19 watchdog 3-mode test
(below): drive forward, then (a) hotspot off, (b) close tab, (c) Ctrl-C dev server →
wheels must stop within ~0.5 s each.

---

## ⏭️ HEA-19 — Emergency stop / watchdog (staged, not yet active)

**Finding:** the existing "Stop" button is a one-shot `drive:0` — under gesture
control the next clench tick re-commands drive immediately. It is NOT a true
kill switch. HEA-19 needs a **latching E-STOP** that suppresses the gesture
drive loop until re-armed.

**Staged code (apply + flash-test when HEA-19 goes active):**

In `laptop/app/page.tsx`, add a killed flag and gate the drive loop:

```tsx
// near the other refs/state
const [killed, setKilled] = useState(false)
const killedRef = useRef(false)
useEffect(() => { killedRef.current = killed }, [killed])

// inside the drive-loop setInterval, right after the OPEN check (line ~774):
if (killedRef.current) {
  wsRef.current.send('drive:0')
  drivingFlagRef.current = false
  return            // skip all gesture-driven drive/steer while killed
}
```

And a prominent always-visible button (red when armed):

```tsx
<button
  onClick={() => { setKilled(k => !k); sendRaw('stop') }}
  className={killed
    ? 'bg-green-600 hover:bg-green-500 px-8 py-3 rounded-lg font-bold'
    : 'bg-red-700 hover:bg-red-600 px-8 py-3 rounded-lg font-bold'}
>
  {killed ? 'RE-ARM' : '■ E-STOP'}
</button>
```

**Watchdog verification (the core of the issue), three failure modes — each
must stop the wheels within ~500 ms mid-drive:**
1. [ ] Pull car WiFi (toggle hotspot off) while driving forward → stops.
2. [ ] Close the browser tab while driving → stops.
3. [ ] Kill the dev server (Ctrl-C) while driving → stops.

Decision to record: keep the E-STOP button in the demo build? (rec: yes.)
Result → `thesis.md` safety section.

---

## ▶️ HEA-16 + HEA-17 — Combined live-drive + battery-drain session (ACTIVE)

**The fast path: one setup, one continuous drive.** HEA-16 is the *first few
minutes* (recorded); HEA-17 is *the same drive, continued to cutoff*. Prereqs
are met — HEA-18 (steering), HEA-19 (watchdog) and HEA-21 (thresholds) are all
closed, so the car is dialed in. Budget ~10–15 min of driving plus setup.

**You'll need:** a **fully charged** 18650 pack, Muse 2 (charged, worn), laptop
on the `Jon iPhone 16` hotspot, and — if possible — a **multimeter** for pack
voltage (if you don't have one, you still get runtime; you just skip the voltage
numbers). A clear floor run, or a stand to elevate the car (see the load note in
Phase 2).

### Setup (~5 min)
1. [ ] Charge the 18650 pack to full. With a multimeter, **measure and note the
       resting pack voltage** (`V_start`, expect ~8.4 V for a 2S pack / ~4.2 V
       for 1S). Skip if no meter.
2. [ ] Power the car on that pack. Open Serial Monitor @115200 — confirm WiFi
       join, note the IP (expect `172.20.10.2`; `car.local` often won't resolve
       on Windows — use the raw IP).
3. [ ] `cd laptop && npm run dev`, dashboard in Chrome → car URL
       `ws://172.20.10.2:81` → connect → **connected**.
4. [ ] Connect Muse → **Calibrate** (sit still ~5 s) → confirm **4 green dots**.
       (Bad dot → reseat headset before driving; a clean recording needs clean
       contact.)
5. [ ] Create a `laptop/recordings/` folder if it doesn't exist (the dashboard
       downloads the session as a `.json` — you'll move it here and **keep it**;
       it's permanent Chapter-4 data).
6. [ ] **Start a stopwatch now and leave it running** — total elapsed from full
       charge is the HEA-17 runtime, and the HEA-16 recording happens inside it.

### Phase 1 — HEA-16 recorded live drive (first ~3 min, wheels DOWN)
Drive on the floor so the recording reflects real rolling load.
7. [ ] **Start the dashboard recorder** (the session record → Save .json control).
8. [ ] **Arm** the controls (defaults to disarmed).
9. [ ] Exercise all three gestures over ≥ 2 min continuous (aim ~3 for margin):
       - [ ] **Forward** — clench at light / medium / hard to show the speed
             ramp (variable intensity).
       - [ ] **Reverse** — eyebrow raise, held (car reverses while sustained).
       - [ ] **Steer** — head tilt left and right while driving.
10. [ ] While driving, eyeball and jot: contact-quality dots staying green?
        any **watchdog stops** (car cutting out mid-drive)? any visible
        dropped-frame / lag stutters? (The .json logs the drive commands; these
        notes cover what it can't.)
11. [ ] **Stop the recorder → Save .json** → move it into `laptop/recordings/`.
        ✅ HEA-16 capture done. **Do NOT power down — keep driving into Phase 2.**

### Phase 2 — HEA-17 drain to cutoff (keep driving, same pack)
12. [ ] Keep driving continuously under a realistic load until the car can no
        longer move (motors visibly weaken / stall, or the ESP32 browns out and
        drops WiFi). **Load note:** wheels-down rolling is the most representative
        load; if chasing the car for ~8+ min is impractical, elevate it on a
        stand and hold sustained forward + periodic steering — just note that
        elevated runtime slightly *over*-estimates real-world (lighter load).
13. [ ] At cutoff: **stop the stopwatch → note total runtime** (`T_cutoff`), and
        if you have a meter, **measure pack voltage at cutoff** (`V_cutoff`).

### Report back → I log both issues
**HEA-16:**
- Did all three gestures drive cleanly over the ≥2 min run? Contact dots green
  throughout? Any watchdog stops / dropped frames?
- The `.json` filename saved to `recordings/`.

**HEA-17:**
- `V_start` (if measured), `T_cutoff` (total runtime from full charge),
  `V_cutoff` (if measured).
- Gut call: does that runtime comfortably cover the demo length? → I record the
  decision on whether a **second pack / mid-demo swap** is needed.

I take both sets of numbers into `thesis.md` (Chapter 4 results + safety/runtime)
and close HEA-16 and HEA-17 in Linear. The HEA-16 figures also fill the
`[live-pending]` placeholders in `PRESENTATION_SCRIPT.md`.
