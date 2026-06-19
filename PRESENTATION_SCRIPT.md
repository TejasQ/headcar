# Presentation script — Muse-controlled car (HEA-14)

**Step 1 of 4** (outline → rehearsal → slides → done). This is the spoken
narrative *before any slides exist*. Rehearse aloud from this; slides (HEA-13)
get built to match the beats you keep after rehearsal (HEA-15), not the other way
round.

- **Target length:** ~12 min — ~9 min talk + ~3 min live demo.
- **Audience:** supervisor + panel. Technical, but not BCI specialists.
- **One-sentence thesis:** *You can drive a real car with a $250 consumer EEG
  headband — not by reading your mind, but by reliably detecting the electrical
  and motion artifacts your body makes, and engineering around the limits of
  cheap hardware.*

> Honesty flags for rehearsal: reliability figures come from guided/replay
> validation (clench 16/16, eyebrow 5/5, 0 false-positives over rest). The
> sustained live drive (HEA-16) is now captured — 2026-06-19, 128 s continuous,
> all gestures, no watchdog drops — so the demo-length claim is real. A precise
> marker-to-trigger latency still needs labeled replay analysis; don't quote a
> hard latency number you can't show.

---

## Outline at a glance

| # | Section | Time | Beat |
|---|---------|------|------|
| 0 | Hook | 0:30 | Drive a car with your face, not a controller |
| 1 | Problem framing | 1:30 | What "brain control" really means here |
| 2 | Artifact vs intent | 1:30 | The honest reframing — the core intellectual move |
| 3 | The pipeline | 2:00 | Muse → browser → ESP32 → motors |
| 4 | How a gesture becomes a command | 1:30 | The signal-processing idea, no math dump |
| 5 | What the build actually taught me | 1:30 | The hard-won findings (the thesis meat) |
| 6 | **Live demo** | 3:00 | Calibrate → forward → reverse → steer → stop |
| 7 | Limitations + future work | 0:45 | Honest boundaries |
| 8 | Close | 0:15 | Callback to the hook |

---

## 0 · Hook (0:30)

**Beat:** open on the car, not on slides.

> "This is a normal RC car. There's no remote in my hand. In a few minutes I'm
> going to drive it forward, reverse it, and steer it — using only my face and
> the tilt of my head, read by this headband. No buttons, no joystick.
>
> But I want to be honest with you up front, because the interesting part of
> this project is *exactly* the part that the phrase 'brain-controlled car'
> gets wrong."

*(Set the car down. Pick up the Muse.)*

---

## 1 · Problem framing (1:30)

**Beats:**
- "Brain-controlled" is a loaded phrase — sets the wrong expectation.
- Consumer EEG (Muse 2) is not a research rig: 4 dry electrodes, noisy.
- Real neural *intent* decoding needs ML, labelled data, per-user models — out of scope, and frankly not honest on this hardware.

> "When people hear 'brain-controlled,' they picture thought-reading — I think
> 'go' and it goes. That's not what this is, and on a £200 consumer headband,
> anyone who tells you otherwise is overselling.
>
> The Muse 2 has four dry electrodes — two on the forehead, two behind the ears.
> It's built for meditation feedback, not for decoding intent. Genuine neural
> intent decoding — actually classifying a *thought* — needs machine learning,
> large labelled datasets, and a model trained per person. That was out of scope,
> and on this hardware it wouldn't have been honest.
>
> So I asked a different question: what *can* you reliably get off this headset —
> and is it enough to drive a car?"

---

## 2 · Artifact vs intent — the core idea (1:30)

**Beats:**
- The headset doesn't only see brain waves — it sees *artifacts*: muscle (EMG) and motion.
- Normally artifacts are noise to be filtered out. Here they're the *signal*.
- Three deliberate, repeatable artifacts → three controls.

> "Here's the reframing the whole project rests on. An EEG headset doesn't only
> pick up brain activity — it also picks up *artifacts*: electrical noise from
> your muscles, and motion from its built-in accelerometer. In normal EEG work,
> these are the enemy — you spend all your effort filtering them *out*.
>
> I did the opposite. I treated the artifacts as the signal. They're not
> thoughts, but they are *deliberate*, they're *repeatable*, and they're
> *strong* — which is exactly what you want for control.
>
> Three artifacts, three controls:
> - **Clench your jaw** → drive forward. And harder clench → faster — it's
>   variable speed, not just on/off.
> - **Raise your eyebrows** → reverse.
> - **Tilt your head** → steer.
>
> None of that is mind-reading. All of it is reliable. That trade — honesty for
> reliability — is the thesis."

---

## 3 · The pipeline (2:00)

**Beats:**
- Four stages: Muse → laptop browser → ESP32 on the car → motors.
- Why the *browser*: Web Bluetooth is the BLE host; runs locally (no cloud).
- Why two radios: BLE headset→laptop, WiFi laptop→car.
- The wire protocol is tiny: `drive:X` and `steer:X`.

> "The system is four stages, and the data only ever flows one way.
>
> **One — the Muse** streams its raw electrode and motion data over Bluetooth.
>
> **Two — my laptop, in a web browser.** This surprises people: the browser is
> the brain of the operation. Chrome can talk Bluetooth directly through the Web
> Bluetooth API, so a web app reads the headset, does all the signal processing,
> and decides 'that was a clench.' It runs entirely locally — nothing goes to the
> cloud.
>
> **Three — the car's ESP32**, a tiny WiFi microcontroller. The laptop sends it
> commands over WiFi. And the commands are deliberately dumb — just two messages:
> `drive` with a number from minus-one to one, and `steer`, same range. All the
> intelligence is on the laptop; the car just obeys.
>
> **Four — the motors**, through a motor-driver chip that turns those numbers
> into actual voltage to the wheels.
>
> Two radios doing two jobs: Bluetooth from headset to laptop, WiFi from laptop
> to car. The laptop is the bridge."

*(If using a slide here, it's the one architecture diagram. Say it can be
followed without the slide.)*

---

## 4 · How a gesture becomes a command (1:30)

**Beats:**
- Clench and eyebrow are *both* muscle bursts — how do you tell them apart?
- Answer: *where* on the head the signal lands (jaw = everywhere; eyebrow = forehead only).
- A short per-session calibration sets the thresholds (no fixed numbers — they drift).
- Don't dump the math. One analogy, then move on.

> "The tricky part: a jaw clench and an eyebrow raise are *both* just bursts of
> muscle electrical noise. How do you tell them apart?
>
> By *where* the burst lands. Clenching your jaw fires a big muscle that lights
> up the whole headset — forehead *and* ears. Raising your eyebrows fires a small
> forehead muscle — so the forehead lights up but the ear sensors stay quiet. The
> software watches the *ratio* between those two regions. Roughly equal — that's a
> clench, go forward. Forehead dominant — that's eyebrows, reverse.
>
> And because skin contact and fit change every time you put the headset on, I
> don't hard-code any thresholds. There's a five-second calibration: sit still,
> it measures your personal noise floor, and sets the trigger levels relative to
> *that*. It's the closest thing this system has to 'training' — and it takes five
> seconds, not a dataset."

---

## 5 · What the build actually taught me (1:30)

**Beats (pick 2–3 to say; the rest are backup for Q&A):**
- **Theory lied; the hardware told the truth.** Textbooks say jaw EMG shows up on the forehead sensors. On *this* headset it lands almost entirely on the *ear* sensors. I had to derive the rules from measured data, not the literature.
- **Comfortable isn't reliable.** A relaxed clench is only ~1.2× the resting noise — too close to call. Reliable control needs a *deliberate* clench. That's a real signal-to-noise limit of cheap EEG, and a genuine result.
- **The counterfeit-chip saga.** Four motor-driver chips in a row were fakes with a dead output stage — diagnosed pin by pin, then switched the whole driver. (Good "engineering reality" beat.)
- **Bench testing hid problems live driving exposed.** Half my tuning problems only appeared once the real car was rolling.

> "A few things the build taught me that I didn't expect.
>
> First — the textbooks were wrong for my hardware. The EMG literature says a jaw
> clench should show up strongest on the forehead sensors. On this Muse, it lands
> almost entirely on the sensors behind the *ears*. So I couldn't design from
> theory — every detection rule had to come from data I measured off my own head.
>
> Second, and this is my favourite result: a *comfortable* clench is only about
> 1.2 times the resting noise level — basically indistinguishable from sitting
> still. Reliable control needs a *deliberate* clench. That's a concrete limit of
> consumer EEG, and a clean example of the accuracy-versus-effort trade-off.
>
> And third, for the engineers in the room — I lost about a week to four
> motor-driver chips that were counterfeit, with a dead half of the output stage.
> I diagnosed it pin by pin and swapped the entire driver. The thesis doesn't
> hide that; debugging fake hardware *was* part of the work."

---

## 6 · LIVE DEMO (3:00)

> **Pre-flight (do before you start talking, or during section 0):**
> car powered (18650 pack), ESP32 booted and on the hotspot, `npm run dev`
> running, dashboard open in Chrome, car connected (`ws://172.20.10.2:81` — use
> the raw IP, `car.local` often won't resolve on Windows), Muse charged and worn.
> Keep the car **wheels-down on the floor** with a clear run, or **elevated** if
> space is tight. The arm toggle defaults to **disarmed** — it will *not* move on
> connect.

**Demo beats — narrate each action as you do it:**

1. **Calibrate (5 s).** "I'll sit still for five seconds while it learns my
   baseline." → aim for four green contact dots. *(If a dot is red, reseat the
   headset — don't push on.)*
2. **Arm it.** "Now I arm the controls — until now the car ignored me entirely,
   which is the first of two safety layers."
3. **Forward.** "Watch the speed track how hard I clench." → light clench, then
   harder. Car accelerates.
4. **Reverse.** "Eyebrows up —" → car reverses.
5. **Steer.** "And tilt to turn." → lean left/right, show the differential turn.
6. **Stop / safety.** "Two ways to stop it. One — I disarm." *(toggle)* "Two —
   even if my laptop crashed or walked out of range, the car has a half-second
   watchdog: no command for 500 milliseconds and the motors cut on their own."
   *(Optional, if safe: kill WiFi mid-drive to show the watchdog.)*

> **Fallback plan (say nothing about it unless it triggers):** if the live
> headset misbehaves — bad contact, won't calibrate — switch to **Simulate
> mode** on the dashboard (fires synthetic forward/reverse/steer) so the *car*
> still demonstrably drives. If the car itself fails, have a **recorded video**
> of a clean run queued. Never let a flaky contact dot become dead air — narrate
> the fallback as "here's the same thing from a recorded session."

---

## 7 · Limitations + future work (0:45)

**Beats:** be the first to name the boundaries — it reads as rigor.

> "To be clear about the boundaries. This is a single-subject system — calibrated
> to me; I haven't tested it across people. The gestures are artifacts, not
> thoughts, so this isn't a step toward mind-reading — it's a step toward
> *accessible* control that needs no training and no model. And the headline
> reliability numbers come from controlled testing; the long continuous recorded
> run is the last validation I'm finishing.
>
> Where it goes next: combining gestures for more commands, using head-turn from
> the gyroscope as a separate axis, and a proper multi-person study."

---

## 8 · Close (0:15)

> "So — not a mind-reading car. Something I think is more interesting: a careful,
> honest piece of engineering that turns the noise everyone else throws away into
> a reliable way to drive. Thank you — happy to take questions."

---

## Q&A prep (anticipated questions)

- **"Is this really brain control?"** — No, and I lead with that. It's artifact
  control — muscle and motion the headset detects. Honest reframing, not a gotcha.
- **"Why a browser?"** — Web Bluetooth makes Chrome a capable BLE host; keeps it
  local, no app install, no cloud. Trade-off: Chromium-only, must run on
  localhost when driving (HTTPS blocks plain WebSocket to the car).
- **"What's the latency?"** — gesture → motion feels immediate, and a 2-min live
  drive confirmed smooth real-time response with no watchdog drops. A precise
  marker-to-trigger figure still needs labeled replay analysis.
- **"How reliable, in numbers?"** — in guided testing: clench 16/16 hits with 0
  false-positives over rest, eyebrow 5/5, steering directions distinct. Clench is
  strongest, then steering, then eyebrow (needs higher sensitivity). A sustained
  2-min live drive exercised all three with no watchdog drops.
- **"What if it false-fires during the demo?"** — two independent stops: the arm
  toggle and the 500 ms watchdog. Defaults to disarmed.
- **"Why not just use a button/app?"** — the point is *hands-free* control from a
  wearable, as an accessibility direction; the car is the testbed.
- **"Why was the hardware so hard?"** — counterfeit motor drivers (4 in a row),
  Windows mDNS quirks, contact-quality dependence — all documented in the thesis.

---

## Status / handoff to HEA-15

- [x] Outline — all required sections covered (problem framing, artifact vs
      intent, pipeline, demo plan, limitations).
- [x] Talk track — complete enough to rehearse aloud without slides.
- [ ] Rehearsal run 1 (HEA-15) — read-through, no slides; cut to time.
- [ ] Lock narrative → only then build slides (HEA-13).
- **Done:** HEA-16 sustained recorded drive captured (2026-06-19 — 128 s, all
  gestures, no drops) and HEA-17 runtime measured (>11.5 min → single pack covers
  the demo); figures folded into the Q&A above. Optional remaining: a formal
  marker-to-trigger latency from labeled replay analysis.
</invoke>
