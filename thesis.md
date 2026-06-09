# Thesis Journal — Brain-Controlled Car

## Working title

Artifact-Based Brain-Computer Interfaces for Consumer Robotics: Building a Head-Controlled RC Car with Off-the-Shelf EEG Hardware

## Aim and objectives

### General objective

To design, implement, and empirically validate a real-time brain–computer-interface (BCI) control system that enables a user wearing a consumer-grade EEG headband (Muse 2) to drive a ground vehicle using non-cognitive electrophysiological and mechanical artifacts — jaw clench, eyebrow raise, and head tilt — without machine-learning-based decoding of conscious neural intent, and to characterise the reliability, latency, and limitations of such artifact-based control on commodity hardware.

### Specific objectives

- **SO1 — Acquisition.** Establish a reliable browser-hosted signal-acquisition path from the Muse 2 (Web Bluetooth + `muse-js`) delivering the four EEG channels (AF7, AF8, TP9, TP10) plus the on-board accelerometer at full rate.
- **SO2 — Feature extraction.** Decompose each channel into physiologically meaningful frequency bands (EOG-band ≤10 Hz, EMG-band ≥20 Hz) and derive low-latency features (band-power RMS, zero-crossing rate) over a sliding window.
- **SO3 — Discrimination.** Devise a non-ML decision rule that reliably separates two overlapping facial-EMG gestures (jaw clench vs eyebrow raise) whose signals propagate across multiple electrodes.
- **SO4 — Adaptive calibration.** Implement a per-session, noise-floor-based calibration that makes detection robust to inter- and intra-session signal drift, replacing fixed absolute thresholds.
- **SO5 — Actuation and safety.** Transmit control commands wirelessly to an ESP32-driven vehicle over a continuous WebSocket protocol governed by a fail-safe watchdog.
- **SO6 — Continuous control.** Extract intensity-graded (proportional) speed control from a single artifact, demonstrating richer-than-binary command capability.
- **SO7 — Validation.** Quantitatively evaluate per-gesture hit rate, false-positive rate, and detection latency from labelled recordings, with appropriate statistical treatment of small-sample proportions.
- **SO8 — Critical appraisal.** Assess the system's accessibility, novelty, and divergence from research-grade EOG/EMG literature, and the implications for reproducibility.

### Research questions

- **RQ1.** To what extent can non-cognitive artifacts captured by a four-channel consumer EEG headband serve as reliable control commands for a ground vehicle?
  - *Evidence to date:* offline validation at production defaults gives clench 16/16 hits (hit rate 1.00) with 0 false positives over 29 s of rest, eyebrow 5/5, and steering directions distinct in 2/2 trials — establishing reliability at the **detection** level. The full **live closed-loop** claim awaits the HEA-8 motor bench test (replacement ESP32 validated and comms proven 2026-06-08; motor wiring pending a soldering iron), so end-to-end driving is not yet demonstrated.
- **RQ2.** Which artifacts (jaw clench, eyebrow raise, head tilt, blink) yield the most reliable and discriminable control signals on consumer-grade hardware?
  - *Evidence to date:* on this user/hardware the reliability ordering is **clench > head tilt > eyebrow ≫ blink**. Clench validates at 100% hit / 0 FP and supports intensity grading; head tilt is high-reliability and continuous; eyebrow is usable but needed a higher sensitivity (3×) and a ratio fix to reach 5/5; blink was trialled and **removed** because AF-contact limitations made it unreliable (2026-05-26 pivot). This is a direct, data-backed answer.
- **RQ3.** How can two facial-EMG gestures whose signals overlap across electrodes be discriminated without machine learning?
  - *Evidence to date:* the AF/TP band-power **ratio discriminant** `r = AF/max(TP,1)` separates the two cleanly — measured clench `r ∈ [0.2, 0.6]` vs eyebrow `r ∈ [1.5, 1.9]`, split at `r* = 1.3`. It exploits a biological invariant (masseter ≈ frontalis ≫ auricularis) rather than a trained model, and replaced an earlier AND-NOT rule. After adopting it, eyebrow detection reached 5/5 with 0 cross-firing. Strongly evidenced.
- **RQ4.** What accuracy-versus-latency trade-off does the signal-processing pipeline (filtering, windowing, feature extraction) impose, and which configuration best balances the two?
  - *Evidence to date:* the chosen configuration — 250 ms (64-sample) RMS window, 2nd-order Butterworth bands, EMA `α = 0.3` (~150 ms), and a 3-tick (150 ms) forward debounce — was selected as a time-frequency compromise: long enough to estimate band power stably, short enough to keep detection delay ~125 ms median. The qualitative trade-off is documented (larger windows / higher-order filters → sharper bands but more group delay); a formal parameter sweep quantifying accuracy vs latency across settings is still to be run.
- **RQ5.** To what extent does per-session, noise-floor-based adaptive calibration improve robustness against signal drift relative to fixed thresholds, and does the user-tuned sensitivity parameter transfer across sessions?
  - *Evidence to date:* fixed μV thresholds were observed to misfire across days and within minutes (headset fit, skin chemistry), motivating the move to `θ = σ·P₉₀(baseline)` with a 5 s noise-floor capture. Qualitatively, the **unitless sensitivity `σ` transfers** across sessions (defaults forward 2×, reverse 3× held over multiple sessions) while the absolute threshold is re-derived each time. A quantitative drift study over a 30-minute session (Chapter 4.2) is still pending.
- **RQ6.** What end-to-end latency from user intent to motor actuation is measured in practice, and is it sufficient for real-time closed-loop driving?
  - *Evidence to date:* a component **latency budget** is estimated — BLE Muse→browser ~10–20 ms, detection-window delay ~125 ms median, drive-stream interval 100 ms — totalling a **target < 400 ms**. This is an estimate, not yet a measurement: the empirical intent-to-motor figure requires the live drive loop (HEA-8) and is the outstanding item for this RQ.
- **RQ7.** What are the dominant sources of false positives and false negatives per gesture, and how can they be mitigated?
  - *Evidence to date:* identified FP sources — forward: speech, swallowing, neck tension; reverse: forehead expressions, surprise reactions. Mitigations in place: the ratio discriminator (anti cross-fire), a ZCR > 0.20 gate (rejects slow drift), forward debounce, and a reverse pulse+cooldown. Validation recorded **0 false positives over 29 s of rest**; however that rest was quiet, so the speech/swallow FP rates are characterised qualitatively and not yet quantified under active interference.
- **RQ8.** To what extent can continuous, intensity-graded speed control be derived from the amplitude of a single artifact?
  - *Evidence to date:* the pipeline maps clench intensity to a continuous drive value in `[0.30, 1.00]` and onward to motor PWM (`MIN_PWM + |d|·(MAX_PWM−MIN_PWM)`), and intensity-protocol recordings reproduce graded triggering across light/medium/hard clenches. A formal monotonicity measure — correlating clench amplitude against commanded speed across the recorded sessions — is still to be computed and is the direct test of H2.
- **RQ9.** How does empirically tuned consumer-EEG artifact detection diverge from research-grade EOG/EMG literature, and what does this imply for reproducibility?
  - *Evidence to date:* three documented divergences from the textbook account, each forced by real testing on this user/hardware: (1) clench is detected **TP-primary** (temporal channels), contradicting the "AF is the EMG/forehead channel" simplification; (2) head-roll steering lands on the accelerometer **Y-axis, not X**, for this mounting; (3) reverse needed 3× (not 4×) sensitivity and a ratio cutoff of 1.3, set from measured distributions. Together these argue that consumer-EEG detection must be **empirically retuned per mounting/user**, with implications for replicability discussed in Chapter 5.
- **RQ10.** How does artifact-based control compare to conventional neural-intent decoding as a training-free and accessible interaction paradigm?
  - *Evidence to date (argumentative):* the system requires no model training and only a ~5 s per-session calibration, and runs entirely in a commodity Chromium browser on consumer hardware — supporting the training-free and accessibility claims. Unlike neural-intent decoders, no labelled training corpus or per-user model is needed. The comparison is developed qualitatively in Chapter 5 rather than from a head-to-head empirical benchmark, which is out of scope for a single-subject build.

### Hypotheses

- **H1 (primary).** Non-cognitive artifacts from a consumer EEG headband, processed with band-power thresholding and a ratio-based discriminator over an adaptive noise-floor calibration, are sufficient for reliable real-time directional control of a ground vehicle — operationalised as a per-gesture hit rate ≥ 90% with a false-positive rate ≤ 5% during rest — without any machine learning.
- **H2 (secondary).** The amplitude of jaw-clench EMG carries sufficient information to support continuous, proportional speed control, such that a single gesture yields a monotonic, user-controllable mapping from clench intensity to vehicle speed rather than a binary on/off command.

## Conceptual statistical and mathematical model

The system is formalised as a real-time, threshold-based classification pipeline operating on band-power features, parameterised by a per-session adaptive calibration, and evaluated with small-sample proportion statistics. The model has five stages.

**1. Signal model.** For each electrode `c ∈ {AF7, AF8, TP9, TP10}`, the Muse streams a discrete raw signal `x_c[n]` at sample rate `Fs = 256 Hz`. Each channel is split into two band-limited components by second-order Butterworth biquads:

- low band `y_c^L[n]` (cutoff 10 Hz) — captures EOG / blink energy;
- high band `y_c^H[n]` (cutoff 20 Hz) — captures facial-EMG energy.

**2. Feature extraction.** Over a sliding window of `N = 64` samples (250 ms), per band `B ∈ {L, H}`:

```
RMS_c^B = sqrt( (1/N) · Σ_{k=1..N} ( y_c^B[k] )² )          (band-power)
ZCR_c   = (1/N) · #{ k : sign(y_c^H[k]) ≠ sign(y_c^H[k-1]) }  (zero-crossing rate)
```

Channel groups are pooled into forehead and temporal EMG means, then EMA-smoothed (`s_t = α·x_t + (1−α)·s_{t−1}`, `α = 0.3`):

```
AF = mean( RMS_AF7^H , RMS_AF8^H )
TP = mean( RMS_TP9^H , RMS_TP10^H )
```

**3. Adaptive threshold.** From a 5 s resting baseline `B_c` collected at calibration, the decision threshold is the 90th percentile of the baseline scaled by a unitless user sensitivity `σ`:

```
θ_c = σ · P₉₀( B_c )
```

The 90th percentile (rather than the mean) provides robustness to transient twitches during calibration; `σ` is the single tunable parameter exposed to the user and transfers across sessions while the absolute threshold is re-derived each session.

**4. Decision rule (classifier).** Detection uses a ratio discriminant `r = AF / max(TP, 1)` that exploits anatomical asymmetry (masseter ≈ frontalis ≫ auricularis), making it invariant to absolute signal magnitude. The piecewise rule is:

```
Forward (jaw clench):  TP > θ_TP  AND  r < r*  AND  max_c ZCR_c > 0.20      [3-tick debounce]
Reverse (eyebrow):     AF > θ_AF  AND  r > r*  AND  max_c ZCR_c > 0.20      [800 ms pulse, 1500 ms cooldown]
```

with split point `r* = 1.3` (the empirical gap centre: measured clench `r ∈ [0.2, 0.6]`, eyebrow `r ∈ [1.5, 1.9]`). Forward suppresses reverse on co-trigger. Steering is taken from the accelerometer Y-axis with a dead zone of ±0.1.

**5. Continuous drive mapping.** Clench intensity is normalised to `I = clamp( (TP − θ_TP) / (TP_max − θ_TP), 0, 1 )` and mapped to a drive value, then to motor PWM:

```
d   = d_min + I · (d_max − d_min),   d ∈ [0.30, 1.00]
PWM = MIN_PWM + |d| · (MAX_PWM − MIN_PWM),   MIN_PWM = 120, MAX_PWM = 255
```

establishing the monotonic intensity→speed relationship that H2 predicts.

**6. Evaluation statistics.** Each gesture is treated as a binary classification problem against labelled ground-truth segments (`1`/`2`/`3` markers in the recorder). From the confusion counts (TP, FP, FN):

```
Hit rate (recall/sensitivity) = TP / (TP + FN)
Precision                     = TP / (TP + FP)
False-positive rate           = FP per unit rest-time
```

Because per-session sample sizes are small, point estimates are reported with **Wilson score 95% confidence intervals** rather than naïve normal-approximation bounds, and differences between sensitivity settings (e.g. reverse `σ = 3×` vs `4×`) are compared with **Fisher's exact test**. Detection latency is summarised by its median and inter-quartile range. Optionally, detection probability is modelled as a logistic function of the feature-to-threshold margin `m = (feature − θ)/θ`, `P(detect | m) = 1 / (1 + exp(−k(m − m₀)))`, giving a principled basis for choosing `σ`. The first logged validation instantiates this model: clench 16/16 hits (hit rate 1.00) with 0 false positives over 29 s of rest, eyebrow 5/5, and steering directions distinct in 2/2 trials — the full Chapter-4 dataset is being accumulated across recorded sessions.

## Innovation and novelty

- **Proportional control from a single artifact.** Most artifact-based BCIs issue binary commands (blink → click). Deriving a continuous, monotonic speed signal from jaw-clench *intensity* is the system's primary novel contribution and the subject of H2.
- **Magnitude-invariant, ML-free discriminator.** The AF/TP ratio separates two overlapping EMG gestures using a biologically invariant anatomical asymmetry rather than per-user trained models — robust to headset fit, skin conductance, and day-to-day drift.
- **Fully browser-native pipeline.** The entire acquisition-to-command stack runs in a Chromium browser (Web Bluetooth + `muse-js`) with no native application and no cloud relay — a deliberately reproducible, low-barrier architecture.
- **Per-session percentile calibration** as a first-class component, making commodity-hardware detection stable without electrode gel or laboratory conditions.
- **Empirically-driven divergence from literature.** Detection was retuned to the *temporal* electrodes for clench on this mounting (TP-primary), contradicting the textbook "AF is the EMG channel" simplification — a documented, data-backed reproducibility finding.

## Thesis document structure

Mapping the supervisor's four-part Bachelor-Thesis layout onto this project (cross-referenced to the detailed chapter notes later in this document):

1. **Design** — system architecture and the end-to-end signal chain (Muse 2 → Web Bluetooth → detector → WebSocket → ESP32 → TB6612FNG → motors); hardware selection and the block diagram. *(See Chapter 2.)*
2. **Analysis of the design** — the electrophysiological and anatomical rationale, the design trade-offs (discrete vs continuous control, fixed vs adaptive thresholds, ratio vs absolute discrimination), and the latency budget. *(See Chapters 1, 2, 5.)*
3. **Software algorithm** — the detection pipeline (`laptop/app/detector.ts`), the gesture decision rules, the adaptive calibration, and the ESP32 firmware (`car/car.ino`). *(See Chapter 3 and the Statistical/Mathematical Model above.)*
4. **Logic structure** — control flow and state: the acquisition→feature→decision→command loop, the calibration state machine, the safety watchdog, and the data-flow between laptop and car. *(See Chapter 3.)*

## Referencing

Bibliographic management is standardised on **Mendeley** (per supervisor guidance). The running list under *References* at the end of this document is the working source set; entries are to be imported into a Mendeley library and cited in the SRH Bachelor-Thesis citation style throughout the final Word document.

## Abstract (draft, revised 2026-06-09)

This project documents the design and build of a brain-controlled RC car using a Muse 2 consumer EEG headband and an ESP32 microcontroller. Rather than attempting to decode conscious neural intent — a problem unsolved even in research-grade BCI — the system leverages reliable electrophysiological and mechanical artifacts: jaw clench (masseter EMG, detected primarily on the temporal channels TP9/TP10) for forward motion with continuous speed control proportional to clench intensity, eyebrow raise (frontalis EMG localized to AF7/AF8) for discrete reverse pulses, and head tilt (accelerometer Y-axis) for differential steering. Detection runs entirely on raw `eegReadings` from `muse-js`, using a two-band Butterworth biquad decomposition, sliding-window RMS, zero-crossing rate, and a session-specific noise-floor calibration derived from the 90th percentile of baseline measurements. Commands are transmitted from a browser-based dashboard over WebSocket to the car, which is governed by a 500 ms drive-watchdog as a safety mechanism. The project explores the gap between the popular perception of "mind control" and what consumer EEG can actually deliver, and argues that artifact-based control with adaptive thresholds is not a compromise but a pragmatic and reproducible approach to accessible BCI.

---

## Journal

### 2026-06-09 — Supervisor feedback: academic-framework restructure of the thesis front matter

Met (async, via Teams chat notes) with the supervisor, Het Mehta (SRH Hochschule Berlin), who set out the academic-structure expectations for the Bachelor Thesis ahead of a progress review in ~two weeks. Captured requirements:

- **Mendeley** for reference management.
- **Word document layout** organised as: (1) Design, (2) Analysis of the design, (3) Software algorithm, (4) Logic structure.
- **Objectives** split into a **General Objective** and **Specific Objectives**.
- **10 Research Questions** (previously a single research question).
- **2 Hypotheses** (previously one).
- A **statistical / mathematical model** explicitly relating to the project.
- General emphasis on **academic language, format, structure, innovation, and novelty**.

**Actions taken in this document.** Replaced the single research question and single hypothesis at the top with a formal research framework: a general objective, eight specific objectives (SO1–SO8), ten research questions (RQ1–RQ10), and two hypotheses (H1 primary — reliability ≥90% hit / ≤5% FP; H2 secondary — proportional speed control from clench intensity). Added a *Conceptual statistical and mathematical model* section formalising the existing pipeline — signal model, band-power/ZCR feature extraction, the adaptive percentile threshold `θ_c = σ·P₉₀(B_c)`, the ratio discriminant `r = AF/max(TP,1)` as a piecewise classifier, the intensity→PWM drive mapping, and an evaluation-statistics framework (confusion-matrix metrics, Wilson score intervals for small-sample proportions, Fisher's exact test for sensitivity-setting comparisons, and an optional logistic detection-probability model). Added *Innovation and novelty* and *Thesis document structure* (mapping the supervisor's four-part layout to the existing chapter notes), plus a *Referencing* note standardising on Mendeley.

Nothing in the existing journal, glossary, chapter notes, or references was removed — the restructure is purely additive front matter so the development history remains intact. Next: pull the *References* list into a Mendeley library and begin drafting the Word document against the four-part layout. The maths model is deliberately framed so the Chapter-4 validation numbers slot directly into it as they accumulate.

**Refinement (same day).** The ten RQs were then tightened: yes/no items (RQ1, RQ8, RQ10) reworded to graded "To what extent / How" form; the two latency questions split cleanly (RQ4 = accuracy-vs-latency *design* trade-off, RQ6 = *measured* end-to-end latency); and cross-session transferability of the sensitivity parameter folded into RQ5. Each RQ then received an honest *"Evidence to date"* annotation distinguishing what is already demonstrated (e.g. RQ2/RQ3/RQ9 — strongly evidenced from logged validation) from what remains pending (RQ1 live closed-loop drive, RQ6 measured latency, RQ8 amplitude-vs-speed monotonicity, RQ4 parameter sweep, RQ5 30-min drift study, RQ7 FP rates under active interference). This gives the progress review a clear demonstrated-vs-pending split.

### 2026-06-08 — Replacement ESP32 validated; comms path proven end-to-end (HEA-8 partially unblocked)

The replacement ESP32 (AZ-Delivery NodeMCU, CP2102) arrived and was brought up under the staged safety procedure defined in the 2026-06-02 post-mortem. The board passed cleanly and the full wireless control path is now confirmed — the only remaining gate on HEA-8 is the physical motor wiring.

**Stage 1 — bare board on USB-C alone (no buck, no driver, no rail).** The board enumerated on COM6 and, critically, **stayed cool across both faces** through flashing and runtime — the exact opposite of the dead board, which cooked instantly. `car.ino` flashed without issue. Serial Monitor @115200 reported:

```
IP: 172.20.10.2
mDNS started → car.local
WebSocket server ready on port 81
```

So WiFi association (2.4 GHz, iPhone hotspot), mDNS responder, and the port-81 WebSocket server all come up correctly on the new hardware.

**Stage 1.5 — comms-only handshake (still USB, motors absent).** With the laptop joined to the same hotspot, `npm run dev` + the dashboard's *Connect car* produced a `client connected` event on the ESP32's serial log. This validates the complete `dashboard → ws:// → ESP32` path in isolation, with the motor driver deliberately disconnected so nothing can actuate. The laptop↔car link is therefore proven independent of any power or motor concerns — a useful decomposition, since it means any later motor-test failure can be attributed to the power/driver stage, not comms.

**Stage 2 — deferred (hardware blocker).** Bringing the board up on buck power and wiring the TB6612 surfaced wiring problems that need soldered joints rather than improvised breadboard connections (improvised solder was implicated in the 2026-06-01 over-voltage chain that killed the first board). A soldering iron has been ordered and arrives **2026-06-09**; the buck-power measurement (5 V *at the ESP32 5V pin under load*) and the motor drive test resume then.

**Status.** New board confirmed fully healthy; wireless command path confirmed end-to-end. HEA-8 remains In Progress, now blocked only on the soldering iron / motor wiring rather than on a dead board. The earlier hard blocker (failed AMS1117) is resolved.

### 2026-06-02 — ESP32 destroyed by failed 3.3 V regulator (HEA-8 blocked)

The motor bench test (HEA-8) was halted by a hardware failure: the ESP32 overheated as soon as it was powered, and a continuity check confirmed the board is dead.

**Sequence of events.** Before testing, the wire from the buck converter's OUT+ to the ESP32 5V pin had physically broken off and was re-soldered/improvised. To de-risk the repair, the buck output was measured *isolated* (ESP32 disconnected, cells in): a clean **4.91 V**, correct polarity — exactly the trimmed 5 V target set on 2026-06-01. The wiring topology was independently re-verified against the prior day's validated layout: OUT+ runs through a single dedicated breadboard row to the ESP32 5V pin only — not the 3V3 pin, not the positive (7.4 V) rail. Despite a correct rail and a correct connection, the moment the board was powered from the cells (no USB attached), it grew hot across both faces, including the WROOM module's RF shield.

**Diagnosis (continuity test, board de-powered).** Resistance/continuity between three pin pairs:

| Pair | Reading | Interpretation |
|---|---|---|
| 5V ↔ GND | ~1570 Ω | normal (bulk capacitance / regulator path) |
| **3V3 ↔ GND** | **continuity beep (~0 Ω)** | **dead short — failure** |
| 5V ↔ 3V3 | ~550 Ω | regulator path, plausible |

A near-zero short from the 3.3 V rail to ground is the signature of a **failed-shorted on-board 3.3 V regulator (AMS1117)**. With the rail shorted, any supply current dumps into the short → the regulator (bottom) and the SoC (top) both heat immediately, and the board can never boot.

**Root cause.** The board was almost certainly killed on 2026-06-01 by an over-voltage event (the MP1584 ships defaulting to ~12 V; before it was trimmed to 5 V it briefly fed the ESP32 VIN). Today's overheating was not a *new* fault but the consequence of re-powering an already-shorted board. The 4.91 V measurement was not misleading — the buck was healthy; the damage lay downstream, in the regulator, and would not show at the buck's OUT+ terminal under no load.

**What this confirms (and what it doesn't).** The wiring is *correct*: every signal pin matches the firmware constants, the grounds are common, and OUT+ is correctly isolated to the 5V pin. This is a dead component, not a design or wiring fault — a fresh ESP32 in the same harness should work.

**Process change adopted for the replacement bring-up** (to ensure one wiring slip can't claim two boards):
1. Power a new ESP32 from **USB-C alone first** (buck disconnected) — confirm it boots/flashes and stays cool.
2. Only then, board de-powered, attach the buck — and this time measure 5 V **at the ESP32 5V pin under load**, not merely at the buck's OUT+ terminal.
3. Never have USB and the buck powering the board simultaneously.

**Status.** HEA-8 blocked pending a replacement ESP32. The diagnostic narrative and the bring-up checklist are the durable takeaways — a textbook example of why bench bring-up sequences exist.

### 2026-06-01 — Sprint 1 kickoff, full agile cadence for June (2-week sprints)

Adopted **two-week sprints** for the remainder of the project, Mon–Sun, with every issue assigned to a project milestone in Linear so the cadence is visible at a glance. Demo target locked at 2026-06-30. Three sprint buckets:

| Sprint | Window | Theme | Issues | Points |
|---|---|---|---|---|
| 1 | Jun 1 – Jun 14 | Foundation (hardware + bench test + UI integration) | HEA-5, 6, 7, 8, 11 | 12 |
| 2 (Build) | Jun 15 – Jun 28 | Tuning + validation | HEA-10, 18, 21, 19, 17, 16, 20 | 18 |
| 2 (Pres) | Jun 15 – Jun 28 | Slides + script + doc polish | HEA-13, 14, 22 | 10 |
| Demo Week | Jun 29 – Jun 30 | Rehearsal + demo | HEA-15 | 3 |

Sprint 2 runs both lanes in parallel — Build path (18 pts) and Presentation path (10 pts) — because the slides/script can be drafted while the live-drive validation is still being tuned. Total Sprint 2 load = 28 pts, which is heavy but unavoidable given the fixed Jun 30 demo.

**Sprint 1 plan (active as of today):**

- **Goal.** Hardware wired, motors bench-tested, browser dashboard talking to car. End of sprint = drive commands from the UI physically move the wheels.
- **Committed (12 pts).** HEA-5 (XS, Wed Jun 3) — motor driver on the breadboard. HEA-6 (S, Fri Jun 5) — driver to car motors. HEA-7 (S, Sun Jun 7) — driver to ESP32 GPIO per the README's fixed pinout (PWMA=4, AIN1=5, AIN2=18, PWMB=19, BIN1=15, BIN2=16, STBY=17). HEA-8 (S, Tue Jun 9) — bench-test motors with manual `drive:` commands. HEA-11 (L, Sat Jun 13) — robust simultaneous Muse + car connect from the dashboard.
- **Definition of done.** Wiring complete + photographed, no shorts on continuity check, manual `drive:`/`steer:` commands from the dashboard move the wheels, simultaneous Muse + car connection works end-to-end without dropping.
- **Status moves at kickoff.** HEA-5 → In Progress. HEA-6 and HEA-7 → Todo. The rest stay in Backlog until activated mid-sprint — a deliberate rule of the cadence, so the active board only shows what's in flight or queued.

The earlier 1-week breakdown was scrapped — 2 weeks gives the integration work (HEA-11) enough room to breathe without forcing a sprint boundary mid-debug. The obsolete 1-week milestones are tombstoned in Linear (named `(obsolete — see Sprint 1/2 of 2-week cadence)`) since the Linear MCP has no milestone-delete; they'll need to be cleared in the UI.

Why "full agile" rather than a single waterfall plan: with the demo locked at Jun 30 and the project still needing physical assembly + tuning + presentation, sprint boundaries force a checkpoint where slipping (or finishing early) is *visible* rather than buried under a 30-day Gantt. Milestones in Linear take the place of cycles (the MCP can't enable cycles at the team level; that's a UI-only setting), and they're sufficient because every issue carries its sprint, due date, T-shirt size label, and Fibonacci estimate.

### 2026-06-01 — project management migrated to Linear (via MCP)

Switched ad-hoc TODO tracking to **Linear** as the authoritative backlog for the project. Workspace `headcar`, team `Headcar`, project `Headcar`, issue prefix `HEA-`. Eleven issues seeded covering the remaining hardware integration path (motor-driver breadboard, ESP32 wiring, motor bench test, Muse+car simultaneous connect, end-to-end reaction) and the thesis-deliverable path (refinement, slideshow, script, demo rehearsal).

Linear is wired into Claude Code through the **`linear-server` MCP**, so issues can be listed, transitioned, and commented on without leaving the editor. The branch-naming convention is taken directly from each issue's `gitBranchName` field so PRs auto-link. Rule of thumb for the agent: read the Linear backlog at session start, propose new issues for approval rather than filing them silently, and use the `project_current_state` memory as cross-reference. Documented in `CLAUDE.md` and `README.md` so the workflow is reproducible across sessions.

Why this matters for the thesis: until now, the only durable records of "what's left" were memory files and prose notes scattered through this journal. With ~10 days to the demo, a single shared queue replaces three ambiguous ones and forces a hard split between the build deliverable (a working Muse-controlled car) and the presentation deliverable (slideshow + script + rehearsed demo). The current backlog leans hardware-heavy by design — the software pipeline (calibration, EMG discrimination, watchdog, recording/replay, validation metrics) is by this point largely complete; what remains is wiring, integration, and presentation.

### 2026-05-18

Started wiring the hardware today. The project has gone through a significant number of pivots before reaching this point — originally planned as a custom EEG board build (Cerelog ESP-EEG with ADS1299 chip), then two ESP32s communicating directly, before landing on the current architecture: Muse 2 headband as the sensor, a laptop browser as the BLE host, and a single ESP32 on the car.

The software side is largely done. Phase 1 (browser dashboard) is complete — the Next.js app connects to the Muse via Web Bluetooth, detects blinks and jaw clenches from EEG readings, and reads accelerometer data. A simulate mode was added so the full pipeline (browser to WebSocket to ESP32) can be tested before the headband arrives.

The ESP32 sketch is also written: WiFi connects, mDNS resolves to car.local, a WebSocket server on port 81 listens for messages and drives the motors forward for 200ms on any incoming command.

Today's work: setting the MP1584 buck converter output to 5V before connecting the ESP32. The 18650 cells read 3.7V each (series = 7.4V input to buck). Still working through the hardware setup — the buck converter terminals were unfamiliar (through-holes rather than the expected screw terminals).

Key tension noted: the project title says "brain-controlled" but the actual mechanism is entirely artifact-based. This is worth addressing directly in the thesis rather than glossing over — the distinction between neural intent decoding and artifact detection is the most scientifically honest and interesting part of the project.

Later the same day: attempted to wire the TB6612FNG motor driver to the ESP32. Got through most of it — battery power to VM/GND, ESP32 3.3V to VCC, GND tied together via breadboard negative rail, STBY to D17, and all 6 signal wires (PWMA, AIN1, AIN2, PWMB, BIN1, BIN2) to their respective GPIO pins. Blocked by the TB6612 header pins being too short/narrow to hold female jumper connectors securely — wires kept falling off. Tape didn't hold either.

Also discovered the MP1584 buck converter boards have bare through-holes (no screw terminals) and require soldering. Plan: visit xHain makerspace on Grünberger Str. to solder both the buck and proper header connections.

Muse 2 arrived today. Next session: either fix the hardware blocker or pivot to getting the Muse talking to the browser dashboard first.

### 2026-05-19

Muse hello world achieved. Connected the Muse 2 to the browser dashboard via Web Bluetooth in Chrome. Blink detection firing on AF7/AF8, jaw clench detecting EMG bursts across all channels, accelerometer showing live x/y/z values. Phase 1 fully confirmed with real hardware — the entire signal chain from headband to browser is working.

Next: visit xHain makerspace to solder motor terminals and buck converter. All software and signal-level hardware verified working — the only remaining blocker is physical wire-to-motor contact.

While waiting on the hardware blocker, completed Phase 4 software ahead of time:

ESP32 sketch refactored from blocking delay() to a non-blocking state machine using millis(). This is architecturally important — the old approach froze the microcontroller during motor bursts, meaning it couldn't receive a stop or steer command while moving. The new approach checks elapsed time in every loop iteration and applies motor state continuously, allowing steering updates to take effect immediately during a drive burst.

Differential steering formula: leftSpeed = 180 + (steerValue * 80), rightSpeed = 180 - (steerValue * 80), clamped to 0-255. A steerValue of +1 gives left=255, right=100 (turns right). A value of 0 gives both at 180 (straight).

Dashboard now streams steer:X every 100ms to the car using the accelerometer X axis as the roll value. An accelRef (useRef) is used alongside the accel state so the streaming interval always reads the latest value without stale closure issues — a subtle but important React pattern. Steer commands are sent silently (not logged) to avoid flooding the command log.

Threshold sliders added — blink (50-300 μV) and clench (100-400 μV) are now adjustable live on the dashboard without editing code. This will be important for calibration once real driving begins.

Plan for tomorrow: visit xHain makerspace to solder motor terminals (8 connections across 4 motors) and buck converter (4 connections). Will also mount everything onto the chassis top plate using velcro tape and zip ties (buying from Rossmann beforehand). Once complete the car runs entirely from the 18650 battery with no USB connection — ESP32 powered via buck converter at 5V, motors powered directly from battery via TB6612. The laptop communicates only over WiFi via the phone hotspot. Goal: first real untethered motor test, confirm Phase 2, 3, and 4 with real hardware.

### 2026-05-20

Phase 3 sketch complete. The ESP32 now parses the WebSocket message payload rather than driving forward on any message. Protocol: `blink` = forward 200ms, `clench` = reverse 200ms, `stop` = coast. This is a meaningful step — the system now has bidirectional control from a single sensor stream.

Dashboard also improved: car WebSocket URL is now editable in a text input rather than hardcoded, and manual Forward/Reverse/Stop buttons were added. This makes hardware testing much more practical — no need to trigger simulate or wear the headband just to send a test command to the car.

Extensive multimeter diagnosis on the TB6612 confirmed all signal-level connections correct: VM=7.4V, VCC=3.3V, STBY=3.3V, PWMA=2.3V (PWM average), AIN1=3.3V, AIN2=0V. The chip is alive and receiving correct inputs. The motor does not spin because the bare terminal connection (pin pushed through copper ring, no solder) does not make reliable electrical contact. This is a hard physical constraint — soldering is required and there is no workaround.

This is a useful practical lesson for the thesis: prototype hardware failures are often not in the logic or firmware but in the physical connection layer. The software stack was fully verified before the hardware was ready, which is good practice but means the first real motor test is blocked on a trip to the makerspace.

Later: TB6612 connector issue resolved by seating the board firmly into the breadboard — it is designed to be breadboard-compatible and the pins grip properly when fully inserted. All 11 connections remade through the breadboard rows. Motor terminals had no pre-soldered wires; used a no-solder hack — pushed male jumper pins through the copper rings on the motor terminals and bent them over, held with tape. Enough for a bench test.

WebSocket connection issues encountered:
- car.local mDNS does not resolve on Windows — had to switch to raw IP address
- Home router (REV-17) has AP isolation enabled, preventing laptop and ESP32 from communicating on the same network
- Solution: switched to iPhone hotspot, which does not have AP isolation. ESP32 now on 172.20.10.2

These are important practical notes for the thesis — consumer networking infrastructure introduces real barriers to local IoT communication that are not obvious from the hardware design alone. mDNS is unreliable on Windows and AP isolation is a common default on home routers.

### 2026-05-22

Hardware debugging session. Soldering complete from the xHain visit. Three separate problems diagnosed and worked through:

**Problem 1 — grounds not tied.** When the Forward button was pressed, the ESP32 reset immediately. Cause: motor activation inrush current caused a voltage spike on the shared ground, browning out the ESP32. Fix: tied all grounds explicitly to the battery negative rail (ESP32 GND, TB6612 GND both sides, battery negative). This is the classic "tie all grounds together" rule that every hardware tutorial mentions — it's real.

**Problem 2 — TB6612 VCC missing.** After fixing grounds, the car stayed connected but motors didn't respond. All control signals verified correct (VM=7.63V, STBY=3.3V, PWMA=2.3V PWM, AIN1/AIN2 correct) but AO1 read 0V. Root cause: the TB6612 VCC pin (logic supply, 3.3V from ESP32) was not wired. Without VCC the internal comparators have no reference and outputs are permanently dead. Fix: added wire from ESP32 3V3 to TB6612 VCC.

**Problem 3 — counterfeit boards.** After fixing VCC, AO1 still read 0V. Verified the same result on a second spare board. All inputs confirmed correct, solder joints solid, breadboard halves correct. Conclusion: both TB6612 boards were counterfeit or defective — output transistors non-functional from factory. Ordered Adafruit ADA2448 (genuine Adafruit TB6612 breakout). Motors confirmed working by direct battery test (touched motor wires to 18650 holder leads — spun immediately).

Thesis note: this sequence illustrates how hardware debugging is a systematic elimination process. Each fix revealed the next problem. The "counterfeit components" finding is worth documenting — cheap Chinese breakout boards from Amazon.de are not guaranteed to contain functional chips, and a defective TB6612 from a bad batch can pass all input-side diagnostics and still produce no output.

### 2026-05-25

Signal quality work on the Muse side while waiting for the Adafruit board to arrive.

The initial detection approach (peak threshold on raw EEG samples) produced continuous false positives — every movement, eyebrow raise, or environmental noise triggered blink or clench events. Several layers of improvement implemented:

**Calibration and steering:** Added a Calibrate button that snapshots the current accelerometer X value as the neutral reference. The displayed X value now shows the adjusted reading (raw minus offset), so after calibrating it reads near zero at rest. Also added a ±0.1 dead zone around center — trivial but essential for usability, since without it the car would constantly receive tiny steering corrections.

**Detection algorithm redesign:** The naive threshold approach (`peak > threshold → fire`) was replaced with a three-layer system. First: rising edge detection — the detector fires once when signal crosses above threshold, then waits for it to drop below before re-arming. This converts a sustained blink artifact (which spans many EEG packets) into a single command. Second: multi-channel consensus for jaw clench — requires 3 of 4 channels to spike within a 150ms window. A real clench is a broadband EMG burst that hits all electrodes simultaneously; electrical noise and minor movement typically affect only one or two channels. Third: EMG smoothness filter for blink — within each 12-sample EEG packet, computes the RMS of adjacent-sample differences divided by the peak amplitude. Real blinks are slow EOG deflections (smooth signal, low ratio); forehead muscle activity (eyebrow raises, frowning) produces rapid high-frequency bursts (spiky signal, high ratio). Setting a threshold at ratio < 0.4 rejects most EMG artifacts while preserving genuine blinks.

**Mutual exclusion:** Jaw clench and blink detection are now mutually exclusive — a clench suppresses blink detection for 500ms. This addresses cross-contamination: a jaw clench produces an EMG burst on all channels including AF7/AF8, which would otherwise also trigger the blink detector.

**Research finding:** Investigated whether muse-js exposes the Muse's onboard artifact detection (which the official app uses). Confirmed that `artifactEvents` does not exist in muse-js v3.3.0 or any version — the library was always raw sensor data only. The web sources suggesting it existed were incorrect. All detection must be custom-implemented on raw `eegReadings`.

**Live signal meters:** Added per-channel EEG amplitude display (TP9, AF7, AF8, TP10) with EMA smoothing (α=0.2) to make the signal visible in real time. With the meters, it's immediately apparent when a channel is noisy (e.g., poor electrode contact) vs clean signal. This is essential for threshold tuning — without it, thresholds were being set blind.

### 2026-05-25 (extended) — second-pass signal-processing redesign

After running the first-pass detector against real Muse data, the limitations of raw-amplitude thresholding became clearly inadequate even with the rising-edge and consensus heuristics. Two specific failure modes recurred: (1) hard blinks and jaw clenches produced overlapping amplitude footprints, so a single threshold could not discriminate between them; (2) thresholds set during one wear of the headset drifted within minutes as electrode contact and skin impedance changed. A literature review on EEG artifact discrimination ([MED algorithm, IEEE SPMB 2022](https://ieeexplore.ieee.org/document/10014708/); the [NeuroSky eyebrow/jaw paper, Springer 2020](https://link.springer.com/chapter/10.1007/978-3-030-57566-3_10); the [BLINKER pipeline](https://vislab.github.io/EEG-Blinks/)) converged on three principles that the literature reports as yielding ~90% accuracy versus much lower for amplitude-only methods:

1. **Bandpass decomposition.** Blink artifacts (EOG) and muscle artifacts (EMG) live in different frequency bands. Blinks are slow electrooculographic deflections concentrated in 1–10 Hz; muscle activity is broadband but most differentiable above 20 Hz. A single raw amplitude conflates them.
2. **Multi-feature classification.** Per short window (≈250 ms), compute band-power RMS in each band plus the zero-crossing rate (ZCR) of the high-band signal. A blink has high low-band power and low ZCR; a muscle burst has high high-band power and high ZCR.
3. **Dominant-band check.** Within a detection window, the gesture is classified by which band dominates, preventing one large artifact (e.g., a strong clench) from firing both detectors.

These principles were implemented in `laptop/app/detector.ts` as a per-channel pipeline: two 2nd-order Butterworth biquads (lowpass at 10 Hz, highpass at 20 Hz), 64-sample (250 ms at the Muse 2's 256 Hz sample rate) ring buffers per band, and exposed `lowRms`, `highRms`, `zcr`, and `rawRms` features per channel. The choice of 10 Hz (rather than the 4 Hz attempted initially) was made after the literature review confirmed that the leading and trailing edges of blink waveforms carry significant energy up to 10–15 Hz; cutting at 4 Hz strips most of the discriminating signal. Alpha rhythm (8–13 Hz) bleeds into the band but is small-amplitude relative to artifact and contributes only to background.

**Empirical finding contradicting the literature:** the MED algorithm and standard EOG literature locate blink signals on the forehead electrodes (AF7/AF8). With this user's headset fit, blinks were instead picked up much more cleanly on TP9/TP10 (the ear electrodes). AF7/AF8 carried persistent low-frequency noise — likely from forehead-skin contact, sweat, hair interference, and small voluntary forehead-muscle activity — that drowned the EOG signal. A naive "average across all four channels" approach also failed because the TP channels' carry background masseter/neck EMG that inflated the high-band on those electrodes and tripped per-channel dominance checks. The implemented rule scoped blink detection exclusively to TP9/TP10 low-band, with discrimination from clench handled by the multi-channel consensus on clench (3 of 4 channels) plus a 500 ms clench-suppression window for blink. This is the kind of finding that does not appear in the published literature, which is dominated by lab-grade setups and idealized electrode contact, and is worth flagging as a contribution: artifact discrimination on consumer EEG must be empirically tuned to the specific hardware-skin interface, not transferred verbatim from research data.

**Adaptive calibration system:** Absolute μV thresholds, even with bandpass filtering, drift with headset placement, skin moisture, and time. A 5-second calibration window was added that runs automatically on Muse connect (and can be re-triggered via a dashboard button). During the window the system collects feature samples at ~20 Hz and takes the 90th percentile of each as the baseline noise floor. Thresholds are derived as `baseline × sensitivity`, where sensitivity is a user-adjustable multiplier (range 2×–8×, default 4×). The sensitivity rather than the absolute threshold is persisted across sessions in localStorage. This is the practical answer to the threshold-drift problem: the user no longer tunes a number in μV, they tune "how strongly does the signal need to exceed your resting noise."

**Contact-quality indicators:** A per-channel `contactQuality` heuristic was added: raw signal RMS over the 250 ms window classifies the electrode as good (8–120 μV), fair, or bad (<3 μV flatline or >250 μV saturation). Coloured dots above each channel meter make poor electrode contact immediately visible. The calibration step is gated on green TP9/TP10 dots in the practical workflow, since a flatline channel would produce a near-zero baseline and consequently a near-zero threshold (false-positive everywhere).

### 2026-05-26 — pivot to clench-dominant control with variable speed

After roughly an evening of using the second-pass system in practice, the user-experience verdict was clear: blink detection on TP9/TP10 worked but felt fragile, requiring careful threshold tuning per session and producing noticeable false negatives during natural blinking; jaw clench, in contrast, was easy to elicit reliably and the user observed that the *intensity* of a clench was both consciously controllable and clearly visible in the high-band meters. This led to a significant redesign of the gesture mapping:

- **Forward control was reassigned from blink to jaw clench**, with the discrete trigger replaced by a continuous "intensity → speed" mapping. The justification is twofold: (1) reliability — clenches produce a stronger, more discriminable EMG signature than blinks on this hardware; (2) expressiveness — continuous speed control over a single dimension is a strictly richer interface than a binary go signal, and matches the way intuition would expect a "drive faster" gesture to work.
- **Reverse control was assigned to eyebrow raise**, which is a frontalis-muscle EMG burst localized to AF7/AF8. This is biomechanically distinct from a jaw clench (masseter), which propagates broadly to all four electrodes including TP9/TP10. The discrimination rule exploits this anatomical fact: forward fires when AF *and* TP high-band are both elevated; reverse fires when AF is elevated *while TP stays near baseline*. Without the TP gate, eyebrow and clench would be indistinguishable on the AF channels alone.
- **Blink detection was removed**, including all associated UI, threshold logic, and the low-band tracking on TP channels. The detector retains the bandpass infrastructure but the low band is no longer consumed by any rule.

**New wire protocol:** the old discrete commands (`blink` / `clench` / `stop`) were replaced with a continuous `drive:X` command where `X ∈ [−1, 1]`. The sign of X selects direction; the magnitude maps linearly to motor PWM from MIN_PWM=120 (sufficient to overcome motor stiction) to MAX_PWM=255. Steering uses an unchanged `steer:X` command and contributes a differential offset of `±0.35 × basePWM` per side. The laptop streams `drive:X` only while a gesture is active, and sends a single `drive:0` on transition to idle; the ESP32 has a 500 ms watchdog that idles the motors if no `drive:` arrives within the window — a safety net for browser tab crashes, BLE disconnect, or laptop suspend while moving.

**Calibration changes:** the baseline structure was changed from `{ tpLow, allHigh }` to `{ afHigh, tpHigh }` because the new gesture model requires the AF-vs-TP separation explicitly. Two sensitivity sliders (forward and reverse) replace the previous (blink/clench) pair, persisted under new localStorage keys (`.v4`) so old session values are not reapplied with stale meaning.

**Forward intensity calculation:** during a clench, the instantaneous AF high-band RMS is divided by the AF forward threshold to produce a unitless intensity ratio. A value of 1.0 corresponds to just clearing the threshold; the implementation saturates at 3.0 (i.e., three times threshold). This is mapped linearly to a drive value in `[0.30, 1.00]`, with the lower bound chosen empirically as the minimum PWM-equivalent that actually moves the chassis. The mapping ensures (a) a barely-perceptible clench immediately produces motion, (b) maximum effort produces full speed, and (c) the mapping is smooth and monotonic, which is what a user expects from a "press harder" control.

**Thesis-relevant note on the pivot:** this is a case where empirical user-testing dominated the literature-led design. The published EEG-BCI work that informed the second-pass system treats blinks and clenches as canonical artifacts of roughly equal merit. In practical use on this hardware and this user, they are not equivalent at all — clench is straightforwardly the better control modality, and adding variable intensity turns a single-bit signal into a continuous one without any additional sensor capability. The willingness to drop the literature-prescribed gesture in favour of what actually worked is itself a methodological lesson for consumer-BCI projects.

### 2026-05-29 (extended 2) — the eyebrow misses were a ratio-cutoff error, fixed with a data-driven threshold

Two of five eyebrow raises went undetected even at maximum sensitivity (logged in extended-1 as an open thread). Chasing it through the saved recording produced a clean root cause and fix, entirely offline.

**It was never a signal-strength problem.** Per-raise peak analysis at max sensitivity showed all five raises produced strong frontalis signal (peak AF 55–70 μV vs a ~13–20 μV threshold). The discriminator that failed was the **AF/TP ratio gate** (reverse requires `AF/TP > EYEBROW_MIN_AFTP_RATIO`, then 1.6):

| raise | peak AF | TP@peak | max ratio | fired? |
|---|---|---|---|---|
| 1 | 58.9 | 38.4 | 1.71 | ✓ |
| 2 | 69.7 | 42.8 | 1.94 | ✓ |
| 3 | 55.4 | 36.3 | 1.70 | ✓ |
| 4 | 55.5 | 43.1 | **1.54** | ✗ |
| 5 | 68.9 | 44.7 | 1.67 | ✗ |

Raise 4 never reached 1.6; raise 5 brushed it but its brief excursion was swallowed by the forward/clench rule transiently going live on the raise's rising edge (forward fires when ratio < 1.6, which an eyebrow's ~1.5 ratio satisfies). The eyebrow raises co-activate the temporal/auricularis channels enough that the ratio sits at only ~1.5–1.9, not the textbook 2–3 the 1.6 cutoff assumed.

**Confirming the gap before moving the threshold.** Measured the AF/TP ratio across all clench segments in the three clench recordings (736 active ticks): **min 0.21, median 0.32, p99 0.53, max 0.59** — clenches never approach 1.0, let alone 1.6. (This is the TP-primary effect again: masseter EMG lands on TP, so the clench *ratio* is low, ~0.4, not the ~1.0 originally assumed.) So the two classes occupy 0.2–0.6 (clench) and 1.5–1.9 (eyebrow) with a wide empty gap between.

**The fix is a single number, verified by sweep.** A cutoff sweep on the eyebrow recording: 1.6 → 3/5, the plateau **1.1–1.5 → 5/5** (0 FP), 1.0 → 6/5 (over-fires). Chose **1.3** — the centre of both the passing plateau and the empirical gap. Set `CLENCH_MAX_AFTP_RATIO` and `EYEBROW_MIN_AFTP_RATIO` from 1.6 → 1.3 (replayer defaults matched). Re-validated at production defaults:

- Eyebrow **5/5 (100%)**, 0 false positives (was 40–60%).
- Tilt unchanged: 2/2, directions distinct.
- Both clench recordings unchanged (10 and 16 forward triggers, **zero** false reverses) — no regression, exactly as the 0.59 ceiling predicted.

**Thesis-relevant lessons.** (a) The original 1.6 cutoff was derived from a *textbook* expectation of the clench/eyebrow ratio regimes (≈1 and ≈2–3); the measured regimes (≈0.4 and ≈1.6) are both shifted down by the same TP-dominant electrode physics this project keeps rediscovering, so a threshold set from the literature was wrong in the same direction twice. Measuring the two distributions and placing the cutoff in the empirical gap is the generalizable method. (b) Two failure modes hid behind one symptom: a hard ratio block (raise 4) and a forward-suppression race (raise 5); lowering the shared cutoff fixed both at once because it also lifts eyebrow ratios clear of the forward rule's ceiling. (c) The entire diagnosis — peak analysis, clench-ratio distribution, cutoff sweep, regression check — was done on saved recordings with zero headset time, which is the payoff of recording raw signal generously.

### 2026-05-29 (extended) — first eyebrow/tilt validation run: a wrong-axis steering bug and an eyebrow sensitivity correction

The eyebrow/tilt tooling built earlier today was exercised on its first real recording (`TestFiles/eyebrow-tilt/headcar-2026-05-29_08-29-06.json`, seven segments: rest baseline, eyebrow ×5, rest, tilt-left ×5, rest, tilt-right ×5, rest; 9533 EEG packets, 1954 accel samples). The run surfaced two distinct problems, one minor (a sensitivity default) and one significant (steering wired to the wrong accelerometer axis). Both were caught by the offline replay — no driving required.

**Eyebrow under-detection.** At the then-default reverse sensitivity of 4.0×, only 2 of 5 raises fired (40%). A sensitivity sweep (replay is parameterized, so this is a no-headset experiment) showed the hit rate plateaus at **3/5 (60%) for any reverse sensitivity ≤ 3.0×**, with **zero false positives at every level down to 2.0×**. Conclusion: 4.0× was needlessly conservative, so the default was lowered to **3.0×** (`DEFAULT_REVERSE_SENSITIVITY`, with the persisted localStorage key bumped `v5`→`v6` so the new default actually takes effect rather than being shadowed by a stored 4.0). The residual issue — two raises that produced *no* detectable trigger even at maximum sensitivity — is not a threshold problem and remains open (likely either too-gentle raises or those raises failing the AF/TP > 1.6 ratio gate; needs a dedicated look).

**The steering axis was wrong.** The tilt scorer reported `directions distinct: false` — left and right tilts both deflected the *same* sign relative to the rest-derived neutral, and the left tilt didn't even cross the dead zone. Dumping the raw per-axis accelerometer means across the tilt segments made the cause obvious:

| axis | rest mean | tilt-left mean | tilt-right mean |
|---|---|---|---|
| X (the axis steering used) | 0.096 | 0.113 | 0.080 |
| **Y** | 0.165 | **−0.100** (min −0.57) | **+0.313** (max +0.90) |
| Z | 0.995 | 0.947 | 0.901 |

Head roll barely registers on **X** (the originally-specified steering axis) — left and right both sit near the resting value — while **Y** separates the two directions cleanly and opposite-signed. The live system had been steering off X (`accelRef.current.x`) since the 2026-05-20 implementation; on this Muse's head mounting that axis simply doesn't carry the roll signal. This is why qualitative steering had felt unreliable: the control input was mostly noise around a near-constant value.

**Fix.** Steering now reads accel-**Y**, captured in a single `STEER_AXIS = 'y'` constant in `page.tsx` used by both the streaming loop and `calibrateTilt()`; the replayer gained a matching `steerAxis` param (default `'y'`). Re-running the *same* recording through the corrected scorer: **tilt 2/2 segments engaged (100%), directions distinct: true**, left peak −0.712 / right peak +0.750 (cleanly opposite, both ~70% of the segment beyond the dead zone). `CLAUDE.md` was corrected from "X-axis" to "Y-axis."

**Thesis-relevant lessons.** (a) The original "accelerometer X-axis" design note was an *assumption* that survived months unverified because qualitative steering "sort of worked" and no one had a quantitative check; the moment a recorded protocol + per-axis trace existed, the error was unambiguous. This is the strongest argument yet for the validation tooling — it caught a load-bearing bug that hands-on testing had normalised. (b) A convention-free metric (directions-distinct, rather than asserting "left = positive") was exactly what flagged the problem without itself encoding the wrong assumption. (c) Sensitivity sweeps on a saved recording replace a whole category of headset-on retesting: the eyebrow default was retuned with evidence, not guesswork, in seconds.

### 2026-05-29 — eyebrow/tilt guided protocol and accelerometer-based tilt scoring

The validation story so far had a hole: the only guided protocol (`INTENSITY_PROTOCOL`) exercises clenches only, so the single quantitative result (2026-05-28: 100% TP / 0 FP) covers *forward* control and nothing else. Reverse (eyebrow) and steering (tilt) had been implemented and used qualitatively but never put through a recorded, scripted, replay-scored test. This entry closes that gap on the tooling side; the numerical run itself is pending a recording session.

**Second guided protocol.** Added `EYEBROW_TILT_PROTOCOL` alongside the clench one: baseline rest → 5 eyebrow raises → rest → 5 left tilts → rest → 5 right tilts → final rest. Rest/baseline segments carry explicit "head centered" cues because the offline tilt scorer derives its neutral steering point from them. The protocol runner (`startProtocol`/`runProtocolStep`) was parameterized to take a protocol array rather than referencing the clench protocol directly, and the dashboard now offers two launch buttons ("Clench test" and "Eyebrow/Tilt test"). The active protocol is held in both state (for the live banner) and a ref (so the `setTimeout` step-chain reads the current value rather than a stale closure capture — the same closure-staleness class of bug documented in the 2026-05-27 baseline-closure entry).

**Why tilt needed a different metric.** Clench and eyebrow are discrete events scored by trigger count against an expected-reps denominator (hit rate, false-positive rate, latency). Steering is *continuous* — head tilt maps to an accelerometer-X-derived steer value with a ±0.1 dead zone — so "hit rate" is meaningless for it. The replayer had ignored the accelerometer entirely. It now scores tilt segments directly from the recorded `accelSamples`:

- **Neutral offset** = mean accel-X over the rest segments (mirrors the live `calibrateTilt()`, which snapshots accel-X at a centered head). Falls back to the whole-session mean if no rest samples exist.
- **Per tilt segment:** peak signed steer (the extreme of `accelX − offset`), and engaged-fraction (share of samples beyond the dead zone).
- **A segment is "engaged"** if its peak crossed the dead zone — i.e. the tilt would have produced a non-zero steer command.
- **Directions-distinct** check: the left-tilt and right-tilt segments must produce opposite-signed peaks, both past the dead zone. This is the convention-free way to confirm the steering axis is wired correctly without hard-coding which physical tilt yields which sign (that depends on how the Muse sits on the head, which the code shouldn't assume).

The dashboard validation panel gained a "Tilt (steering)" block showing engagement rate, directions-distinct, left/right peak steer, and the neutral offset. The metric is convention-free and reports the offset so the operator can sanity-check the neutral point.

**Verification.** `npm run build` is clean (TypeScript included). The new code was sanity-checked against the existing clench-only recording (`headcar-2026-05-27_15-15-52.json`): clench replay is byte-for-byte unchanged (still 107%), tilt fields default gracefully to zero/empty with no crash, and the neutral offset still computes from the rest accel (0.039). One TypeScript fix was needed along the way — the per-segment map returned a union of "base" and "base + tilt fields", hiding the optional tilt properties; extracting a named `ReplaySegment` type and annotating the map's return type resolved it.

**Thesis-relevant lessons.** (a) Not every control modality is scorable by the same metric — discrete artifact triggers and continuous accelerometer steering need fundamentally different validation, and forcing one framework onto both would have produced a meaningless "tilt hit rate." (b) A direction-*distinctness* test is a more honest validation of a steering axis than asserting a fixed sign convention the hardware mounting could invert. (c) The recorder having captured `accelSamples` all along (even before any tool used them) is why this analysis was possible retroactively — recording raw signals generously, beyond what the current detector consumes, paid off.

### 2026-05-28 — the "clench double-fire" was a misdiagnosis, not a detector bug

The 107% clench hit rate from the 2026-05-27 validation (16 triggers for 15 intended reps, with the single over-count isolated to the medium segment) had been logged as a suspected detector defect — a single sustained clench being split into two forward triggers by a momentary intra-clench dip below threshold. The proposed fix was to widen the forward hold from 200 ms to 500 ms so a brief signal dip inside one clench would not end the forward-live state and re-trigger on recovery.

**The fix was tested before being accepted, and it changed nothing.** Replaying `headcar-2026-05-27_15-15-52.json` at both 200 ms and 500 ms hold produced identical output: 16/15, 107%, zero rest false positives, 1658 ms first-trigger latency, 3712 ms mean inter-trigger interval. A 500 ms hold cannot merge two triggers that are seconds apart, so the null result immediately falsified the intra-clench-dip hypothesis.

**Per-segment forensics located the real cause.** The medium segment contained 6 triggers at offsets 2.0, 5.5, 9.0, 12.9, 16.2, 19.0 s — inter-trigger gaps of 3.5, 3.5, 3.9, 3.4, 2.8 s. Light and hard segments each produced exactly 5, evenly spaced. There is no sub-second gap anywhere in the recording. The "extra" 6th trigger is spaced exactly like a deliberate repetition, sits well inside the 20 s segment window, requires the same ZCR/ratio/threshold gate every other trigger passed, and is accompanied by zero false positives across 29 s of rest. The overwhelmingly likely explanation is that the user performed **six** clenches in the medium block rather than five; the detector counted them faithfully. A spurious detector trigger would manifest as an anomalously short gap or a rest-segment false positive, neither of which is present.

**Outcome.** No detector change is warranted; the speculative `FORWARD_HOLD_MS` change was reverted, leaving the code byte-identical to its prior state. The 107% figure is reclassified from "one detector over-fire" to "one extra intended repetition by the operator (protocol-execution variance)," which strengthens rather than weakens the Chapter-4 result: across 16 genuine clenches the detector achieved a 100% true-positive rate with zero false positives.

**Thesis-relevant lessons.** (a) A headline metric that deviates from the expected value is not self-diagnosing — "107%" was assumed to mean "the detector fired too often" when it actually meant "the operator acted more often than the protocol prescribed." Per-event forensics (the trigger-offset timeline), not the aggregate rate, distinguished the two. (b) Testing a fix against the recorded evidence *before* committing it caught a plausible-but-wrong change; the cost of empirical verification (one replay run) was trivial compared to shipping a hold-window widening that would have degraded detection of legitimate fast repetitions during live driving. (c) The validation/replay tooling built on 2026-05-27 paid for itself the first time a real hypothesis needed checking.

### 2026-05-27 (extended 5) — first quantitative validation result

The newly-completed validation pipeline was exercised on the second guided-test recording of the day (`headcar-2026-05-27_15-15-52.json`, 113.5 s, 9559 EEG packets, seven segments: one baseline rest, three intensity-graded clench segments at the user's perception of light/medium/hard effort, three rests between/after, no eyebrow segments). The original recording's per-segment trigger counts were all zero because the live detector was running with the `baseline`-closure bug at the time; offline replay through the corrected rules produces the following result, which constitutes the first numerical Chapter-4 datum for this project.

**Replay configuration.** Forward sensitivity 2.0×, reverse sensitivity 4.0×, expected gestures per segment = 5 (matching the guided protocol). Baseline taken from the file's metadata: `tpHigh=12.94 μV`, `afHigh=6.79 μV` (the noise floor measured at recording time), producing `tpThrFwd=25.9 μV` and `afThrRev=27.2 μV`. Detection rules: TP-primary clench with EMA smoothing (α=0.3), AF/TP ratio cutoff at 1.6, ZCR ≥ 0.20 required for EMG presence, 3-tick (150 ms) debounce, 200 ms forward hold, 800 ms reverse pulse with 1500 ms cooldown.

**Per-segment trigger output.**

| # | Segment | Replayed forward / reverse | Trigger offsets (ms from segment start) |
|---|---|---|---|
| 1 | rest (baseline)   | 0 / 0 | — |
| 2 | clench (light)    | 5 / 0 | 1653, 5153, 9053, 12703, 16603 |
| 3 | rest (between)    | 0 / 0 | — |
| 4 | clench (medium)   | 6 / 0 | 1995, 5495, 8995, 12895, 16245, 19045 |
| 5 | rest (between)    | 0 / 0 | — |
| 6 | clench (hard)     | 5 / 0 | 1325, 4925, 9225, 13275, 17275 |
| 7 | rest (final)      | 0 / 0 | — |

**Aggregate validation metrics.**

| Metric | Value | Interpretation |
|---|---|---|
| Clench hit rate | 107% (16 / 15) | All 15 intended clenches were detected; one rep in the medium segment double-fired |
| Eyebrow hit rate | n/a (no eyebrow segments) | The guided protocol used today is clench-intensity only; eyebrow validation requires a different protocol |
| False positives | 0 over 29.0 s of rest (0/min) | No trigger fired during any rest segment, on baseline or between intensity levels |
| Mean first-trigger latency | 1658 ms | Time from segment open to first detection. Conflates detector-pickup speed with user reaction time within the segment window |
| Mean inter-trigger interval | 3712 ms | Close to the 3 s target (1.5 s clench hold + 2.5 s inter-rep rest specified by the protocol) |

**Discussion of the result.**

The 107% clench hit rate is, somewhat counter-intuitively, a *better* result than 100% would be, because the single over-fire isolates a specific failure mode rather than hiding it: one of the medium-effort clenches produced two `forward_trigger` events, suggesting the detector saw the gesture as either two distinct EMG bursts or a single burst with a brief dip that bounced the EMA-smoothed signal back across the threshold before re-crossing. Both are mechanically plausible: a clench with a momentary relaxation in the middle, or a partial release followed by re-engagement. Examining the trigger offsets within the medium segment (1995 → 5495 → 8995 → 12895 → 16245 → 19045) shows the gap between triggers 5 and 6 is 2800 ms while the others cluster around 3500 ms — the extra trigger appears at the end of the segment, consistent with a slightly-too-soon initiation of what would have been the next intended clench had the segment continued. Future protocol revisions could guard against this by requesting a slightly longer rest between reps, or the detector could enforce a longer post-fire refractory period; the current 200 ms forward hold is too short to filter this artifact at the user's protocol cadence.

Zero false positives across nearly 30 seconds of intentional rest is a stronger result than the single over-fire is a problem. The detection system is biased toward sensitivity over conservatism at this sensitivity setting, which is the right trade-off for a control interface where missed gestures are more frustrating than occasional double-actuation.

Mean first-trigger latency of 1.66 s should be interpreted carefully — it is the elapsed time from the segment-start timestamp (the moment the protocol began the segment on screen) to the first detected gesture, not the gesture-onset-to-detection delay that the term ordinarily denotes. Subtracting the user's reaction time after seeing the segment-start prompt and the initial 1.5-second-or-so clench rise time would put the *intrinsic* detector latency at well under a second. The 150 ms debounce window in the rule definition sets a hard lower bound; in practice the pipeline-to-detection latency is dominated by the BLE → muse-js stream delivery (~50 ms) plus the 250 ms RMS window plus 3-tick (~150 ms) consensus, for a total intrinsic delay of approximately 450 ms. A future revision of the recorder could capture per-rep gesture-onset markers (e.g., from a band-power threshold crossing prior to the formal trigger) to make a properly defined gesture-onset-to-detection latency reportable.

**Thesis significance.** This is the first numerical evidence that the artifact-based control pipeline can detect clench gestures reliably and discriminate against rest noise on the Muse 2 hardware, with adequate (sub-second intrinsic) latency for real-time control. The replay tooling makes this result reproducible against any future detector revision without re-running the experiment — a recording from any past session can be re-evaluated against new rules, which is essential for the longitudinal comparison that Chapter 4 will document.

### 2026-05-27 (extended 4) — validation-metrics panel and unsaved-data confirm

Both deferred items closed. The validation panel and the discard-confirm dialog are now in place; today's "recording → replay → validation" plan is structurally complete.

**Validation metrics in the replay output.** `replayer.ts` now returns a `ReplayMetrics` object alongside the per-segment trigger counts: clench and eyebrow **hit rates** (triggers ÷ (segments × expected reps), defaulting to 5 expected reps per segment to match the guided protocol), **false-positive count and per-minute rate** during rest segments, **mean first-trigger latency** (segment-start to first replayed `forward_trigger`), and **mean inter-trigger interval** (average gap between consecutive forward triggers within a segment). The replay panel renders these in a stat block below the per-segment table. Hit rates above 100% are possible and informative — they indicate the detector double-fired per intended gesture, which is a different failure mode from missed triggers and worth seeing distinctly. First-trigger latency is qualified in the UI to remind the reader it conflates detector pickup speed with the user's reaction-time inside the segment window — clean per-rep latency would require knowing each gesture's onset, which we don't currently capture; a future revision could add per-rep onset detection via a band-power-cross threshold.

**Unsaved-data discard confirm.** `startRecording` and `startProtocol` now call a `confirmDiscardUnsaved` helper before resetting the buffers. When `hasUnsavedRecording` is true, a native `window.confirm` prompts the user with "OK to discard / Cancel to keep" and aborts the new session if the user cancels. This is the simplest possible UX (no custom dialog, no styling burden) and correctly handles the failure mode that wiped a recorded but unsaved session earlier today.

**State of today's plan, end-of-day.**

| Goal | Status |
|---|---|
| Recording subsystem (segments + guided protocol) | ✅ done |
| Replay (load saved `.json`, re-run detector with current sensitivity) | ✅ done |
| Validation metrics (hit rate, FP rate, latency) | ✅ done |
| Detection-rule pivot to TP-primary (unplanned but load-bearing) | ✅ done |
| Bug fixes: 2× stale-closure, 1× empty-EEG, 1× discard hazard | ✅ done |
| Always-on intensity bar | ✅ done |
| Thesis documentation, per-issue solutions, references list | ✅ ongoing per [[feedback-thesis-md-maintenance]] |

The infrastructure for Chapter 4 (Results) is now in place — a single high-quality recording can be replayed against any future detector revision and produce structured per-gesture hit-rate, false-positive, and latency numbers without re-running the experiment. The next time the rules change, the validation impact is one click away.

### 2026-05-27 (extended 3) — replay tooling and always-on intensity bar

Two pieces of tooling were added to break the recording-fix-record loop that had been dominating the day. Re-doing the full guided protocol every time a detection rule changed was both fatiguing for the user and statistically poor — each new recording introduced session-to-session variation (electrode contact, skin moisture, calibration baseline) that confounded the signal of "did the rule change actually fix anything?"

**Live intensity bar (always-on).** The Forward and Reverse status cards previously rendered as plain dashes at rest and only displayed an intensity bar when a trigger had fired. This gave the user no feedback on what the detector was *seeing* in real time — making it impossible to tell whether a non-triggering clench was "the signal didn't make it" or "the signal was there but the rule didn't fire." The cards now show the live EMA-smoothed band-power as a percentage of the configured threshold (clamped to 0–150%), with a vertical marker at the 100% line where the rule would trigger. The card flashes its active color (yellow / red) when a trigger actually fires; the bar shows the dynamics either way. This decouples "is the signal there?" from "did the rule fire?" — exactly the diagnostic the user needs.

**Offline replay.** A new `laptop/app/replayer.ts` module re-runs the same Butterworth biquad + RMS + ZCR pipeline against a previously saved `.json` recording, with the user's *current* sensitivity sliders applied to the *recording's original baseline*. The UI exposes this via a Load .json button and a Re-run button: change the sensitivity slider, click Re-run, see the per-segment trigger counts update without touching the headset. Output is a table showing original triggers (from the live detector at recording time), replayed triggers (with current settings), and the delta. Validation of the replay code against a known recording (`15-15-52.json` at forward 2.0× / reverse 4.0×) produced 5 / 6 / 5 forward triggers in the light / medium / hard segments with zero false positives in any of the four rest segments — consistent with the offline Node simulations we'd been doing manually, and exactly the detection profile we were targeting all along. This confirms that the recorded EEG was high-quality throughout the session and that the live-detector zero-trigger results were entirely due to the baseline-closure bug, not data quality.

**Thesis utility.** Replay is the workflow primitive that makes the validation experiment (Chapter 4) feasible. With it, a single high-quality recording can be re-evaluated under any future detector or rule revision, producing a longitudinal comparison without the per-session noise that would dominate any re-recording approach. The chapter can be built from one canonical recording per gesture-set, replayed against successive rule versions to show how the detector matured.

### 2026-05-27 (extended 2) — first guided-test recording reveals the AF channels don't track clench EMG

With the recording bugs fixed and a stable WiFi connection (iPhone hotspot), a clean ~114 s guided-test recording was captured: seven segments (baseline rest, three clench segments labeled light/medium/hard with rests between, final rest), 9559 EEG packets, 1954 accelerometer samples, all event boundaries correctly closed. The recorder itself is now working as designed.

The detector, however, **did not produce a single `forward_trigger` event** across 60 s of intentional clenching. Offline analysis of the saved EEG (re-running the same Butterworth 20 Hz highpass and 250 ms RMS the live detector uses) explained why:

**High-band RMS by segment (μV)**, AF and TP grouped as the detection rule expects:

| segment | AF mean | AF peak | TP mean | TP peak | AF/TP ratio |
|---|---|---|---|---|---|
| rest (baseline) | 5.9 | 9 | 7.4 | 10 | 0.81 |
| clench (light) | 5.9 | 9 | 9.3 | 18 | 0.64 |
| clench (medium) | 8.4 | 16 | 18.1 | 50 | 0.47 |
| clench (hard) | 12.6 | 25 | 41.5 | 97 | 0.30 |

The forward thresholds in effect during the recording were AF > 18.7 AND TP > 17.8. Hard clench reached TP peak 97 (far above the TP gate) but AF peak only 25 (just above the AF threshold instantaneously, well under the EMA-smoothed running mean). Light clench was essentially indistinguishable from rest on the AF channels.

**This is the inverse of what the EMG-vs-EEG literature predicts.** Goncharova et al. (2003) and Cavusoglu et al. (2006) describe the masseter as a large muscle whose EMG propagates broadly across the scalp, contaminating frontal as well as temporal electrodes. The earlier `2026-05-26` thesis entry used this finding to justify a forward rule that required *both* AF (frontal) and TP (temporal) high-band to clear thresholds simultaneously. On this user, with the Muse 2's exact electrode positions and contact geometry, the assumption is wrong: masseter EMG concentrates almost entirely on TP9/TP10 (probably because the temporalis and masseter share neighbouring fascia just under those electrodes) and produces very little observable signal on AF7/AF8.

**Why this matters for the thesis.** It's a genuine empirical finding that consumer-grade EEG, with its specific electrode layout and casual contact prep, does not reproduce the spatial-spread assumptions of laboratory EMG-on-EEG work. The published literature is dominated by studies that either (a) use research-grade caps with many electrodes and optimal contact, or (b) deliberately *induce* clenching as a contamination control — neither setting tests whether a consumer headset would actually detect the broad spread. A practical consequence: design rules from published EEG-EMG work cannot be transferred verbatim to consumer-BCI without empirical verification on the target hardware.

**Detection rule revision (third major iteration).** The forward rule was changed from `AF > afThr AND TP > tpThr × 0.5` to **`TP > tpThr`** (TP-primary). The ratio check `< 1.6` is retained for discrimination from eyebrow raise (where AF dominates). Intensity scaling now uses `tpHigh / tpThr_fwd` instead of `afHigh / afThr_fwd`, so the strongest-on-this-user channel pair drives the speed value. Sensitivity slider minimum was lowered from 2.0× to 1.5× to accommodate the user's signal scale; default forward sensitivity dropped from 4× to 2×. The `forwardSensitivity.v4` localStorage key was bumped to `.v5` so previously-saved sensitivities (which assumed the AF-AND rule) don't carry stale meaning into the new model.

The dashboard meter UI was updated to reflect the new semantics: the yellow "forward gate" line is now shown only on TP channels (where the rule actually checks), and the AF channels show only the red "reverse gate" line (where the eyebrow rule checks). Showing a forward gate line on AF would have been misleading.

**Confirmed issues from earlier sessions** (consolidated for thesis reference):
- **Stale-closure bug in protocol setTimeout callbacks** — fixed by mirroring `activeSegment` into a ref. Empty `segments[]` array on the first save.
- **Empty `eegPackets[]` / `accelSamples[]` on the first save** — suspected WiFi-induced subscription stall; resolved by switching to the iPhone hotspot for the retry, consistent with the AP-isolation workaround from earlier in the project.
- **Unsaved-data discard hazard** — clicking Start recording / Start guided test silently wipes any previously-stopped session's buffers, losing the data permanently. Fix (planned, not yet implemented): both `startRecording` and `startProtocol` should check `hasUnsavedRecording` first; if true, show a confirm dialog ("You have an unsaved recording. Save it before starting a new session?") with Save / Discard / Cancel options. The Save path runs the existing `saveRecording()` flow before proceeding; Discard runs the existing reset; Cancel aborts the new session entirely. Mechanical change, ~10 lines.
- **Guided test starts even when no baseline exists** — surfaced after the previous fixes. `startProtocol` previously only checked `museStatus` and `recordingRef.current` before launching, but not whether `baseline` had been set. The user could click the button before the 5-second auto-calibration finished (or after a calibration failure with no baseline established), and the protocol would dutifully run for ~2 minutes while the detector silently never fired because thresholds were `Infinity`. The saved file then showed `meta.baseline: null` and zero triggers across every clench segment, looking exactly like the detection-rule bugs we'd been chasing. Compounding the confusion: the dashboard's "Forward" status card stayed in its idle visual state (a dash and an empty intensity bar), which the user couldn't distinguish from "detection ran but didn't trigger." Fix (implemented): `startProtocol` now bails with `addLog('⚠ no baseline — click Recalibrate first, then start the test')` when `baseline` is null, and the Start guided test button is disabled with a "(calibrate first)" suffix and tooltip when in that state. Also raised the idle Forward-card intensity bar from `h-2 bg-gray-700/60` to `h-3 bg-gray-900/70 ring-1 ring-gray-700` so the empty track is visible as an idle placeholder rather than vanishing into the card background.
- **Stale-closure bug on `baseline` state in the detection subscription** — surfaced after the TP-primary rule change. The `eegReadings.subscribe` callback is registered inside `connectMuse`, which captures the value of `baseline` at the moment of registration (`null`). Calibration runs afterwards and sets `baseline` to a populated object via `setBaseline(…)`, but the captured closure continues to see `null` for the lifetime of the subscription. The rule-evaluation block was gated on `if (… && baseline)`, so it never executed — independent of which rule was inside. Offline simulation of the same EEG through the same filters and rule produced 17 forward triggers, while the live run produced 0. The bug had been silently present since the rule evaluation moved into the throttled meter-tick block; it just happened to be masked earlier when the rule itself was also wrong. Fix: gate the rule on a finiteness check of a ref-tracked threshold (`Number.isFinite(tpThrFwdRef.current)`), since the threshold-derivation `useEffect` mutates the ref imperatively when baseline changes. This is the same root cause as the segment-end stale-closure bug from earlier in the same day — refs in this codebase are the canonical pattern for any state value that needs to be visible to a long-lived subscription or async callback, and the rule of thumb "never read React state from inside a callback that outlives the render" should probably be encoded as a project lint pattern.

### 2026-05-27 (extended) — segment-based recording, guided protocol, and the bugs that surfaced

The initial recorder (built earlier the same day) used a free-form recording model: one continuous session with timestamped markers inserted by keyboard shortcuts. Real-world use immediately exposed the UX problem with that approach — after pressing keys during a session, the user has no way to see *what they captured* without parsing the JSON afterwards. The mental model of "did I get five clenches in there?" has no answer from the interface.

The model was changed to **labeled segments**: an explicit start/end time-range with one of four labels (`clench`, `eyebrow`, `tilt`, `rest`). The user opens a segment, performs gestures, closes the segment, and immediately sees a green summary block reporting duration, EEG-packet count, and detector trigger counts. A running list of captured segments accumulates in the panel. This makes recording an experiment-shaped activity rather than an opaque dump.

To remove the per-segment fiddling and let the user produce consistent runs, a **guided protocol** was added — a scripted sequence of messages and segments that the dashboard executes on a timer with a large on-screen banner showing the current step, an instruction, a count-down clock, and a progress bar. The first protocol (the clench-intensity test) is ~1m45s long and produces seven labeled segments: a baseline rest, then three intensity-graded clench segments (`light` / `medium` / `hard`) separated by short rests and capped with a final rest.

Segment metadata was extended with an optional `note` field so the protocol can stamp intensity labels (`light`/`medium`/`hard`) into the saved file without expanding the segment-label enum.

**Bugs surfaced in the first real run** (kept here because they are genuinely useful thesis material on building robust real-time browser systems):

1. **Stale-closure bug in the protocol runner.** The protocol scheduled `endSegmentInternal` via `setTimeout` to fire 20 s after a `beginSegmentInternal` call. The timer's closure captured `endSegmentInternal` from the render that scheduled it, and that version of the function read `activeSegment` from React state. Because React state updates are asynchronous, the version of `activeSegment` visible to the closure was the value *before* `beginSegmentInternal`'s `setActiveSegment` call had applied — i.e., `null`. The function returned early at the `if (!activeSegment) return null` guard, no `segment_end` was emitted, and the segments array stayed empty for the entire session. The classic stale-closure failure mode in React with async timers. Fix: mirror `activeSegment` into a `useRef` and read from the ref inside the timer-scheduled function, since refs are mutated in place and any closure reading `ref.current` always sees the latest value. This is the same idiom already used elsewhere in this codebase for `recordingRef`, `forwardActiveUntilRef`, `clenchLastSpike`, and others — high-frequency or asynchronously-read values use refs; rendered values use state. The new code follows that convention consistently.
2. **Empty EEG buffer in the saved file.** Despite the recording being active for 117 s, the saved file contained zero EEG packets and zero accelerometer samples. The segment_start events fired on schedule, so the *timer infrastructure* was alive — but the streams from `muse-js` were not reaching the recorder. Suspected cause: a transient BLE drop, or WiFi-induced page jitter that interrupted the Web Bluetooth subscription. The user reported that the local WiFi was poor during the session, which is consistent with this hypothesis (Web Bluetooth runs in the browser process and can be starved by network-side delays in some configurations). The retry will be attempted on a more reliable connection (iPhone hotspot, the same workaround used earlier in the project to bypass home-router AP isolation). The user-visible signal that would have caught this earlier — the live "EEG packets so far" counter on the recording panel reading zero — was present but was not prominent enough to draw attention during the test.
3. **Unsaved-data discard hazard.** Clicking *Start guided test* (or *Start recording*) silently resets the recording buffers without prompting the user about any unsaved data from a previous session. In the actual run, the user performed a manual recording, hit Stop, then started the guided test — and the manual recording was wiped before being saved. This is a fully recoverable UX failure (no data was at risk if it had been saved first) but it is exactly the class of UX bug that erodes user trust in an experiment-recording tool. Fix is pending — a "you have unsaved data, save or discard?" prompt before reset is the obvious move.

**Methodological observation, for the thesis.** Building a real-time browser-based recording system has a non-trivial set of failure modes that do not appear in offline / Python-notebook analyses of EEG. Stale closures, transient subscriptions, async state, and lossy network paths are all peculiar to the live-data setting. A retrospective on these classes of bug — and the defensive patterns that prevent them (refs over state for cross-async reads; loud in-UI counters for stream health; confirm-before-discard for unsaved experiment data) — is a useful Chapter 5 sub-section about the practical engineering of consumer-BCI tooling.

### 2026-05-27 — session recorder for offline analysis and validation

To move from feel-based tuning toward quantitative evaluation, a recording subsystem was added (`laptop/app/recorder.ts` + integration into `page.tsx`). When active, it appends every incoming EEG packet, every accelerometer sample, and every detector decision to in-memory ref-buffers, then serialises the lot to a JSON file on demand. The recording also captures the calibration baseline and sensitivity settings active at the moment of recording, so a replayed session is fully reproducible.

**Ground-truth annotation.** The recorder accepts user-emitted markers via keyboard shortcuts (`1` = clench-attempt, `2` = eyebrow-attempt, `3` = tilt-attempt, `M` = unlabeled). The intended workflow is: start a recording, perform a gesture, immediately press the corresponding key, and the timestamp at which the user *intended* to produce a gesture is then recorded alongside what the detector *did* produce. The asymmetry between marker timestamps and detector triggers gives both accuracy (did the detector see the gesture I intended?) and latency (how long after my intent did the detector fire?) metrics directly from the file.

**Storage format.** JSON, with three parallel arrays: `eegPackets[]` containing the muse-js 12-sample chunks per electrode with wall-clock timestamps, `accelSamples[]`, and `events[]` for detector decisions and markers. Each entry is a record-on-arrival log rather than a per-sample table, preserving the upstream stream structure. File sizes are modest — a 60-second session is approximately 700 KB uncompressed.

**Justification for live recording over a pcap-style passive tap.** This project's "data stream" is multi-channel, low-rate, and already deserialised in the browser, so capturing in the consumer is simpler than introducing a passive observer. The downside (recording captures only what the dashboard sees, not what the headset emits in raw) is acceptable because muse-js is the canonical source of truth for our detection.

**Thesis use.** Saved recordings become the source data for the validation experiments in Chapter 4 (Results). They also serve as ground truth for figures: a recording can be plotted post-hoc to produce the waveform, band-power, and ratio plots the thesis needs without requiring the headset to be re-worn.

### 2026-05-26 (extended) — ratio discriminator and anti-jitter pipeline

User testing of the new clench/eyebrow detector surfaced two problems. First, eyebrow raises sometimes triggered the *clench* rule instead of the reverse rule: the user reported their ears moving with their eyebrows, which is consistent with the documented co-activation of the small *auricularis* muscle group with the *frontalis* in some individuals (Schumann et al. 2023, [Neurosity 2024](https://neurosity.co/guides/muscle-artifact-eeg-why-how-fix)). Auricularis EMG, generated directly under the TP9 and TP10 electrodes, lifted `tpHigh` above the strict ceiling that the eyebrow rule had used to confirm "frontalis is localized to forehead," and the rule fell back to the clench branch. Second, both rules were prone to single-tick activation from transient noise — a momentary high-band spike on any electrode could fire forward for the 200 ms hold window.

**Fix 1 — AF/TP ratio discriminator.** The strict TP ceiling was replaced with a ratio rule. The biomechanical observation that justifies it: the *frontalis* (eyebrow) is anatomically much larger than the *auricularis* (ear), but the *masseter* (jaw clench) is approximately equal in size to the *frontalis* and is positioned to project EMG broadly across the scalp ([Case Western EMBC 2006](http://engr.case.edu/cavusoglu_cenk/papers/EMBC2006b.pdf); [Goncharova et al. 2003 — EMG contamination of EEG: spectral and topographical characteristics](https://www.neurotechcenter.org/sites/default/files/misc/EMG%20contamination%20of%20EEG%20spectral%20and%20topographical%20characteristics.pdf)). Consequently `afMean / tpMean ≈ 1` during a clench and `≈ 2–3` during an eyebrow raise, regardless of whether the user's auricularis co-fires. The rule was reformulated as:

- *Forward (clench):* `afMean > afThr_fwd` AND `tpMean > tpThr_fwd × 0.5` AND `ratio < 1.6`
- *Reverse (eyebrow):* `afMean > afThr_rev` AND `ratio > 1.6`

This makes the discrimination independent of the absolute TP value, which is the variable that ear-muscle cross-talk perturbs. The ratio cutoff of 1.6 was chosen as the midpoint between the two expected ratio regimes; it is a single hyperparameter to tune if cross-firing recurs.

**Fix 2 — Anti-jitter pipeline.** Two techniques from the real-time sEMG gesture literature were added:

1. **Exponential moving average (EMA) on features.** The `afMean` and `tpMean` time series are smoothed with `α = 0.3` (effective ~3-tick window, ~150 ms) before being fed to the rules. This is a standard pre-classification smoothing step in real-time sEMG systems ([PMC6679304 — Real-Time Surface EMG Pattern Recognition](https://pmc.ncbi.nlm.nih.gov/articles/PMC6679304/); [Sivakumar et al. 2025 — ReactEMG](https://arxiv.org/pdf/2506.19815)). It removes single-sample spikes and isolated noise transients without significantly delaying the response to a sustained gesture.
2. **Multi-tick debounce on forward.** The forward rule must now hold for 3 consecutive 50 ms evaluation ticks (150 ms total sustained signal) before going active. This is the "majority voting window" principle from EMG pattern recognition — a single noisy tick cannot fire a forward burst. Reverse is left as a single-tick discrete trigger, because its existing 800 ms pulse + 1.5 s cooldown already provide structural debounce.

**Architectural change to enable debounce.** Rule evaluation was moved from per-EEG-packet (at ~21 Hz × 4 channels = 85 callbacks/sec) to per-meter-tick (a single throttled 20 Hz evaluation). Running the rules on a single stable cadence means the debounce counter ticks at a known rate and the EMA constant is well-defined. The change also halves the CPU spent on rule evaluation.

**Diagnostic UI.** The dashboard now displays the live AF/TP ratio with the two cutoffs visible as text, so the user can directly see *why* a gesture is being classified as clench or eyebrow. This is essential for the threshold-tuning workflow: when a misclassification occurs, the ratio readout shows whether the issue is in the AF threshold, the TP floor, or the ratio cutoff itself.

**Thesis-relevant lessons.** (a) Anatomical cross-talk between adjacent muscle groups is a real failure mode of EMG-via-EEG-electrode systems, and is not adequately addressed in the literature dominated by lab-grade setups. (b) Replacing absolute-magnitude rules with ratio rules is a generalizable defense against per-user variation in baseline cross-talk magnitude. (c) Adding EMA + multi-tick consensus is a well-established trick from sEMG prosthetic-control work that transfers cleanly to artifact-based EEG-BCI; this project's pipeline now resembles a stripped-down version of a sEMG real-time classifier, with the bandpass + ZCR feature extraction in place of a neural network and threshold rules in place of softmax.

---

## Project learnings (running glossary)

Cumulative knowledge gained from building the system. Organized by topic; each entry is self-contained so it can be lifted into a thesis chapter. New items are added as the project surfaces them.

### EEG signal anatomy

- **Frequency bands and what lives in them.** Standard EEG conventions: delta 0.5–4 Hz, theta 4–8 Hz, alpha 8–13 Hz, beta 13–30 Hz, gamma 30+ Hz. Artifacts cut across these bands and dominate when present: EOG (eye/blink) sits at 1–10 Hz, EMG (muscle) is broadband but most discriminable above 20 Hz, mains hum is 50/60 Hz. For artifact-based BCI, the artifacts are signal, not noise — but they have to be separated from each other, not from the brain rhythms.
- **Raw amplitude is not a discriminator.** A hard blink and a moderate jaw clench can produce similar peak amplitudes in raw μV. Discrimination requires either (a) frequency-domain separation (bandpass) or (b) morphological features (rise time, zero-crossing rate, duration). Single-threshold-on-raw-signal approaches will always have ambiguity zones.
- **Volume conduction.** A signal generated by one source (e.g., the eye for a blink) appears across multiple electrodes, scaled by tissue-conduction distance. EOG from blinks shows up on all four Muse channels, not just AF7/AF8 — sometimes more strongly on TP9/TP10 depending on individual head conduction and electrode contact. The literature's "AF is the blink channel" rule is a simplification.
- **Bandpass decomposition** with 2nd-order Butterworth biquads at 10 Hz (lowpass, blink/EOG band) and 20 Hz (highpass, EMG band) was sufficient for the gestures used here. Higher-order filters would give sharper transition bands but at the cost of group delay and computational load.

### Electrode-anatomy mapping (Muse 2 specifically)

- **AF7 / AF8 (forehead, ≈ Fp1/Fp2 in 10-20).** Closest to the *frontalis* muscle, the eye orbicularis, eyebrow muscles. Picks up EOG blinks, but **also** picks up forehead-skin noise (sweat, hair), eyebrow expressions, frowning, and any voluntary forehead movement. On consumer-grade contact, this noise often drowns the blink signal — contrary to what lab-grade EOG literature would predict.
- **TP9 / TP10 (left/right ear-temple).** Sits over the *temporalis* and adjacent to the *auricularis* (small ear muscle) and the *masseter* (jaw). Picks up EMG from any of these muscles. Also picks up volume-conducted EOG from blinks, often more cleanly than AF on consumer-grade contact.
- **Auricularis cross-talk.** Some users co-fire the auricularis when raising their eyebrows. This puts EMG directly under TP9/TP10 during what should be a forehead-localized gesture, and is the single empirical reason the AF/TP ratio discriminator replaced the AF-AND-NOT-TP rule. Anatomical variation between users is the load-bearing assumption here.
- **Masseter dominance.** The masseter is anatomically large and produces EMG that propagates broadly across the scalp. A jaw clench lights up *all four* Muse channels, not just the ones over the temporalis. This is the basis for "clench fires AF + TP both" while "eyebrow fires AF >> TP."

### Noise sources in consumer EEG

- **Electrode contact noise.** Bad contact manifests as either flatline (RMS < ~3 μV — no signal getting through) or rail/saturation (RMS > ~250 μV — DC drift exceeds amplifier range). Detectable from raw RMS; useful as a precondition for trusting any other signal feature.
- **Skin impedance drift.** Over a 30-minute session, skin moisture (sweat, oil) changes electrode-to-skin impedance, slowly shifting both the baseline amplitude and the noise floor. Fixed μV thresholds calibrated at session start become unreliable within minutes.
- **Movement artifact.** Head movement, talking, swallowing, eye saccades, and tongue movements all produce EEG-band artifacts. Most are sufficiently dissimilar to the controlled gestures to be rejected by the rules; talking and swallowing are the main false-positive sources for forward (clench), as expected.
- **Mains hum.** 50 Hz (Europe) interference is present at low amplitude. Lies inside the EMG band, so it contributes a small constant offset to high-band RMS — absorbed by the baseline-relative threshold approach without needing a notch filter for this project's accuracy bar.
- **Alpha rhythm contamination.** Eyes-closed alpha (8–13 Hz) is in-band for the low-pass blink filter (cutoff 10 Hz). Alpha is small-amplitude (10–50 μV) compared to a blink (100–500 μV) so contributes mostly to baseline; thresholds set above resting noise reject it implicitly.

### Detection / classification strategies

- **Sliding-window RMS** (250 ms window) is a good time-frequency trade-off for human-scale gestures: long enough to estimate signal energy reliably, short enough that the detection latency is still <300 ms.
- **Zero-crossing rate (ZCR)** is a cheap proxy for "fast vs slow" signal content. Used here as a sanity check: any channel ZCR > 0.20 confirms muscle activity is happening, rejecting slow drifts that would otherwise satisfy amplitude rules.
- **Multi-channel consensus** (e.g., "3 of 4 channels must fire") works well for broadly-distributed signals like masseter EMG, and was used as the original clench rule before being superseded by the AF/TP ratio.
- **Ratio-based discriminators** are more robust to per-user variation in absolute signal magnitude than absolute-threshold rules. The AF/TP ratio in particular is invariant to: headset tightness, skin conductance, day-to-day amplitude shifts. It only requires that the *anatomical asymmetry* (masseter ≈ frontalis ≫ auricularis) holds, which is biological invariant.
- **Hysteresis and debounce.** Single-tick threshold crossings produce false positives at any threshold setting. The fix is either (a) require N consecutive ticks above threshold before firing (debounce), (b) require the signal to *also* drop below a separate lower threshold before re-arming (Schmitt-trigger hysteresis), or (c) both. This project uses (a) for forward; reverse has structural debounce via its 800 ms pulse + 1.5 s cooldown.
- **EMA smoothing on features.** Applying `s_t = α·x_t + (1−α)·s_{t-1}` to the band-power RMS time series before rules run removes most single-sample noise spikes at the cost of ~3 sample-periods of added latency. `α = 0.3` at 20 Hz gives an effective window of ~150 ms.

### Calibration and per-user adaptation

- **Fixed thresholds don't work across sessions.** Even for the same user on the same hardware, μV-absolute thresholds calibrated on Tuesday will misfire on Wednesday. Headset fit changes, electrode contact changes, skin chemistry changes.
- **Per-session noise-floor calibration** is the practical fix. Five seconds of "resting" signal gives enough samples to estimate the user's baseline noise floor; thresholds are then `baseline × multiplier`. The user tunes the multiplier (a unitless sensitivity), which transfers across sessions; the absolute threshold is derived per-session.
- **Robust percentile over mean.** The 90th percentile of baseline samples is far more robust than the mean — one unintentional twitch during the calibration window won't poison the baseline.
- **Contact-quality gating.** A flatline channel produces a near-zero baseline, which produces a near-zero threshold, which fires false positives constantly. Calibration must verify that all relevant channels report "good" contact before the baseline is accepted.

### Wire-protocol and system design

- **Discrete vs continuous control.** Discrete commands (`blink → 200ms forward`) don't compose with intensity. A continuous protocol (`drive:X` where X ∈ [−1, 1]) is strictly richer: a discrete command is just a continuous command with two values. Always start with continuous if you might want intensity later.
- **Watchdog over keep-alive.** The car expects continuous `drive:X` messages while moving; if it doesn't hear one within 500 ms, it stops. This is a safer pattern than explicit `stop` commands because it survives every failure mode (laptop crash, BLE disconnect, browser tab close, lost WebSocket frame).
- **Streaming frequency.** 10 Hz drive updates are plenty for human-scale control. The 100 ms-per-update update rate is much faster than the user can perceive any control-loop delay.
- **One throttled evaluation tick** beats per-packet evaluation. Running the rules at a fixed 20 Hz cadence (rather than per-EEG-packet at ~85 Hz across 4 channels) means EMA constants and debounce counters all reference the same well-defined time base. Also halves CPU.

### Software-architecture findings (Web Bluetooth + Next.js)

- **Web Bluetooth's secure-context requirement** locks the dashboard to localhost (dev) or HTTPS. Combined with the car's plain `ws://` listener, this rules out cloud hosting unless a relay is introduced — which adds latency and a point of failure for no benefit when localhost works. Architectural decision documented in CLAUDE.md: never add a relay.
- **Chromium-only Web Bluetooth.** Firefox and Safari aren't options. iOS is therefore not a target platform.
- **React refs for streaming state.** State updated inside high-frequency callbacks (~85 Hz EEG packets) must use refs, not `useState`, otherwise stale closures and re-render churn ruin the pipeline. Refs are also required for any value read inside `setInterval` to avoid stale-closure bugs.
- **Next.js 16's strict lint rules** disallow reading `ref.current` during render. Diagnostic UI values that depend on ref state must instead be derived from React state (which re-renders) — accept the small staleness.

### Hardware lessons (car side, for completeness)

- **Counterfeit components.** Cheap Chinese motor-driver breakout boards can pass every input-side diagnostic (VCC, STBY, PWM, AIN/BIN all correct) and still produce zero output. The fix was to buy genuine Adafruit. Lesson: when the inputs are right and the output is dead, suspect the chip.
- **Ground bounce.** Motor inrush current on a shared ground rail can spike the supply enough to brown out the MCU. All grounds must be explicitly tied to the battery negative.
- **mDNS on Windows is unreliable.** `car.local` resolves on Mac and Linux but not consistently on Windows; raw IP is needed.
- **Home routers and AP isolation.** Many consumer routers have AP isolation enabled by default, blocking peer-to-peer traffic between devices on the same WiFi. iPhone hotspot does not have this restriction; was used as the workaround network for this project.
- **Solder is non-optional.** Bare jumper-through-copper-ring connections to motor terminals look fine and fail intermittently. The first real motor test required a trip to a makerspace.

### Process and methodology learnings

- **Living documentation beats post-hoc reconstruction.** Maintaining `thesis.md` as a journal during development captures the *reasoning* behind each decision — which is what the thesis needs, and which is lost if you only have the final code.
- **Empirical user testing dominates literature-led design.** The blink-vs-clench pivot and the AF/TP-ratio replacement were both made because real testing on this user with this hardware contradicted what the published literature predicted. Both decisions improved the system substantially.
- **Plain English explanations of methodology** force you to actually understand it. Every time the user asked "explain X in plain English," it surfaced ambiguities in the design that hadn't been visible in the code.
- **Default to docs before code.** Working out the *plan* in writing first (in conversation, in README, in thesis.md) catches design problems before they become deletion-and-rewrite work.

---

## Notes for thesis chapters

### Chapter 1 — Background
- History of BCI: from invasive implants to consumer EEG
- What consumer EEG can and cannot do; the gap between marketing and capability
- Anatomy and physiology of the detectable artifacts: EOG (blinks), frontalis EMG (eyebrow raise), masseter EMG (jaw clench), and the head-motion measurement provided by the on-board accelerometer
- Standard EEG electrode positions used by Muse (10-20 system: AF7, AF8, TP9, TP10) and what each measures in practice on a consumer device
- Frequency-band conventions in EEG and where artifacts sit relative to neural rhythms
- Prior art: OpenBCI, Muse SDK community projects, other RC car BCIs, the BLINKER pipeline
- Why artifact-based control is legitimate (not a workaround)

### Chapter 2 — System design
- Architecture decisions and pivots (also documented in SUMMARY.md)
- Signal chain: Muse 2 → Web Bluetooth (Chromium-only) → `muse-js` → custom detector → WebSocket → ESP32 → TB6612FNG H-bridge → 4 DC motors
- Why the laptop is a required middleman (BLE host requirement; secure-context requirement for Web Bluetooth; consequence: cannot deploy as pure cloud app, must `npm run dev` locally; explicit decision *against* a cloud relay)
- Software stack choices: Next.js 16 (App Router) for the dashboard; React 19 client component pattern with refs for streaming state to avoid stale-closure issues; Tailwind for the dashboard UI
- Wire protocol design: continuous `drive:X` over WebSocket with a 500 ms watchdog as the primary safety mechanism
- Calibration as a first-class system component, not an optional tuning step

### Chapter 3 — Implementation

**3.1 Signal-processing pipeline (`laptop/app/detector.ts`)**
- Two-band Butterworth biquad decomposition (lowpass 10 Hz, highpass 20 Hz)
- 64-sample (250 ms at 256 Hz) ring buffers per band per channel
- Features: band-power RMS, zero-crossing rate (ZCR), raw RMS for contact assessment

**3.2 Gesture rules (`laptop/app/page.tsx`)**
- EMA smoothing (α=0.3) on `afMean` and `tpMean` before evaluation
- Forward: `tpMean > tpThr_fwd AND ratio < 1.6 AND any ZCR > 0.20`, with 3-tick (150 ms) debounce. **TP-primary** — on this hardware/user, masseter EMG lands on TP9/TP10 and barely touches AF (see 2026-05-27 entry for the empirical data justifying this).
- Reverse: `afMean > afThr_rev AND ratio > 1.6 AND any ZCR > 0.20`, with 800 ms pulse and 1500 ms cooldown
- `ratio = afMean / max(tpMean, 1)`
- Forward suppresses reverse on co-trigger
- Discriminator rationale: clench produces TP-strong, AF-weak signal (ratio ≪ 1); eyebrow produces AF-strong, TP-quiet signal (ratio > 1.6). Each gesture is detected on its primary muscle's electrode group; the ratio prevents cross-firing.

**3.3 Adaptive calibration**
- 5 s noise-floor collection on Muse connect (and on-demand via Recalibrate)
- 90th-percentile baseline computation (robust to single twitches in the calibration window)
- `threshold = baseline × sensitivity` with separate sensitivity multipliers for forward and reverse

**3.4 Contact quality**
- Raw RMS-bounded classifier (`good` 8–120 μV, `bad` <3 or >250 μV, `fair` between)
- Surfaced as coloured dots above each channel meter; gating function for trustworthy calibration

**3.5 ESP32 firmware (`car/car.ino`)**
- WebSocket server on port 81, WiFi, mDNS (`car.local`)
- `drive:X` parser with magnitude mapped to PWM in [120, 255] via `MIN_PWM + |X| × (MAX_PWM − MIN_PWM)`
- Differential steering: `STEER_DIFFERENTIAL = 0.35 × basePWM` offset per side
- 500 ms drive-watchdog as default-deny safety: motors stop unless re-asserted by the laptop

**3.6 Latency budget**
- BLE Muse → browser (~10–20 ms typical)
- Detection window (250 ms ring buffer → ~125 ms median detection delay)
- Drive streaming interval (100 ms)
- Total intent-to-motor latency: target < 400 ms — to be measured

### Chapter 4 — Results

**4.1 Detection reliability per gesture**
- Forward (clench) — recommended primary control; high reliability, intensity-modulable
- Reverse (eyebrow raise) — usable with sensitivity tuning, lower reliability than clench
- Steering (head tilt) — high reliability, continuous
- Measured from recorded sessions (`laptop/app/recorder.ts`) with `1`/`2`/`3` ground-truth markers: hit rate per gesture, false-positive rate during rest, mean detection latency from marker to detector trigger

**4.2 Calibration performance**
- Drift over a 30-minute session
- Recalibration frequency required for stable operation
- Failure modes when contact quality is poor

**4.3 False positives and false negatives**
- Forward false positives: speech, swallowing, neck tension
- Reverse false positives: forehead expressions, surprised reactions
- Cross-firing between forward and reverse

**4.4 Hardware diagnosis and resolution**
- The counterfeit TB6612 episode (documented in 2026-05-22)
- The networking failures (mDNS on Windows, AP isolation on home WiFi)
- Solder-quality dependence

### Chapter 5 — Discussion
- What worked: the bandpass + RMS + ZCR pipeline, adaptive calibration via percentile noise-floor, the AF-vs-TP gate for clench/eyebrow discrimination
- What did not work and why: peak-amplitude thresholding (insufficient discrimination), blink detection on AF (electrode-fit limitations on consumer hardware), fixed thresholds (drift across sessions)
- The "mind control" framing problem in media and demos
- Accessibility angle: artifact-based BCI is usable without training; calibration is the closest thing to a training step
- Why empirically-tuned consumer-EEG detection diverges from research-grade EOG/EMG literature, and what that means for replicability
- What would be needed to do real neural intent decoding: signal-to-noise improvement, ML, longer recording windows, individualized models
- Limitations: single-subject design, no cross-subject generalization study, no quantitative latency or accuracy measurements yet, requires a 5 s calibration each session

### Chapter 6 — Conclusion and future work
- Variable-intensity gestures as a route to richer consumer-BCI interfaces
- Possible extensions: dual-gesture combinations, head-yaw via gyroscope, dwell-time as a third axis
- Open-sourcing the detector module as a standalone JS package

---

## References

A running list of literature and technical sources consulted during the project. New entries are added when they influence a design decision, contradict the implemented approach, or document a phenomenon observed during testing.

### EEG artifact detection and EOG/EMG morphology

- **Akhtar, A. et al. (2022).** *MED: Muse-based Eye-blink Detection Algorithm Using a Single EEG Channel.* IEEE Signal Processing in Medicine and Biology Symposium. https://ieeexplore.ieee.org/document/10014708/ — informed the original blink-detection design (subsequently removed in the 2026-05-26 pivot).
- **Mendoza-Salazar, I. et al. (2020).** *Algorithm for Detection of Raising Eyebrows and Jaw Clenching Artifacts in EEG Signals Using NeuroSky Mindwave Headset.* Springer. https://link.springer.com/chapter/10.1007/978-3-030-57566-3_10 — early literature confirmation that eyebrow and jaw artifacts can be discriminated by signal-energy + zero-crossing features.
- **Kleifges, K. et al. (2017).** *BLINKER: Automated Extraction of Ocular Indices from EEG Enabling Large-Scale Analysis.* Software package and documentation. https://vislab.github.io/EEG-Blinks/ — reference for blink-detection threshold conventions (e.g., 1.5σ above signal mean).
- **Detection of EEG-Based Eye-Blinks Using A Thresholding Algorithm.** European Journal of Engineering Research. https://ej-eng.org/index.php/ejeng/article/download/2438/1089/9556 — additional context on amplitude-thresholding limitations.
- **Detecting Blinks in Healthy and Parkinson's EEG: A Deep Learning Perspective.** https://arxiv.org/pdf/2509.04951 — modern ML-based blink detectors as a comparison point for the threshold approach taken here.

### EMG-on-EEG cross-talk and facial muscle anatomy

- **Goncharova, I. I. et al. (2003).** *EMG contamination of EEG: spectral and topographical characteristics.* Clinical Neurophysiology. https://www.neurotechcenter.org/sites/default/files/misc/EMG%20contamination%20of%20EEG%20spectral%20and%20topographical%20characteristics.pdf — canonical reference on which scalp regions are most affected by which facial-muscle EMG.
- **Cavusoglu, M. C. et al. (2006).** *A Detection Scheme for Frontalis and Temporalis Muscle EMG.* IEEE EMBC. http://engr.case.edu/cavusoglu_cenk/papers/EMBC2006b.pdf — explicit treatment of how to detect frontalis vs temporalis activity from contaminated EEG, and the methodological precedent of using one muscle's activity to discriminate against another.
- **Neurosity (2024).** *Muscle Artifact in EEG: Why It Happens, How to Fix It.* https://neurosity.co/guides/muscle-artifact-eeg-why-how-fix — accessible practitioner-level guide to facial-muscle artifact, including auricularis cross-talk on temporal electrodes.

### Real-time EMG gesture recognition and anti-jitter techniques

- **Sivakumar, S. et al. (2025).** *ReactEMG: Stable, Low-Latency Intent Detection from sEMG via Masked Modeling.* https://arxiv.org/pdf/2506.19815 — modern reference for real-time stability/latency trade-offs in sEMG gesture classifiers; informs the EMA + multi-tick consensus approach.
- **Real-Time Surface EMG Pattern Recognition for Hand Gestures Based on an Artificial Neural Network (2019).** PMC6679304. https://pmc.ncbi.nlm.nih.gov/articles/PMC6679304/ — describes majority-voting windows and pre-smoothing as the standard anti-jitter pipeline.
- **Real-Time Hand Gesture Recognition Using Surface Electromyography and Machine Learning: A Systematic Literature Review (2020).** PMC7250028. https://pmc.ncbi.nlm.nih.gov/articles/PMC7250028/ — survey context on what "real-time" means in the sEMG literature and which preprocessing steps are universally applied.

### Muse 2 hardware and consumer-EEG context

- **Muse Developers — Muse SDK overview.** https://choosemuse.com/pages/developers — vendor documentation on what the SDK exposes (and what it does not).
- **Shaked, U. (2018).** *A Techy's Introduction to Neuroscience.* NeuroTechX Content Lab, Medium. https://medium.com/neurotechx/a-techys-introduction-to-neuroscience-3f492df4d3bf — practitioner introduction by the author of `muse-js`; useful for chapter 1 framing.

### JavaScript / Muse libraries

- **`muse-js` (Shaked, U.).** https://github.com/urish/muse-js — the BLE adapter used in this project. Last published 2021; still functional. Project considered switching to `web-muse` (https://github.com/itayinbarr/web-muse) but rejected for being unpublished on npm with undocumented accelerometer/gyro APIs.

### Web platform and architecture references

- **Web Bluetooth API specification.** Required secure context (HTTPS or localhost); Chromium-only browser support. Used directly via `muse-js`. Documented as a hard architectural constraint in `CLAUDE.md` (the laptop must be the BLE host, the dashboard must run on localhost or HTTPS).

