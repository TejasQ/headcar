#include <WiFi.h>
#include <ESPmDNS.h>
#include <WebSocketsServer.h>

// ── Fill these in ──────────────────────────────────────────────
const char* ssid     = "Jon iPhone 16";
const char* password = "jon42027";
// ──────────────────────────────────────────────────────────────

// Motor driver pins (TB6612FNG)
#define PWMA  4
#define AIN1  5
#define AIN2  18
#define PWMB  19
#define BIN1  15
#define BIN2  16
#define STBY  17

// Drive value in [-1, 1]. Positive = forward, negative = reverse,
// magnitude = speed. Updated via the `drive:X` WebSocket command.
float driveValue = 0.0;
float steerValue = 0.0;
unsigned long lastDriveMsg = 0;

// Safety watchdog — if no drive: command arrives within this window the motors
// stop. Protects against laptop disconnect / browser tab crash while moving.
const unsigned long WATCHDOG_MS = 500;

// PWM scaling. Below MIN_PWM the motors don't actually spin (stiction).
const int MIN_PWM = 120;
const int MAX_PWM = 255;
const float DRIVE_DEADZONE = 0.05;
// Differential steering offset as a fraction of base PWM.
const float STEER_DIFFERENTIAL = 0.35;

WebSocketsServer ws(81);

void motorsOff() {
  digitalWrite(STBY, LOW);
  ledcWrite(PWMA, 0);
  ledcWrite(PWMB, 0);
}

// Called every loop — applies current driveValue + steerValue to motors.
void applyMotors() {
  if (millis() - lastDriveMsg > WATCHDOG_MS || fabs(driveValue) < DRIVE_DEADZONE) {
    motorsOff();
    return;
  }
  bool forward = driveValue > 0;
  float mag = fabs(driveValue);
  int basePWM  = MIN_PWM + (int)(mag * (MAX_PWM - MIN_PWM));
  int offset   = (int)(steerValue * basePWM * STEER_DIFFERENTIAL);
  int leftSpeed  = constrain(basePWM + offset, 0, 255);
  int rightSpeed = constrain(basePWM - offset, 0, 255);

  digitalWrite(STBY, HIGH);
  if (forward) {
    digitalWrite(AIN1, HIGH); digitalWrite(AIN2, LOW);
    digitalWrite(BIN1, HIGH); digitalWrite(BIN2, LOW);
  } else {
    digitalWrite(AIN1, LOW);  digitalWrite(AIN2, HIGH);
    digitalWrite(BIN1, LOW);  digitalWrite(BIN2, HIGH);
  }
  ledcWrite(PWMA, leftSpeed);
  ledcWrite(PWMB, rightSpeed);
}

void onWsEvent(uint8_t client, WStype_t type, uint8_t* payload, size_t length) {
  if (type != WStype_TEXT) return;
  String msg = String((char*)payload);

  if (msg.startsWith("drive:")) {
    driveValue = constrain(msg.substring(6).toFloat(), -1.0, 1.0);
    lastDriveMsg = millis();
  } else if (msg.startsWith("steer:")) {
    steerValue = constrain(msg.substring(6).toFloat(), -1.0, 1.0);
  } else if (msg == "stop") {
    driveValue = 0.0;
    lastDriveMsg = millis();
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(AIN1, OUTPUT); pinMode(AIN2, OUTPUT);
  pinMode(BIN1, OUTPUT); pinMode(BIN2, OUTPUT);
  pinMode(STBY, OUTPUT);
  ledcAttach(PWMA, 1000, 8);
  ledcAttach(PWMB, 1000, 8);
  motorsOff();

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.printf("\nIP: %s\n", WiFi.localIP().toString().c_str());

  if (MDNS.begin("car")) Serial.println("mDNS started → car.local");

  ws.begin();
  ws.onEvent(onWsEvent);
  Serial.println("WebSocket server ready on port 81");
}

void loop() {
  ws.loop();
  applyMotors();
}
