// ============================================================================
// car.ino — ESP32 firmware for the brain-controlled car.
//
// HOW THIS FILE IS SHAPED (read in this order):
//   1. #includes + constants  — libraries and fixed configuration
//   2. global variables       — the car's current state (drive/steer values)
//   3. helper functions       — motorsOff(), applyMotors(), onWsEvent()
//   4. setup()                — runs ONCE when the board powers on
//   5. loop()                 — runs FOREVER, thousands of times per second
//
// An Arduino sketch always has exactly setup() + loop(). Everything else is
// support called from those two. To understand the program, trace one command:
// the laptop sends the text "drive:0.5" over WebSocket → onWsEvent() parses it
// → loop() calls applyMotors() → the motors spin. That single path is the
// whole program.
// ============================================================================

#include <WiFi.h>              // ESP32 WiFi (station mode — joins a hotspot)
#include <ESPmDNS.h>           // lets the laptop reach the board as "car.local"
#include <WebSocketsServer.h>  // the server the laptop dashboard connects to

// ── Fill these in ──────────────────────────────────────────────
// The WiFi network the car joins. The ESP32 is 2.4 GHz ONLY — the iPhone
// hotspot must have "Maximize Compatibility" on or the board can't see it.
const char* ssid     = "Jon iPhone 16";
const char* password = "jon42027";
// ──────────────────────────────────────────────────────────────

// Motor driver pins. Now wired to an L298N (swapped from the TB6612). The control
// scheme is the SAME — each motor has one PWM "enable" pin (speed) + two direction
// pins — so the code below is unchanged; only the board-side labels differ:
//   code name  ESP32 GPIO   ->  L298N pin
//   PWMA        4           ->  ENA   (Motor A speed/enable)
//   AIN1        5           ->  IN1   (Motor A direction 1)
//   AIN2        18          ->  IN2   (Motor A direction 2)
//   PWMB        19          ->  ENB   (Motor B speed/enable)
//   BIN1        15          ->  IN3   (Motor B direction 1)
//   BIN2        16          ->  IN4   (Motor B direction 2)
//   STBY        17          ->  (UNUSED — L298N has no standby pin; leave disconnected)
// Remove the ENA/ENB jumpers on the L298N so these PWM pins control speed.
#define PWMA  4    // -> ENA  Motor A speed (PWM 0–255)
#define AIN1  5    // -> IN1  Motor A direction 1
#define AIN2  18   // -> IN2  Motor A direction 2
#define PWMB  19   // -> ENB  Motor B speed (PWM 0–255)
#define BIN1  15   // -> IN3  Motor B direction 1
#define BIN2  16   // -> IN4  Motor B direction 2
#define STBY  17   // UNUSED on L298N (harmless no-op writes); leave the pin disconnected

// ── Car state ──────────────────────────────────────────────────
// These globals hold "what the car is currently being told to do". onWsEvent()
// WRITES them when a command arrives; applyMotors() READS them every loop. This
// split (one place updates state, another acts on it) is a common firmware shape.
//
// Drive value in [-1, 1]. Positive = forward, negative = reverse,
// magnitude = speed. Updated via the `drive:X` WebSocket command.
float driveValue = 0.0;
float steerValue = 0.0;           // [-1, 1], negative/positive = steer one way/other
unsigned long lastDriveMsg = 0;   // millis() timestamp of the last drive command (for the watchdog)

// Safety watchdog — if no drive: command arrives within this window the motors
// stop. Protects against laptop disconnect / browser tab crash while moving.
// (Without this, a frozen browser mid-"drive:1.0" would leave the car running away.)
const unsigned long WATCHDOG_MS = 500;

// PWM = "pulse width modulation": the speed pins are switched on/off very fast,
// and the fraction of on-time (0–255) sets the effective motor voltage = speed.
// Below MIN_PWM the motors don't actually spin (stiction — static friction), so
// we never command less than 120; that's why drive starts at a floor, not 0.
const int MIN_PWM = 120;
const int MAX_PWM = 255;
const float DRIVE_DEADZONE = 0.05;      // ignore tiny drive values (noise) — treat as "stop"
// Differential steering: how sharply the car turns at full steer. 1.0 = inside wheel
// stops (sharp pivot); >1.0 = inside wheel counter-rotates → drift/spin. Fixed here;
// the dashboard's single "Steering sensitivity" slider controls how much head tilt is
// needed to reach full steer (so one knob governs the whole tilt→turn feel).
const float STEER_DIFFERENTIAL = 1.0;
// Per-side speed trim (HEA-18) for mismatched motors. If the car veers when it
// should go straight, nudge this: POSITIVE = left side faster (use when the car
// pulls RIGHT); NEGATIVE = right side faster (pulls LEFT). Sensible range about
// [-0.15, 0.15]. 0.0 = matched motors, no trim (current default — inert).
const float MOTOR_TRIM = 0.0;

WebSocketsServer ws(81);  // the WebSocket server object, listening on port 81

// Cut all motor power immediately. STBY LOW disables the driver chip entirely;
// setting both PWMs to 0 is belt-and-suspenders. Called by the watchdog and the
// deadzone check below, and once in setup() so the car never boots moving.
void motorsOff() {
  digitalWrite(STBY, LOW);
  ledcWrite(PWMA, 0);
  ledcWrite(PWMB, 0);
}

// Drive ONE motor side from a signed command in [-1, 1]: the sign picks direction
// (forward/reverse) and the magnitude picks speed. Per-side direction control is what
// lets the inside wheel counter-rotate for a sharp pivot/drift turn.
void setSide(int in1, int in2, int pwmPin, float cmd) {
  float m = fabs(cmd);
  if (m < 0.03) {                                  // ~zero → coast this side (both pins LOW)
    digitalWrite(in1, LOW); digitalWrite(in2, LOW);
    ledcWrite(pwmPin, 0);
    return;
  }
  if (cmd > 0) { digitalWrite(in1, HIGH); digitalWrite(in2, LOW); }   // forward
  else         { digitalWrite(in1, LOW);  digitalWrite(in2, HIGH); }  // reverse
  // Map magnitude 0..1 onto MIN_PWM..MAX_PWM (skip the dead 0..120 stiction band).
  ledcWrite(pwmPin, constrain(MIN_PWM + (int)(m * (MAX_PWM - MIN_PWM)), 0, 255));
}

// Called every loop — applies current driveValue + steerValue to motors.
// This is where the abstract numbers become real pin voltages.
void applyMotors() {
  // SAFETY GATE first: stop if the last command is older than WATCHDOG_MS
  // (laptop went away) OR the command is within the deadzone (basically "stop").
  // millis() = ms since boot; the subtraction is "how long since the last command".
  if (millis() - lastDriveMsg > WATCHDOG_MS || fabs(driveValue) < DRIVE_DEADZONE) {
    motorsOff();
    return;  // early-return: nothing below runs, motors stay off
  }

  digitalWrite(STBY, HIGH);  // enable the driver chip
  // Signed per-side mixing: each side = base drive ± steering (+ trim). steerDifferential
  // scales the turn; when the steer term pushes a side past 0 it flips sign → that wheel
  // reverses (counter-rotation) for a sharp pivot/drift. constrain keeps it in [-1, 1].
  float steerAmt = steerValue * STEER_DIFFERENTIAL;
  float leftCmd  = constrain(driveValue + steerAmt + MOTOR_TRIM, -1.0, 1.0);
  float rightCmd = constrain(driveValue - steerAmt - MOTOR_TRIM, -1.0, 1.0);
  setSide(AIN1, AIN2, PWMA, leftCmd);
  setSide(BIN1, BIN2, PWMB, rightCmd);
}

// Called automatically by the WebSocket library every time a message arrives.
// This is an "event handler" / callback — we don't call it; we register it in
// setup() and the library invokes it for us. Its only job: parse the text
// command and update the state globals. It does NOT touch the motors directly —
// loop()/applyMotors() does that. (Decoupling input from action = safer.)
void onWsEvent(uint8_t client, WStype_t type, uint8_t* payload, size_t length) {
  if (type != WStype_TEXT) return;        // ignore non-text frames (pings, binary)
  String msg = String((char*)payload);    // raw bytes → a String like "drive:0.5"

  // Wire protocol is plain text "key:value". substring(6) skips past "drive:"
  // (6 chars) to get "0.5"; .toFloat() parses it; constrain() clamps to [-1, 1].
  if (msg.startsWith("drive:")) {
    driveValue = constrain(msg.substring(6).toFloat(), -1.0, 1.0);
    lastDriveMsg = millis();              // stamp the time → resets the watchdog
  } else if (msg.startsWith("steer:")) {
    steerValue = constrain(msg.substring(6).toFloat(), -1.0, 1.0);
  } else if (msg == "stop") {
    driveValue = 0.0;                     // explicit stop command
    lastDriveMsg = millis();
  }
}

// setup() runs exactly ONCE at power-on/reset. Its job is to put the board into
// a known good state: configure pins, connect to WiFi, start the servers. The
// order here matches the boot log you saw on Serial Monitor.
void setup() {
  Serial.begin(115200);  // open the USB serial link @115200 baud (for the log prints)

  // Tell the chip these GPIOs are OUTPUTS (we drive them; we don't read them).
  pinMode(AIN1, OUTPUT); pinMode(AIN2, OUTPUT);
  pinMode(BIN1, OUTPUT); pinMode(BIN2, OUTPUT);
  pinMode(STBY, OUTPUT);
  // Configure the two PWM (speed) pins: 1000 Hz switching, 8-bit resolution
  // (8 bits = values 0–255, which is why MIN/MAX_PWM are on that scale).
  ledcAttach(PWMA, 1000, 8);
  ledcAttach(PWMB, 1000, 8);
  motorsOff();  // start stopped — never boot into motion

  // Join the hotspot. This loop BLOCKS until connected: each failed check waits
  // 500 ms and prints a dot — those dots you saw before "IP:" are this line.
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.printf("\nIP: %s\n", WiFi.localIP().toString().c_str());  // print our assigned IP

  // Start mDNS so the laptop can use "car.local" instead of the raw IP (which
  // the router can change). MDNS.begin("car") → the ".local" is implied.
  if (MDNS.begin("car")) Serial.println("mDNS started → car.local");

  ws.begin();              // start listening for WebSocket connections on port 81
  ws.onEvent(onWsEvent);   // register our handler — library calls it per message
  Serial.println("WebSocket server ready on port 81");
}

// loop() runs FOREVER after setup(), as fast as the chip can go (many thousands
// of times/sec). It does just two things every pass:
void loop() {
  ws.loop();       // 1. service the network: process incoming messages (may fire onWsEvent)
  applyMotors();   // 2. push the current state to the motors (and enforce the watchdog)
}
// Because applyMotors() runs every pass, the watchdog is checked continuously —
// the instant commands stop arriving for 500 ms, the very next loop cuts power.
