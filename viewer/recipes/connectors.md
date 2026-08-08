---
tag: ports
title: Ports, connectors and chip packages
match: usb, usb-c, usb c, type-c, usb-a, micro usb, mini usb, hdmi, ethernet, rj45, rj11, barrel jack, dc jack, power jack, audio jack, 3.5mm jack, jst, dupont, header, pin header, sd card, micro sd, connector, port, cutout, panel mount, chip, ic, dip, soic, qfp, tqfp, esp32 module, xt60, xt30, banana plug, toggle switch, rocker switch, momentary switch, potentiometer, led panel, fuse holder
---

Cutouts for connectors on a printed case, and the footprints chips actually
occupy. Two different jobs — the first needs clearance, the second needs room.

**Port cutouts.** Columns: **connector body · cutout to make**. The cutout is
the body plus clearance for print squish and for the moulded shroud most cables
have; go tighter and the plug will not seat.

- **USB-A** (receptacle): 12.0 × 4.5 · cut **13.0 × 5.5**
- **USB-C**: 8.9 × 3.2 · cut **10.0 × 4.2** (a chunky cable shroud wants 12 × 6)
- **Micro-USB B**: 7.5 × 3.0 · cut **8.6 × 4.0**
- **HDMI type A**: 14.0 × 4.6 · cut **15.4 × 6.0**
- **Mini HDMI (C)**: 10.5 × 2.5 · cut **11.6 × 3.6**
- **RJ45 / Ethernet**: 15.9 × 13.5 · cut **17.0 × 14.5** (the latch needs the
  extra height, not the width)
- **Barrel jack 5.5 / 2.1**: panel hole **Ø8.2**, thread length 7 — check your
  jack, 8.0 and 9.5 both exist
- **3.5 mm audio**: panel hole **Ø6.2**
- **Micro SD**: slot **12.0 × 1.8**; full SD **24.5 × 2.5**
- **XT60**: **16.0 × 8.2**; XT30: **11.0 × 6.0**
- **Banana socket**: Ø **12.2** panel hole (4 mm socket bodies vary — measure)
- **Panel fuse holder (5 × 20 mm)**: Ø **12.2**
- **Rocker switch (KCD1, common)**: **21.2 × 15.2** snap-fit rectangle
- **Momentary 12 mm tact button**: Ø **12.2**; 16 mm metal button: Ø **16.2**
- **Potentiometer / rotary encoder**: Ø **7.2** shaft hole, plus a Ø9 boss recess

Rules for cutouts:

- **Overshoot the wall.** A cutter that stops level with the outside face leaves
  a coincident plane and prints a skin across the hole. Start 1 mm inside and
  run 1 mm past.
- **Cut through a FLAT wall.** A port on a rounded corner is a fitting problem
  no clearance fixes.
- **A vertical-walled rectangle prints with a sagging top edge.** Either add a
  0.4 mm chamfer to the top of the cutout, or make the top edge a shallow arch,
  and it comes out square.
- Leave **1.5 mm minimum** of wall between two cutouts, more in PLA.

**Chip and module footprints** — the board area a part occupies, for a case,
a jig or a lid clearance:

- **DIP**: 2.54 pitch, rows **7.62** apart (narrow) or **15.24** (wide). DIP-8
  body 9.8 × 6.4; DIP-16 body 19.7 × 6.4; DIP-28 wide 35.6 × 15.2.
- **SOIC**: 1.27 pitch; SOIC-8 body 4.9 × 3.9, SOIC-16 9.9 × 3.9 (plus ~1.5
  each side for the leads).
- **TQFP-32**: body 7 × 7, 0.8 pitch; **TQFP-44**: 10 × 10; **TQFP-64**: 10 × 10
  at 0.5 pitch. Add 1 mm all round for the leads.
- **ESP32-WROOM-32**: module **25.5 × 18.0 × 3.1**, and the antenna end must sit
  over open air or off the edge of any metal — never bury it in a pocket.
- **Pin headers**: **2.54** pitch, pin 0.64 square, plastic 2.5 tall. For a
  clearance slot over an installed header use pitch × count + 1.0.
- **0.1 in prototyping board**: holes Ø1.0 on 2.54; standard boards 50 × 70 and
  70 × 90.

Clearances that stop a case fighting the board:

- **2 mm above the tallest component** unless you have measured it. Electrolytic
  caps and pin headers are usually the tallest thing.
- **1 mm around the board outline** — PCBs are cut to ±0.2 and printed pockets
  shrink.
- Leave the **USB end open by 10 mm**, not flush: the cable's moulded shroud is
  wider than its plug.
- Anything that gets warm — a regulator, a stepper driver, a Pi — needs a vent
  slot above it, not a sealed lid.

Board mounting hole patterns for Raspberry Pi, Pico, Arduino and ESP32 devkits
are in the dev-board reference, not here.

You have everything you need — build it, and use these numbers rather than
recalling your own.
