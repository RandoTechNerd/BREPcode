// A clip that hangs over the top edge of an aquarium's glass and holds
// something just inside it. The hanger is an upside-down U sized to the
// glass, with a small bump at the outside leg's tip that grips. What it holds:
//
//   ring    a C ring that snaps round airline, CO2 line or filter hose,
//           running along the glass. The whole thing is one flat profile,
//           printed lying on its side, so it has no overhang at all.
//   ledge   a shelf below the rim for a glass lid to rest on, with a 45
//           degree gusset under it. Also one flat profile on its side.
//   sleeve  an upright C sleeve a heater, thermometer, probe or dosing line
//           slides down into. Printed upside down (the U's top on the bed),
//           so the sleeve and both legs rise straight off the bed.

export default {
  id: "aquarium-clip",
  category: "pets",
  title: "Aquarium rim clip",
  summary: "a clip that hangs on the aquarium glass and holds airline, hose, a heater or thermometer, or a glass lid.",
  print: "ring and lid versions lie flat on their side, the sleeve version stands upside down; no supports. PETG (or ASA) for anything that sits in tank water; PLA slowly softens.",
  names: ["aquarium clip", "fish tank clip", "aquarium rim clip", "aquarium tube holder", "aquarium tubing clip",
    "aquarium holder clip", "rimless tank clip", "fish tank holder clip", "aquarium rim holder"],
  nouns: ["clip", "holder"],
  keywords: ["aquarium", "tank", "fish", "airline", "glass", "hose", "rimless", "tubing"],
  fits: ["aquarium-tube", "aquarium-glass"],
  fromSpec: (s) => (s.kind === "aquarium-glass" ? { glassT: s.dims.t } : { tubeD: s.dims.d }),
  specNote: "the ring snaps on a hair under that size; measure yours",
  primary: "tubeD",
  tips: ["for 8 mm glass", "for 12/16 hose", "longer reach", "wider"],
  examples: ["I want an airline tubing holder", "make me an aquarium clip for 8mm glass",
    "canister filter hose clip for 16/22 hose", "glass lid clip for 10mm glass"],
  params: {
    glassT: { default: 6, min: 3, max: 25, unit: "mm", label: "glass (or frame) thickness", say: ["glass", "thick", "thickness", "frame", "pane"] },
    hold: { default: "ring", unit: "choice", choices: ["ring", "sleeve", "ledge"], label: "what it holds: a snap ring, an upright sleeve, or a lid ledge",
      words: { ledge: ["lid", "ledge", "lid support", "glass lid", "cover"], sleeve: ["sleeve", "upright", "vertical", "heater", "thermometer", "probe"], ring: ["ring", "snap ring", "horizontal"] } },
    tubeD: { default: 6, min: 3, max: 40, unit: "mm", label: "outside diameter of the tube, hose or heater", say: ["diameter", "od", "outside"] },
    width: { default: 12, min: 6, max: 40, unit: "mm", label: "clip width along the glass", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    drop: { default: 25, min: 10, max: 120, unit: "mm", label: "how far it reaches down inside the tank", say: ["deep", "down", "drop", "below", "reach"], more: ["deeper", "longer"], less: ["shorter"] },
    lidDrop: { default: 6, min: 0, max: 30, unit: "mm", label: "lid ledge: how far below the rim the lid sits", say: ["lid"] },
    ledgeW: { default: 12, min: 5, max: 30, unit: "mm", label: "lid ledge depth", say: ["ledge", "support"] },
    wall: { default: 2.4, min: 1.6, max: 5, unit: "mm", label: "wall thickness", say: ["wall"], more: ["stronger", "stiffer"] },
  },
  things: [
    { names: ["airline tubing holder", "airline clip", "airline tube clip", "air line holder", "airline tubing clip", "air tube holder", "airline holder"],
      title: "Airline tubing holder", spec: "aq-airline", params: { hold: "ring", width: 10, drop: 20 } },
    { names: ["co2 tube clip", "co2 tubing holder", "co2 line clip", "co2 tube holder", "co2 line holder"],
      title: "CO2 tube clip", spec: "aq-tube-4-6", params: { hold: "ring", width: 10, drop: 25 } },
    { names: ["aquarium hose holder", "aquarium hose clip", "canister filter hose clip", "filter hose holder", "canister hose holder", "filter tube holder"],
      title: "Filter hose clip (12/16)", spec: "aq-hose-12-16", params: { hold: "ring", width: 18, drop: 35, wall: 3 } },
    { names: ["large aquarium hose clip", "large canister hose clip", "big filter hose holder", "large filter hose clip"],
      title: "Large filter hose clip (16/22)", spec: "aq-hose-16-22", params: { hold: "ring", width: 22, drop: 45, wall: 3.2 } },
    { names: ["aquarium heater holder", "aquarium heater clip", "heater holder", "fish tank heater holder", "heater clip", "aquarium heater mount"],
      title: "Aquarium heater holder", spec: "aq-heater", params: { hold: "sleeve", width: 20, drop: 60 } },
    { names: ["aquarium thermometer clip", "aquarium thermometer holder", "thermometer clip", "fish tank thermometer holder"],
      title: "Aquarium thermometer clip", spec: "aq-thermometer", params: { hold: "sleeve", width: 12, drop: 40 } },
    { names: ["aquarium lid support clip", "glass lid clip", "glass lid support", "aquarium lid clip", "lid support clip", "glass lid holder",
      "aquarium lid holder", "fish tank lid clip"], title: "Glass lid support clip", params: { hold: "ledge", width: 15, drop: 25, lidDrop: 6, ledgeW: 12 } },
    { names: ["ph probe holder", "aquarium probe holder", "probe clip", "sensor probe holder", "ph probe clip"],
      title: "pH probe holder", spec: "aq-probe", params: { hold: "sleeve", width: 16, drop: 50 } },
    { names: ["dosing line holder", "dosing tube holder", "dosing line clip", "auto doser tube holder"],
      title: "Dosing line holder", spec: "aq-tube-4-6", params: { hold: "sleeve", width: 10, drop: 30 } },
  ],
  body: `
// drawn as used: x across the glass (glass from 0 to g), y up, glass top at y = 0
const g = glassT + 0.4;
const ri = tubeD / 2 + 0.1, ro = ri + wall;
const inL = hold === "ledge" ? Math.max(drop, lidDrop + wall + 1 + ledgeW * 0.8 + 2)
  : hold === "ring" ? Math.max(drop, 2 * ro + wall) : drop;
const outL = Math.min(inL, Math.max(10, glassT + 8));
// the hanger: an upside-down U, with a grip bump at the outside leg's tip
const hanger = [[-wall, -outL], [0, -outL], [0.6, -outL + 1.2], [0, -outL + 2.4], [0, 0], [g, 0],
  [g, -inL], [g + wall, -inL], [g + wall, wall], [-wall, wall]];
// a C ring round (cx, cy), open toward +x so the tube snaps in from the side
const cRing = (cx, cy, ri, ro, N = 40) => {
  const a = Math.asin(Math.min(0.95, 0.4 * tubeD / ri));        // the opening is 0.8 of the tube
  const arc = (r, a0, a1) => Array.from({ length: N + 1 }, (_, i) => {
    const t = a0 + (a1 - a0) * i / N;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
  });
  return [...arc(ro, a, 2 * Math.PI - a), ...arc(ri, 2 * Math.PI - a, a)];
};
const cx = g + wall + ro - wall * 0.6;                          // overlaps the inner leg

if (hold === "sleeve") {
  // printed upside down: depth below the rim is z, the U's top on the bed
  const W = Math.max(width, ro * 1.2);
  const flip = (pts) => pts.map(([x, y]) => [x, wall - y]);
  const u = translate([0, W / 2, 0], rotate([90, 0, 0], linearExtrude({ h: W }, polygon(flip(hanger)))));
  const sleeve = linearExtrude({ h: wall + inL }, polygon(cRing(cx, 0, ri + 0.2, ro + 0.2)));
  return translate([-cx / 2, 0, 0], union(u, sleeve));
}
const parts = [linearExtrude({ h: width }, polygon(hanger))];
if (hold === "ring") {
  parts.push(linearExtrude({ h: width }, polygon(cRing(cx, -inL + ro, ri, ro))));
} else {
  // the lid ledge: its top lidDrop below the rim, a 45 degree gusset under it
  const x0 = g + wall - 0.01, lt = wall + 1;
  parts.push(linearExtrude({ h: width }, polygon([[x0, -lidDrop], [x0 + ledgeW, -lidDrop], [x0 + ledgeW, -lidDrop - lt], [x0, -lidDrop - lt - ledgeW * 0.8]])));
}
return translate([-g / 2, inL / 2, 0], union(...parts));
`,
};
