// Catalog category: electronics. One import per family file in this folder; specs that
// only this category's families use (their real-object sizes) go in SPECS.
// This file belongs to the electronics category alone, so parallel work on other
// categories never touches it.

import cableClip from "./cable-clip.js";
import projectBox from "./project-box.js";
import pcbCase from "./pcb-case.js";
import cableWinder from "./cable-winder.js";
import wireChannel from "./wire-channel.js";
import stripClip from "./strip-clip.js";
import deviceBracket from "./device-bracket.js";
import fanGrill from "./fan-grill.js";
import chargingDock from "./charging-dock.js";
import cableTag from "./cable-tag.js";
import solderingStand from "./soldering-stand.js";

export const FAMILIES = [cableClip, projectBox, pcbCase, cableWinder, wireChannel, stripClip, deviceBracket,
  fanGrill, chargingDock, cableTag, solderingStand];

// Development boards: board length w x width d, and where the mounting holes
// are (hx x hy apart, the first column x0 in from the board's end, hole
// diameter), from the makers' mechanical drawings. Boards with no mounting
// holes leave hx/hy out and rest on a ledge. The Uno's holes are not a
// rectangle, so it names its own pattern.
const board = (id, names, dims, note, extra = {}) => ({ id, kind: "pcb", names, dims, label: names[0], note, ...extra });

// LED strips and their kin: width x thickness of the strip as it lies.
const strip = (id, names, w, t, note) => ({ id, kind: "ledstrip", names, dims: { w, t }, label: names[0], note });

// PC and project fans: frame size, and the screw-hole diameter they take.
// The hole spacing follows from the size (see fan-grill.js).
const fan = (size, hole) => ({ id: `fan-${size}`, kind: "fan", names: [`${size}mm fan`, `${size} mm fan`, `${size} fan`],
  dims: { size, hole }, label: `${size} mm fan`, note: `a ${size} mm fan` });

// Box-shaped gadgets a wall bracket holds: w x h x thickness t.
const device = (id, names, w, h, t, note) => ({ id, kind: "device", names, dims: { w, h, t }, label: names[0], note });

// Earbud charging cases, standing up: width w, height h, thickness t, from
// the makers' spec sheets. Watch charger pucks: diameter d and thickness t.
const caseOf = (id, names, w, h, t) => ({ id, kind: "case", names, dims: { w, h, t }, label: names[0],
  note: `${names[0]} case (${w} x ${h} x ${t} mm)` });

export const SPECS = [
  board("pcb-pi4", ["Raspberry Pi 4", "Pi 4", "RPi 4", "Raspberry Pi", "Pi 4B", "Raspberry Pi 4B"], { w: 85, d: 56, hx: 58, hy: 49, x0: 3.5, hole: 2.7 },
    "a Raspberry Pi 4 (85 x 56 mm, holes 58 x 49 mm from 3.5 mm in)"),
  board("pcb-pi5", ["Raspberry Pi 5", "Pi 5", "RPi 5"], { w: 85, d: 56, hx: 58, hy: 49, x0: 3.5, hole: 2.7 },
    "a Raspberry Pi 5 (85 x 56 mm, holes 58 x 49 mm from 3.5 mm in)"),
  board("pcb-pi3", ["Raspberry Pi 3", "Pi 3", "RPi 3", "Pi 3B", "Raspberry Pi 3B"], { w: 85, d: 56, hx: 58, hy: 49, x0: 3.5, hole: 2.7 },
    "a Raspberry Pi 3 (85 x 56 mm, holes 58 x 49 mm from 3.5 mm in)"),
  board("pcb-pizero", ["Pi Zero", "Raspberry Pi Zero", "Pi Zero 2", "Pi Zero W", "Pi Zero 2 W"], { w: 65, d: 30, hx: 58, hy: 23, x0: 3.5, hole: 2.7 },
    "a Raspberry Pi Zero (65 x 30 mm, holes 58 x 23 mm)"),
  board("pcb-pico", ["Pi Pico", "Raspberry Pi Pico", "Pico", "Pico W", "Pico 2", "RP2040"], { w: 51, d: 21, hx: 47, hy: 11.4, x0: 2, hole: 2.1 },
    "a Raspberry Pi Pico (51 x 21 mm, holes 47 x 11.4 mm)"),
  board("pcb-uno", ["Arduino Uno", "Arduino", "Arduino Leonardo", "Uno R3", "Uno R4"], { w: 68.6, d: 53.3, hole: 3.2 },
    "an Arduino Uno (68.6 x 53.3 mm, its own four-hole pattern)", { pattern: "uno" }),
  board("pcb-nano", ["Arduino Nano", "Nano Every", "Arduino Nano ESP32"], { w: 45, d: 18 }, "an Arduino Nano (45 x 18 mm, no mounting holes)"),
  board("pcb-esp32-devkit", ["ESP32", "ESP32 DevKit", "ESP32 DevKitC", "ESP32 dev board", "NodeMCU 32S"], { w: 55, d: 28 },
    "an ESP32 DevKitC (about 55 x 28 mm, no mounting holes; clones vary)"),
  board("pcb-d1-mini", ["Wemos D1 mini", "D1 mini", "ESP8266 D1 mini"], { w: 34.2, d: 25.6 }, "a Wemos D1 mini (34.2 x 25.6 mm, no mounting holes)"),

  strip("ledstrip-ws2812b", ["WS2812B", "WS2812", "NeoPixel strip", "neopixel", "addressable led strip"], 10, 3, "a 10 mm WS2812B strip"),
  strip("ledstrip-5050", ["5050 led strip", "5050 strip", "5050"], 10, 2.5, "a 10 mm 5050 LED strip"),
  strip("ledstrip-2835", ["2835 led strip", "2835 strip", "2835"], 8, 2, "an 8 mm 2835 LED strip"),
  strip("ledstrip-cob", ["COB led strip", "COB strip"], 8, 2, "an 8 mm COB LED strip"),
  strip("ledstrip-waterproof", ["waterproof led strip", "silicone led strip", "IP67 led strip", "outdoor led strip"], 12, 4.5,
    "a silicone-sleeved waterproof strip (about 12 x 4.5 mm)"),
  strip("ledstrip-neon-flex", ["neon flex", "led neon", "neon strip", "neon rope light"], 6, 12, "6 x 12 mm LED neon flex, mounted on its narrow side"),

  fan(25, 2.6), fan(30, 3.2), fan(40, 3.4), fan(50, 3.4), fan(60, 4.3), fan(70, 4.3), fan(80, 4.3), fan(92, 4.3),
  fan(120, 4.3), fan(140, 4.3), fan(200, 4.5),

  device("device-switch-5port", ["5 port switch", "network switch", "ethernet switch", "gigabit switch", "TL-SG105"], 100, 98, 25,
    "a 5-port desktop switch (TP-Link TL-SG105, 100 x 98 x 25 mm)"),
  device("device-hdd-35", ["3.5 inch hard drive", "3.5 hard drive", "3.5 drive", "desktop hard drive", "NAS drive"], 147, 101.6, 26.1,
    "a 3.5 inch hard drive (147 x 101.6 x 26.1 mm)"),
  device("device-drive-25", ["2.5 inch drive", "2.5 drive", "2.5 hard drive", "laptop hard drive", "2.5 ssd", "sata ssd"], 100, 69.85, 9.5,
    "a 2.5 inch drive (100 x 69.85 mm, 7 or 9.5 mm thick)"),
  device("device-samsung-t7", ["Samsung T7", "T7 SSD", "T7 Shield", "portable ssd"], 85, 57, 8, "a Samsung T7 portable SSD (85 x 57 x 8 mm)"),

  caseOf("case-airpods-pro-2", ["AirPods Pro", "AirPods Pro 2", "AirPods Pro 3", "airpods"], 60.6, 45.2, 21.7),
  caseOf("case-airpods-4", ["AirPods 4", "AirPods 3", "AirPods 3rd gen"], 50.1, 46.2, 21.2),
  caseOf("case-airpods-2", ["AirPods 2", "AirPods 2nd gen"], 44.3, 53.5, 21.3),
  caseOf("case-galaxy-buds-2-pro", ["Galaxy Buds", "Galaxy Buds2 Pro", "Galaxy Buds 2 Pro", "Galaxy Buds2", "Samsung buds"], 50.2, 50.1, 27.7),
  caseOf("case-pixel-buds-pro", ["Pixel Buds", "Pixel Buds Pro", "Pixel Buds Pro 2"], 63.2, 50, 25),
  { id: "puck-apple-watch", kind: "puck", names: ["Apple Watch charger", "Apple Watch puck", "Apple Watch charging puck", "Apple Watch"],
    dims: { d: 27.6, t: 7.5 }, label: "Apple Watch charger", note: "an Apple Watch charger puck (about 27.6 mm across, 7.5 mm thick)" },
];
