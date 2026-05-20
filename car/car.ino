#include <WiFi.h>
#include <ESPmDNS.h>
#include <WebSocketsServer.h>

// ── Fill these in ──────────────────────────────────────────────
const char* ssid     = "Jon iPhone 16";
const char* password = "jon42027";
// ──────────────────────────────────────────────────────────────

// Motor driver pins (TB6612FNG, from README)
#define PWMA  4
#define AIN1  5
#define AIN2  18   // was 6 — GPIO 6 is a flash pin on ESP32, unusable
#define PWMB  19   // was 7 — GPIO 7 is a flash pin on ESP32, unusable
#define BIN1  15
#define BIN2  16
#define STBY  17

WebSocketsServer ws(81);

void motorsOff() {
  digitalWrite(STBY, LOW);
}

void driveForward(int ms) {
  digitalWrite(STBY, HIGH);
  // Left motor forward: AIN1=HIGH, AIN2=LOW
  digitalWrite(AIN1, HIGH);
  digitalWrite(AIN2, LOW);
  ledcWrite(PWMA, 180);
  // Right motor forward: BIN1=HIGH, BIN2=LOW
  digitalWrite(BIN1, HIGH);
  digitalWrite(BIN2, LOW);
  ledcWrite(PWMB, 180);

  delay(ms);
  motorsOff();
}

void driveReverse(int ms) {
  digitalWrite(STBY, HIGH);
  digitalWrite(AIN1, LOW);
  digitalWrite(AIN2, HIGH);
  ledcWrite(PWMA, 180);
  digitalWrite(BIN1, LOW);
  digitalWrite(BIN2, HIGH);
  ledcWrite(PWMB, 180);
  delay(ms);
  motorsOff();
}

void onWsEvent(uint8_t client, WStype_t type, uint8_t* payload, size_t length) {
  if (type != WStype_TEXT) return;
  String msg = String((char*)payload);
  if (msg == "blink") {
    Serial.println("blink → forward 200ms");
    driveForward(200);
  } else if (msg == "clench") {
    Serial.println("clench → reverse 200ms");
    driveReverse(200);
  } else if (msg == "stop") {
    Serial.println("stop");
    motorsOff();
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(AIN1, OUTPUT);
  pinMode(AIN2, OUTPUT);
  pinMode(BIN1, OUTPUT);
  pinMode(BIN2, OUTPUT);
  pinMode(STBY, OUTPUT);
  ledcAttach(PWMA, 1000, 8);  // 1 kHz, 8-bit (0–255)
  ledcAttach(PWMB, 1000, 8);
  motorsOff();

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.print("\nIP: ");
  Serial.println(WiFi.localIP());

  if (MDNS.begin("car")) {
    Serial.println("mDNS started → car.local");
  }

  ws.begin();
  ws.onEvent(onWsEvent);
  Serial.println("WebSocket server ready on port 81");
}

void loop() {
  ws.loop();
}
