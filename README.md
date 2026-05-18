# headcar

Brain-controlled 4WD RC car using a Muse 2 EEG headband. Head tilts steer, blinks drive forward, jaw clenches reverse. Built with an ESP32 on the car and a Next.js browser app on the laptop as the BLE host.

## Repo structure

```
laptop/   Next.js dashboard — connects to Muse via Web Bluetooth, sends commands to car over WebSocket
car/      ESP32 Arduino sketch — WiFi, WebSocket server, GPIO to TB6612FNG motor driver
```

## Prerequisites

- Node.js 18+
- Chrome or Edge (Web Bluetooth is Chromium-only)
- Arduino IDE 2.x with ESP32 board support added:
  `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
- CP2102 USB driver (Windows/macOS may need this for the AZ-Delivery ESP32)

## Running the laptop dashboard

```bash
cd laptop
npm install
npm run dev
```

Open `http://localhost:3000` in Chrome. Use localhost, not the Vercel URL, when driving — HTTPS blocks plain `ws://` WebSocket connections.

## Flashing the ESP32

1. Open `car/car.ino` in Arduino IDE 2.x
2. Set your WiFi credentials in the two `const char*` lines at the top
3. Select board: ESP32 Dev Module
4. Select the correct COM port
5. Click Upload

After flashing, the Serial Monitor (115200 baud) will print the IP address and confirm when the WebSocket server is ready.

## Driving

1. Power the car (18650 pack)
2. Run `npm run dev` in `laptop/`
3. Open `http://localhost:3000` in Chrome
4. Click Connect Muse, then Connect car
5. Blink to go forward, jaw clench to reverse

## Simulate mode

No Muse yet? Click Simulate on the dashboard. It fires fake blink and jaw clench events so you can test the full browser to car pipeline before the headband arrives.

## Hardware

See `SUMMARY.md` for the full parts list, wiring diagram, GPIO pinout, and power architecture.
