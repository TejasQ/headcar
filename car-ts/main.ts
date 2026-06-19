/*
 * headcar — ESP32 firmware, TypeScript (Moddable XS) port of car/car.ino
 * SPIKE — see car-ts/README.md. Not yet flashed/validated; mirrors the C++ behavior.
 *
 * Same job as the Arduino sketch: join WiFi, advertise car.local, run a WebSocket
 * server on port 81, parse `drive:X` / `steer:X`, drive an L298N, and cut the
 * motors if no `drive:` arrives within WATCHDOG_MS.
 *
 * Wiring is identical to the C++ build (L298N):
 *   PWMA 4 -> ENA, AIN1 5 -> IN1, AIN2 18 -> IN2   (Motor A = left, OUT1/OUT2)
 *   PWMB 19 -> ENB, BIN1 15 -> IN3, BIN2 16 -> IN4  (Motor B = right, OUT3/OUT4)
 *   STBY 17 is unused on the L298N.
 *
 * Markers: "VERIFY:" = a Moddable API detail to confirm against the installed
 * SDK version when you first build (I could not compile/flash here).
 */

import Digital from "pins/digital";
import PWM from "pins/pwm";
import Time from "time";
import Timer from "timer";
import WiFi from "wifi";
import Net from "net";
import { Server } from "websocket";
import MDNS from "mdns";
import config from "mc/config";

// --- Tunables (kept identical to car/car.ino) ---------------------------------
const WATCHDOG_MS = 500;          // no drive: within this -> stop
const DRIVE_DEADZONE = 0.05;      // |cmd| below this = coast
const STEER_DIFFERENTIAL = 1.0;   // signed per-side mix; 1.0 = sharp pivot
const MOTOR_TRIM = 0.0;           // left/right balance correction
const CONTROL_HZ_MS = 50;         // control-loop period (20 Hz)

// PWM duty. The C++ used 8-bit LEDC (MIN_PWM 120 .. MAX_PWM 255). Moddable's PWM
// write range is 0..(2^resolution - 1). VERIFY the default resolution on your
// build; this assumes 10-bit (0..1023) and scales the same 120/255 floor.
const DUTY_MAX = 1023;
const MIN_DUTY = Math.round((120 / 255) * DUTY_MAX); // ~481 — overcome stiction

// --- Pins ---------------------------------------------------------------------
// VERIFY: Moddable Digital/PWM constructor option names ({ pin, mode } / { pin }).
const AIN1 = new Digital({ pin: 5, mode: Digital.Output });
const AIN2 = new Digital({ pin: 18, mode: Digital.Output });
const BIN1 = new Digital({ pin: 15, mode: Digital.Output });
const BIN2 = new Digital({ pin: 16, mode: Digital.Output });
const PWMA = new PWM({ pin: 4 });
const PWMB = new PWM({ pin: 19 });

// --- State --------------------------------------------------------------------
let driveValue = 0;   // [-1, 1] forward/reverse
let steerValue = 0;   // [-1, 1] left/right
let lastDriveMs = 0;  // Time.ticks of the last drive: message

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function dutyFor(mag: number): number {
  // mag in [0,1] -> [MIN_DUTY, DUTY_MAX]
  return Math.round(MIN_DUTY + clamp(mag, 0, 1) * (DUTY_MAX - MIN_DUTY));
}

function stopAll(): void {
  AIN1.write(0); AIN2.write(0);
  BIN1.write(0); BIN2.write(0);
  PWMA.write(0); PWMB.write(0);
}

// One motor channel: sign -> direction pins, magnitude -> PWM duty.
function setSide(in1: Digital, in2: Digital, pwm: PWM, cmd: number): void {
  const mag = Math.min(1, Math.abs(cmd));
  if (mag < DRIVE_DEADZONE) {        // coast
    in1.write(0); in2.write(0); pwm.write(0);
    return;
  }
  if (cmd > 0) { in1.write(1); in2.write(0); }   // forward: IN1=H, IN2=L
  else         { in1.write(0); in2.write(1); }   // reverse: IN1=L, IN2=H
  pwm.write(dutyFor(mag));
}

// Control loop + watchdog (mirrors applyMotors() in the C++).
function applyMotors(): void {
  const now = Time.ticks;
  if (now - lastDriveMs > WATCHDOG_MS || Math.abs(driveValue) < DRIVE_DEADZONE) {
    stopAll();
    return;
  }
  const steerAmt = steerValue * STEER_DIFFERENTIAL;
  const left = clamp(driveValue + steerAmt + MOTOR_TRIM, -1, 1);
  const right = clamp(driveValue - steerAmt - MOTOR_TRIM, -1, 1);
  setSide(AIN1, AIN2, PWMA, left);
  setSide(BIN1, BIN2, PWMB, right);
}

function handleCommand(text: string): void {
  if (text.startsWith("drive:")) {
    driveValue = clamp(parseFloat(text.slice(6)) || 0, -1, 1);
    lastDriveMs = Time.ticks;
  } else if (text.startsWith("steer:")) {
    steerValue = clamp(parseFloat(text.slice(6)) || 0, -1, 1);
  }
}

// --- WebSocket server (port 81) ----------------------------------------------
// VERIFY: Server message constants + callback signature for your Moddable version.
function startServer(): void {
  const ws = new Server({ port: 81 });
  ws.callback = function (message: number, value: unknown) {
    switch (message) {
      case Server.receive:
        handleCommand(String(value));
        break;
      case Server.disconnect:
        // Don't force-stop here; the watchdog handles "no commands -> stop".
        break;
    }
  };
  trace("WebSocket server on :81\n");
}

// --- mDNS (car.local) ---------------------------------------------------------
// VERIFY: mdns module API; on some builds claiming the hostname is async.
function startMDNS(): void {
  new MDNS({ hostName: "car" }, function (message: number, value: unknown) {
    if (1 === message) trace(`mDNS: car.local -> ${value}\n`);
  });
}

// --- Boot: WiFi -> server + mDNS ---------------------------------------------
stopAll();
const monitor = new WiFi(
  { ssid: config.ssid, password: config.password },
  function (msg: string) {
    switch (msg) {
      case WiFi.gotIP:
        trace(`IP: ${Net.get("IP")}\n`);
        startServer();
        startMDNS();
        break;
      case WiFi.disconnected:
        trace("WiFi disconnected\n");
        break;
    }
  }
);

// Run the control loop / watchdog forever.
Timer.repeat(applyMotors, CONTROL_HZ_MS);
