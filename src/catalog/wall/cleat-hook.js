// Things that hang on a French cleat rail: a back plate whose top carries the
// matching cleat (a tongue bevelled at 45 degrees that drops in behind the
// rail's bevel), with a hook, a shelf or a cradle on the front. Everything is
// one side profile printed on its side, so the tongue, which points DOWN when
// hung and would start in mid-air printed upright, lies flat on the bed.

export default {
  id: "cleat-hook",
  category: "wall",
  title: "French cleat hook",
  summary: "a hook, shelf or cradle that drops onto a French cleat rail, no screws.",
  print: "on its side as shown, no supports. Match the cleat thickness to your rail.",
  names: ["french cleat hook", "cleat hook", "french cleat holder", "french cleat accessory", "french cleat hanger",
    "cleat hanger", "french cleat mount", "french cleat attachment"],
  nouns: ["hook", "holder", "hanger", "mount"],
  keywords: ["french", "cleat", "wall", "workshop", "garage", "tool"],
  tips: ["a shelf instead", "for a 16 mm cleat", "100 mm reach"],
  examples: ["I want a french cleat hook", "make me a cleat hook 80mm long",
    "a french cleat shelf 120mm deep", "a french cleat cradle 150mm across"],
  params: {
    piece: { default: "hook", unit: "choice", choices: ["hook", "shelf", "cradle", "plate"], label: "what is on the front",
      words: { shelf: ["shelf", "ledge"], cradle: ["cradle", "hose", "cord", "coil", "round"], plate: ["plate", "blank", "mounting plate"], hook: ["hook"] } },
    width: { default: 40, min: 15, max: 150, unit: "mm", label: "width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    cleatT: { default: 12, min: 6, max: 20, unit: "mm", label: "rail thickness it hangs on", say: ["cleat", "rail", "thick", "thickness"] },
    plateH: { default: 80, min: 40, max: 200, unit: "mm", label: "back plate height", say: ["tall", "high", "height", "plate"] },
    plateT: { default: 6, min: 4, max: 12, unit: "mm", label: "back plate thickness", say: ["back"] },
    reach: { default: 60, min: 15, max: 150, unit: "mm", label: "how far it sticks out", say: ["reach", "out", "deep", "depth", "long", "length"], more: ["longer", "deeper"], less: ["shorter", "shallower"] },
    armT: { default: 8, min: 4, max: 16, unit: "mm", label: "arm / shelf / cradle thickness", say: ["arm", "strong"], more: ["stronger", "sturdier"] },
    tipH: { default: 12, min: 0, max: 40, unit: "mm", label: "tip or lip height", say: ["tip", "lip"] },
    itemD: { default: 60, min: 20, max: 200, unit: "mm", label: "diameter the cradle holds", say: ["diameter", "across", "round"] },
    fit: { default: 0.6, min: 0.3, max: 1.5, unit: "mm", label: "clearance on the cleat", say: ["fit", "clearance", "gap"] },
    screwD: { default: 4, min: 3, max: 6, unit: "mm", label: "plate screw holes", say: ["screw"] },
  },
  things: [
    { names: ["french cleat shelf", "cleat shelf", "french cleat ledge"], title: "French cleat shelf",
      params: { piece: "shelf", width: 120, reach: 100, tipH: 8, plateH: 90 } },
    { names: ["french cleat cradle", "french cleat hose holder", "french cleat cord holder", "french cleat hose hanger"], title: "French cleat cradle",
      params: { piece: "cradle", width: 60, itemD: 120, armT: 8 } },
    { names: ["french cleat plate", "cleat plate", "cleat hanging plate", "french cleat back plate"], title: "French cleat plate",
      params: { piece: "plate", width: 80, plateH: 100 } },
    { names: ["french cleat j hook", "cleat j hook", "deep french cleat hook"], title: "French cleat J hook",
      params: { reach: 80, tipH: 30, armT: 9 } },
    { names: ["long french cleat hook", "french cleat long hook", "french cleat arm"], title: "Long French cleat hook",
      params: { reach: 130, armT: 12, width: 30, tipH: 15 } },
  ],
  body: `
// side profile: p runs out from the wall, q runs up; printed lying on it.
// q = 0 is the top front edge of the rail, whose bevel runs q = p + fit down
// to the wall; the tongue follows it a clearance higher.
const c = fit;
const T = cleatT;
const capH = Math.max(4, T * 0.6);
const top = 2 * c + capH;                          // top of the hanging cleat
const qBot = top - Math.max(plateH, T + capH + 2 * c + 20);
const cleat = [[-T, top], [-T, -T + 2 * c], [0, 2 * c], [0, qBot], [plateT, qBot], [plateT, top]];
const parts = [linearExtrude({ h: width }, polygon(cleat))];
const t = Math.tan(Math.PI / 18);                 // the hook arm tilts up 10 degrees
if (piece === "hook") {
  const tipT = Math.max(3, armT * 0.8);
  const gus = Math.min(armT, reach * 0.3);
  const L = Math.max(plateT + reach, plateT + gus + tipT + 3);
  const yb = (x) => qBot + (x - plateT) * t;
  const yTop = yb(L) + armT + tipH;
  parts.push(linearExtrude({ h: width }, polygon([
    [plateT - 0.5, qBot], [L, yb(L)], [L, yTop], [L - tipT, yTop],
    [L - tipT, yb(L - tipT) + armT], [plateT + gus, yb(plateT + gus) + armT],
    [plateT, yb(plateT) + armT + gus], [plateT - 0.5, yb(plateT) + armT + gus],
  ])));
} else if (piece === "shelf") {
  const boardT = Math.max(4, armT * 0.6);
  const L = plateT + reach;
  const lipT = Math.max(2.4, boardT * 0.6);
  const front = tipH > 0 ? [[L, top + tipH], [L - lipT, top + tipH], [L - lipT, top]] : [[L, top]];
  parts.push(linearExtrude({ h: width }, polygon([
    [plateT - 0.5, qBot + 2], [plateT + Math.min(reach * 0.85, reach - lipT - 1), top - boardT],
    [L, top - boardT], ...front, [plateT - 0.5, top],
  ])));
} else if (piece === "cradle") {
  // the cradle-hook outline, its inner circle touching the plate front
  const R = itemD / 2 + 2, Ro = R + armT;
  const cx = plateT + R, cy = qBot + Ro;
  const lip = Math.PI * 2 / 9;                    // the front lip curls up 40 degrees
  const arc = (r, a0, a1, N = 40) => Array.from({ length: N + 1 }, (_, i) => {
    const a = a0 + (a1 - a0) * i / N;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  parts.push(linearExtrude({ h: width }, polygon([
    [plateT - 0.5, qBot], ...arc(Ro, -Math.PI / 2, lip), ...arc(R, lip, -Math.PI), [plateT - 0.5, cy],
  ])));
}
const piece3d = parts.length > 1 ? union(...parts) : parts[0];
if (piece !== "plate") return piece3d;
// a plain plate: countersunk holes to screw it to whatever should hang
const k = Math.min(screwD / 2, plateT - 1.5);
const span = -T - qBot;
const holes = [qBot + span * 0.3, qBot + span * 0.75].flatMap((q) => [width * 0.3, width * 0.7].flatMap((z) => [
  translate([-1, q, z], rotate([0, 90, 0], cylinder({ r: screwD / 2, h: plateT + 2, $fn: 24 }))),
  translate([plateT - k + 0.02, q, z], rotate([0, 90, 0], cylinder({ r1: screwD / 2, r2: screwD / 2 + k, h: k, $fn: 24 }))),
]));
return difference(piece3d, ...holes);
`,
};
