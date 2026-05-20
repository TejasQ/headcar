# Thesis Journal — Brain-Controlled Car

## Working title

Artifact-Based Brain-Computer Interfaces for Consumer Robotics: Building a Head-Controlled RC Car with Off-the-Shelf EEG Hardware

## Research question

Can consumer-grade EEG hardware (Muse 2) provide reliable, low-latency control signals for a mobile robotic platform using non-cognitive artifacts (blinks, jaw clenches, head tilt) rather than decoded neural intent?

## Hypothesis

Artifact-based signals from a consumer EEG headband are sufficient for real-time, directional control of a ground vehicle, and require no machine learning — only threshold detection on known signal morphologies.

## Abstract (draft)

This project documents the design and build of a brain-controlled RC car using a Muse 2 consumer EEG headband and an ESP32 microcontroller. Rather than attempting to decode conscious neural intent — a problem unsolved even in research-grade BCI — the system leverages reliable electrophysiological and mechanical artifacts: eye blinks (AF7/AF8 electrode spikes), jaw clenches (broadband EMG burst), and head tilt (accelerometer pitch/roll). Commands are transmitted from a browser-based dashboard over WebSocket to the car. The project explores the gap between the popular perception of "mind control" and what consumer EEG can actually deliver, and argues that artifact-based control is not a compromise but a pragmatic and reproducible approach to accessible BCI.

---

## Journal

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

---

## Notes for thesis chapters

### Chapter 1 — Background
- History of BCI: from invasive implants to consumer EEG
- What consumer EEG can and cannot do
- Prior art: OpenBCI, Muse SDK projects, other RC car BCIs
- Why artifact-based control is legitimate (not a workaround)

### Chapter 2 — System design
- Architecture decisions and pivots (documented in SUMMARY.md)
- Signal chain: Muse 2 -> Web Bluetooth -> muse-js -> threshold detection -> WebSocket -> ESP32 -> TB6612 -> motors
- Why the laptop is a required middleman
- Software stack choices

### Chapter 3 — Implementation
- ESP32 firmware
- Browser dashboard
- Signal thresholds and how they were tuned
- Latency measurements (browser to car)

### Chapter 4 — Results
- Reliability of blink detection
- Reliability of jaw clench detection
- Steering accuracy via accelerometer
- Failure modes

### Chapter 5 — Discussion
- What worked, what didn't
- The "mind control" framing problem in media and demos
- Accessibility angle: artifact-based BCI is usable without training
- What would be needed to do real neural intent decoding
