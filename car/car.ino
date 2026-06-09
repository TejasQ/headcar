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

// Motor driver pins (TB6612FNG). #define just gives a name to a GPIO number so
// the code reads "AIN1" instead of "5". These numbers are FIXED by how the board
// is physically wired (see README) — changing them here would not rewire anything.
// Each motor (A and B) has: one PWM pin (speed) + two direction pins (IN1/IN2).
#define PWMA  4    // Motor A speed   (PWM 0–255)
#define AIN1  5    // Motor A direction bit 1
#define AIN2  18   // Motor A direction bit 2
#define PWMB  19   // Motor B speed   (PWM 0–255)
#define BIN1  15   // Motor B direction bit 1
#define BIN2  16   // Motor B direction bit 2
#define STBY  17   // Standby — must be HIGH for the driver to do anything; LOW = motors off

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
// Differential steering: to turn, drive one wheel faster than the other. This is
// how much of the base speed to add to one side and subtract from the other.
const float STEER_DIFFERENTIAL = 0.35;

WebSocketsServer ws(81);  // the WebSocket server object, listening on port 81

// Cut all motor power immediately. STBY LOW disables the driver chip entirely;
// setting both PWMs to 0 is belt-and-suspenders. Called by the watchdog and the
// deadzone check below, and once in setup() so the car never boots moving.
void motorsOff() {
  digitalWrite(STBY, LOW);
  ledcWrite(PWMA, 0);
  ledcWrite(PWMB, 0);
}

// Called every loop — applies current driveValue + steerValue to motors.
// This is where the abstract number driveValue becomes real pin voltages.
void applyMotors() {
  // SAFETY GATE first: stop if the last command is older than WATCHDOG_MS
  // (laptop went away) OR the command is within the deadzone (basically "stop").
  // millis() = ms since boot; the subtraction is "how long since the last command".
  if (millis() - lastDriveMsg > WATCHDOG_MS || fabs(driveValue) < DRIVE_DEADZONE) {
    motorsOff();
    return;  // early-return: nothing below runs, motors stay off
  }

  bool forward = driveValue > 0;        // sign of driveValue picks direction
  float mag = fabs(driveValue);         // magnitude (0..1) picks speed

  // Map speed 0..1 onto the usable PWM range MIN_PWM..MAX_PWM (skips the dead
  // 0..120 band where motors won't turn). (int) truncates the float to a whole number.
  int basePWM  = MIN_PWM + (int)(mag * (MAX_PWM - MIN_PWM));
  // Steering: shift speed between the two sides. +offset to one, -offset to other.
  int offset   = (int)(steerValue * basePWM * STEER_DIFFERENTIAL);
  // constrain(x, 0, 255) clamps so we never send an out-of-range PWM value.
  int leftSpeed  = constrain(basePWM + offset, 0, 255);
  int rightSpeed = constrain(basePWM - offset, 0, 255);

  digitalWrite(STBY, HIGH);  // enable the driver chip
  // Direction truth table (per TB6612): IN1 HIGH / IN2 LOW = one way; swap = other.
  if (forward) {
    digitalWrite(AIN1, HIGH); digitalWrite(AIN2, LOW);
    digitalWrite(BIN1, HIGH); digitalWrite(BIN2, LOW);
  } else {
    digitalWrite(AIN1, LOW);  digitalWrite(AIN2, HIGH);
    digitalWrite(BIN1, LOW);  digitalWrite(BIN2, HIGH);
  }
  // Finally set the speeds. Direction pins say which way; these say how fast.
  ledcWrite(PWMA, leftSpeed);
  ledcWrite(PWMB, rightSpeed);
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
