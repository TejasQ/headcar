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

WebSocketsServer ws(81);

enum DriveState { IDLE, FORWARD, REVERSE };
DriveState driveState = IDLE;
float steerValue  = 0.0;   // -1.0 = full left, +1.0 = full right
unsigned long driveUntil = 0;

void motorsOff() {
  digitalWrite(STBY, LOW);
}

// Called every loop — applies current driveState + steerValue to motors.
// Differential steering: steerValue shifts power between left and right.
void applyMotors() {
  if (driveState == IDLE) {
    motorsOff();
    return;
  }
  int leftSpeed  = constrain(180 + (int)(steerValue * 80), 0, 255);
  int rightSpeed = constrain(180 - (int)(steerValue * 80), 0, 255);

  digitalWrite(STBY, HIGH);
  if (driveState == FORWARD) {
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

  if (msg == "blink") {
    driveState = FORWARD;
    driveUntil = millis() + 200;
    Serial.println("blink → forward");
  } else if (msg == "clench") {
    driveState = REVERSE;
    driveUntil = millis() + 200;
    Serial.println("clench → reverse");
  } else if (msg == "stop") {
    driveState = IDLE;
    Serial.println("stop");
  } else if (msg.startsWith("steer:")) {
    steerValue = constrain(msg.substring(6).toFloat(), -1.0, 1.0);
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
  if (driveState != IDLE && millis() > driveUntil) driveState = IDLE;
  applyMotors();
}
