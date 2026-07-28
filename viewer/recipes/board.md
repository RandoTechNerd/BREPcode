---
tag: devboard
title: Dev boards — Raspberry Pi, Pico, Arduino
match: raspberry pi, raspberry, rpi, pi zero, pi 4, pi 5, pi pico, pico, arduino, arduino uno, uno, esp32, devkit, nodemcu
---

Mounting patterns (all holes are the board's own, use standoffs or bosses):

- **Raspberry Pi 3 / 4 / 5** (full size): board 85 × 56, four holes Ø2.7
  (M2.5) on a **58 × 49** rectangle, 3.5 in from each board corner. Keep
  10 clear on the USB/Ethernet end and 5 above for HATs' pin header.
- **Pi Zero / Zero 2**: board 65 × 30, holes Ø2.7 (M2.5) on **58 × 23**,
  3.5 from corners.
- **Pi Pico / Pico W / Pico 2**: board 51 × 21, holes Ø2.1 (M2) on
  **47 × 11.4**, 2 from the ends.
- **Arduino Uno / Leonardo (R3 shape)**: outline 68.6 × 53.3. The four Ø3.2
  holes are NOT rectangular — from the bottom-left corner (USB on the left):
  (14.0, 2.5), (15.3, 50.6), (66.0, 17.8), (66.0, 45.7). Three bosses are
  plenty if one is awkward.
- **ESP32 / ESP8266 devkits**: no standard — most have no holes at all. Hold
  them by the EDGES: two rails with a 1.6mm PCB groove, 0.3 clearance each
  side of the stated board width, plus an end stop.

Boss/standoff rules: boss Ø = 2× hole, height ≥ 3 so solder joints underneath
clear the floor; M2.5 self-taps into a Ø2.2 printed hole for Pis. Case inner
clearance: board outline +0.5 per side. Always cut the port openings 1mm
oversize per side — connector positions vary by revision.

You have every dimension you need — build it. State which board you assumed.
