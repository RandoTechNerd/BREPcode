// A travel stand for a portable monitor that carries a Mac mini inside it.
// The mini slides into a sleeve under the deck; the monitor's bottom edge sits
// in a rounded cradle on top, leaning on a backrest that is hinged to the
// deck. A kickstand hinged to the back of the backrest drops into one of a row
// of notches, and each notch is a different tilt. For the bag, fold the
// kickstand up against the backrest and the backrest forward over the deck.
//
// It is a kit of six parts on two plates (the `parts` dial):
//   dock   the sleeve and deck, standing on its back end so the sleeve walls
//          and the ledges the mini sits on print straight up; and the top
//          plate (cradle, front lip, the hinge's fixed knuckles, the notched
//          rack), flat. Glue the top plate onto the deck, centred, front edges level.
//   stand  the backrest (flat on its face, lugs up), the kickstand (flat) and
//          two 8-sided pins lying on a flat. Glue the long pin into the top
//          plate's knuckles and the short one into the backrest's lugs; the
//          backrest and the kickstand turn on them. 3 mm steel rod works too.
// Every pin hole is a teardrop pointing up, so nothing needs supports.

export default {
  id: "mini-monitor-easel",
  category: "desk",
  title: "Mac mini monitor easel",
  summary: "a portable-monitor stand that carries a Mac mini in a sleeve under its deck, with a hinged backrest and a kickstand that drops into tilt notches.",
  print: "two plates (the parts dial): the dock standing on its back end plus the top plate flat; then the backrest, kickstand and pins flat. No supports. Glue the top plate on the deck (centred, front edges level) and the pins in their glue holes.",
  names: ["mac mini monitor stand", "mac mini monitor easel", "mac mini stand", "mac mini dock", "mac mini sleeve",
    "mac mini holder", "portable monitor stand", "portable monitor easel", "portable monitor holder",
    "travel monitor stand", "portable screen stand", "portable display stand", "mac mini travel stand",
    "monitor stand that holds a mac mini", "stand for my portable monitor"],
  nouns: ["easel", "stand", "dock"],
  keywords: ["mac", "mini", "portable", "monitor", "screen", "display", "travel", "tilt", "kickstand"],
  fits: ["minipc"],
  fromSpec: (s) => ({ miniW: s.dims.w, miniH: s.dims.h, deckD: Math.max(90, s.dims.d - 9) }),
  specNote: "the sleeve leaves a little room round it",
  tips: ["the stand parts", "monitor 8 mm thick", "6 notches", "taller backrest"],
  examples: ["a stand for my portable monitor that holds a mac mini", "mac mini monitor stand",
    "portable monitor stand for my mac mini m4", "a travel stand for a portable monitor"],
  params: {
    parts: { default: "dock", unit: "choice", choices: ["dock", "stand"], label: "which plate to print",
      words: { dock: ["dock", "sleeve", "deck", "base", "top plate"], stand: ["stand parts", "backrest", "kickstand", "pins", "back plate", "second plate"] } },
    miniW: { default: 127, min: 90, max: 210, unit: "mm", label: "Mac mini width", say: ["mini", "computer"], fixed: true },
    miniH: { default: 50, min: 30, max: 70, unit: "mm", label: "Mac mini height", say: ["mini", "computer"], fixed: true },
    fit: { default: 1.2, min: 0.4, max: 3, unit: "mm", label: "clearance round the mini", say: ["clearance", "fit"], more: ["looser"], less: ["tighter", "snugger"] },
    monThick: { default: 12, min: 5, max: 30, unit: "mm", label: "monitor thickness at its bottom edge", say: ["monitor", "screen", "display", "thick"] },
    restH: { default: 120, min: 80, max: 180, unit: "mm", label: "backrest height", say: ["backrest", "tall", "high", "height"], more: ["taller", "higher"], less: ["shorter", "lower"] },
    restW: { default: 170, min: 120, max: 220, unit: "mm", label: "backrest width (hinge length)", say: ["hinge"] },
    tiltMin: { default: 10, min: 0, max: 25, unit: "deg", label: "most upright tilt, back from vertical", say: ["tilt", "lean", "angle", "upright"] },
    tiltStep: { default: 5, min: 2, max: 8, unit: "deg", label: "degrees between notches", say: ["step", "between"] },
    notches: { default: 4, min: 1, max: 6, unit: "count", label: "tilt settings (notches)", say: ["notch", "notches", "setting", "settings", "position", "positions"] },
    standAt: { default: 70, min: 40, max: 110, unit: "mm", label: "kickstand hinge height up the backrest", say: ["kickstand"] },
    standLen: { default: 76, min: 50, max: 130, unit: "mm", label: "kickstand length, pin to foot", say: ["kickstand", "leg"], more: ["longer"], less: ["shorter"] },
    wingW: { default: 240, min: 160, max: 250, unit: "mm", label: "deck width", say: ["wide", "width", "deck"], more: ["wider"], less: ["narrower"] },
    deckD: { default: 118, min: 90, max: 200, unit: "mm", label: "deck depth (grows to fit the rack)", say: ["deep", "depth", "long"], more: ["deeper", "longer"], less: ["shallower"] },
    wall: { default: 4, min: 3, max: 8, unit: "mm", label: "sleeve wall thickness", say: ["wall", "sturdy"], more: ["sturdier"] },
    deckT: { default: 6, min: 4, max: 10, unit: "mm", label: "deck thickness", say: ["deck", "thick"] },
    lipH: { default: 9, min: 6, max: 20, unit: "mm", label: "front lip height", say: ["lip"] },
    cradleR: { default: 10, min: 5, max: 30, unit: "mm", label: "radius of the cradle the monitor sits in", say: ["cradle", "groove"] },
    knuckleR: { default: 5, min: 4, max: 8, unit: "mm", label: "hinge barrel radius", say: ["barrel", "knuckle"] },
    pinD: { default: 3, min: 2, max: 5, unit: "mm", label: "pin diameter (both hinges)", say: ["pin", "rod"], fixed: true },
    turnFit: { default: 0.45, min: 0.1, max: 1, unit: "mm", label: "clearance where a pin turns", say: ["play"] },
    glueFit: { default: 0.15, min: 0, max: 0.5, unit: "mm", label: "clearance where a pin is glued", say: ["glue"] },
  },
  things: [
    { names: ["mac mini m4 monitor stand", "m4 mac mini stand", "mac mini m4 stand", "mac mini m4 dock"],
      title: "Mac mini M4 monitor easel", spec: "minipc-mac-mini-m4", params: {} },
    { names: ["older mac mini stand", "mac mini m1 stand", "mac mini m2 stand", "intel mac mini stand", "old mac mini dock"],
      title: "Mac mini (M1 / M2 / Intel) monitor easel", spec: "minipc-mac-mini-2010", params: {} },
  ],
  body: `
// ---- derived sizes (change the dials above, not these)
const inW = miniW + 2 * fit, inH = miniH + fit;
const outW = inW + 2 * wall;
const deckW = Math.max(wingW, outW + 2 * wall);          // the deck is never narrower than the sleeve
const lipIn = wall + 2;                                   // ledges the mini sits on, each side
const lipT = wall - 1;                                    // ledge thickness
const plateT = wall - 1;                                  // the top plate glued on the deck
const deckZ = lipT + inH;                                 // underside of the deck
const topZ = deckZ + deckT + plateT;                      // top face of the top plate
const x0 = (deckW - outW) / 2;                            // sleeve's left outer face
const span = Math.min(restW, deckW - 2 * wall);           // backrest width = hinge length
const rad = (d) => d * Math.PI / 180;
const tilts = [...Array(notches).keys()].map((i) => tiltMin + i * tiltStep);
const alongX = (s) => rotate([0, 90, 0], s);              // Z cylinder -> X axis
const flatX = (s) => rotate([90, 90, 0], s);              // a YZ profile pushed along +X
// a pin hole along +X whose roof is a 45 degree peak pointing \`up\` (radians in
// the YZ profile), so it prints without supports in its part's print pose
const tearHole = (rr, len, up) => flatX(linearExtrude({ h: len }, polygon([
  ...[...Array(25).keys()].map((k) => { const a = up + Math.PI / 4 + k * Math.PI * 1.5 / 24; return [rr * Math.cos(a), rr * Math.sin(a)]; }),
  [rr * Math.SQRT2 * Math.cos(up), rr * Math.SQRT2 * Math.sin(up)],
])));
// an octagon along +X inside a circle of radius rr, flats up and down: the
// barrels of the parts that print lying down, so they rest on a flat
const flatOf = Math.cos(Math.PI / 8);                     // centre to flat, per unit radius
const octX = (rr, len) => flatX(linearExtrude({ h: len }, polygon([...Array(8).keys()].map((k) => {
  const a = Math.PI / 8 + k * Math.PI / 4; return [rr * Math.cos(a), rr * Math.sin(a)];
}))));
const pinRod = (len) => translate([0, 0, pinD / 2 * flatOf], octX(pinD / 2, len));
// a block with its upright edges rounded: a round-cornered outline pushed up
const roundBox = ([w, d, h], rr) => linearExtrude({ h }, polygon([[w - rr, rr], [w - rr, d - rr], [rr, d - rr], [rr, rr]]
  .flatMap(([x, y], k) => [...Array(5).keys()].map((j) => {
    const a = Math.PI * (k / 2 - 0.5 + j / 8); return [x + rr * Math.cos(a), y + rr * Math.sin(a)];
  }))));

// ---- main hinge: its axis runs along X just above the top plate, far enough
// back that the barrel clears a monitor leaning at the most upright setting
const hz = topZ + knuckleR + 0.6;
const lipY = wall, grooveY = wall + 6;                    // front lip, and where the monitor's face rests
const restT = deckT;                                      // backrest thickness
const restF = -knuckleR * flatOf;                         // backrest front, level with its knuckles' flats
const restB = restF + restT;                              // backrest back
const hy = grooveY + monThick + (hz - topZ) * Math.tan(rad(tiltMin)) + knuckleR;
const hx = (deckW - span) / 2;
const nK = 2 * Math.max(1, Math.round(span / 70)) + 1;    // odd: the top plate gets both ends + the middle
const gap = turnFit + 0.05;
const seg = (span - (nK - 1) * gap) / nK;
const kx = (i) => hx + i * (seg + gap);
const evens = [...Array(nK).keys()].filter((i) => i % 2 === 0);
const odds = [...Array(nK).keys()].filter((i) => i % 2 === 1);

// ---- kickstand geometry
const winW = span - 50, winH = restH - 55, winR = Math.min(10, winH / 3), winZ = restH * 0.27;
const standR = pinD / 2 + 2.5;                            // kickstand hinge barrel radius
const footR = pinD;                                       // the round foot bar that sits in a notch
const rackH = footR + 4;                                  // height of the notched rack
const standW = winW + 1;                                  // kickstand width (fits between the lugs)
const lugW = 4 * pinD;
const lugX = winW / 2 + 1;
const sa = Math.min(standAt, restH - standR - 2);         // kickstand pin, up the backrest
const zt = standR * flatOf;                               // the plank's flat face, below the pin
const plankT = deckT - 1;
const footZl = -zt + footR * flatOf;                      // foot bar centre, in the kickstand's frame
const reach = Math.hypot(standLen, footZl), a0 = Math.atan2(footZl, standLen);
// the kickstand's pin in the world when the backrest leans \`t\` degrees
const standPivot = (t) => [
  hy + (restB + standR) * Math.cos(rad(t)) + sa * Math.sin(rad(t)),
  hz - (restB + standR) * Math.sin(rad(t)) + sa * Math.cos(rad(t)),
];
const footZ = topZ + rackH;                               // a seated foot's centre height
const footY = (t) => {
  const [py, pz] = standPivot(t);
  return py + Math.sqrt(Math.max(1, reach * reach - (pz - footZ) ** 2));
};
const notchYs = tilts.map(footY);

// ---- the top plate: cradle, front lip, fixed knuckles on webs, notched rack
const baseY0 = hy - knuckleR - 1.5;
const rackY0 = Math.min(...notchYs) - 8, rackY1 = Math.max(...notchYs) + 8;
const deckLen = Math.max(deckD, rackY1 + 3);
const frontLip = translate([hx, lipY, topZ - 0.01], roundBox([span, grooveY - lipY, lipH], 2));
// a block between the lip and the hinge with a shallow round trough along it,
// so the monitor's bottom edge rolls to the middle
const cy0 = grooveY - 0.5, cy1 = baseY0 - 0.2;
const cradle = difference(
  translate([hx, cy0, topZ - 0.01], cube([span, cy1 - cy0, lipH - 2])),
  translate([hx - 1, (cy0 + cy1) / 2, topZ + 1.5 + cradleR], alongX(cylinder({ r: cradleR, h: span + 2 }))),
);
const notchRack = difference(
  translate([deckW / 2 - standW / 2, rackY0, topZ - 0.01], cube([standW, rackY1 - rackY0, rackH])),
  ...notchYs.map((y) => translate([deckW / 2 - standW / 2 - 1, y, footZ], alongX(cylinder({ r: footR + 0.35, h: standW + 2 })))),
  // each notch flares out at 45 degrees at the top, so the kickstand's plank
  // clears the rack at the shallow settings and the foot drops in on its own
  ...notchYs.map((y) => translate([deckW / 2 - standW / 2 - 1, y, footZ], flatX(linearExtrude({ h: standW + 2 }, polygon([
    [-(footR + 2.1), 0.5], [0, -(footR + 1.6)], [footR + 2.1, 0.5]]))))),
);
const knuckle = (i) => union(
  translate([kx(i), hy, hz], alongX(cylinder({ r: knuckleR, h: seg }))),
  translate([kx(i), hy - knuckleR + 0.5, topZ - 0.01], cube([seg, 2 * knuckleR - 1, hz - topZ + 0.01])),
);
const upper = difference(
  union(
    translate([hx, 0, topZ - plateT], cube([span, rackY1, plateT])),
    frontLip, cradle, notchRack,
    ...evens.map(knuckle),
  ),
  translate([hx - 1, hy, hz], tearHole(pinD / 2 + glueFit / 2, span + 2, Math.PI / 2)),
);

// ---- the dock, built as it prints: one end profile (sleeve walls, the ledges
// the mini sits on, the deck; x across, y = height in use) pushed up deckLen,
// standing on its back end. The deck's corners are rounded by four cutters.
const x1 = x0 + outW;
const dockEnd = polygon([
  [0, deckZ], [x0, deckZ], [x0, 0], [x0 + wall + lipIn, 0], [x0 + wall + lipIn, lipT], [x0 + wall, lipT],
  [x0 + wall, deckZ], [x1 - wall, deckZ], [x1 - wall, lipT], [x1 - wall - lipIn, lipT], [x1 - wall - lipIn, 0], [x1, 0],
  [x1, deckZ], [deckW, deckZ], [deckW, deckZ + deckT], [0, deckZ + deckT],
]);
// what rounds one corner off, as an outline in the deck's plane (x across, z up the print)
const cornerCut = (sx, sz, ox, oz) => {
  const p = [[-1, -1], [wall, -1], ...[...Array(7).keys()].map((k) => {
    const a = -Math.PI / 2 - k * Math.PI / 12; return [wall + wall * Math.cos(a), wall + wall * Math.sin(a)];
  }), [-1, wall]].map(([u, v]) => [ox + sx * u, oz + sz * v]);
  return translate([0, deckZ + deckT + 1, 0], rotate([90, 0, 0], linearExtrude({ h: deckT + 2 }, polygon(sx * sz > 0 ? p : p.reverse()))));
};
const dock = difference(
  linearExtrude({ h: deckLen }, dockEnd),
  // the M4's power button sits under its back-left corner: a finger notch
  translate([x0 + wall - 1, -1, -1], cube([lipIn + 2, lipT + 2, 27])),
  cornerCut(1, 1, 0, 0), cornerCut(-1, 1, deckW, 0), cornerCut(1, -1, 0, deckLen), cornerCut(-1, -1, deckW, deckLen),
);

// ---- the backrest, in its own frame: hinge axis along X at the origin, up is +z
const corner = (x, z) => translate([x, restB + 1, z], rotate([90, 0, 0], cylinder({ r: winR, h: restT + 2 })));
const windowCut = union(
  translate([-winW / 2 + winR, restF - 1, winZ], cube([winW - 2 * winR, restT + 2, winH])),
  translate([-winW / 2, restF - 1, winZ + winR], cube([winW, restT + 2, winH - 2 * winR])),
  corner(-winW / 2 + winR, winZ + winR), corner(winW / 2 - winR, winZ + winR),
  corner(-winW / 2 + winR, winZ + winH - winR), corner(winW / 2 - winR, winZ + winH - winR),
);
const lx = (i) => -span / 2 + i * (seg + gap);
const ownKnuckle = (i) => translate([lx(i), 0, 0], octX(knuckleR, seg));
const baseClear = (i) => translate([lx(i) - gap, 0, 0], alongX(cylinder({ r: knuckleR + 0.6, h: seg + 2 * gap })));
// two lugs on the back, either side of the window, carry the kickstand's pin
const lug = (x) => union(
  translate([x, restB - 0.01, sa - standR], cube([lugW, standR + 0.01, 2 * standR])),
  translate([x, restB + standR, sa], alongX(cylinder({ r: standR, h: lugW }))),
);
const backrest = difference(
  union(
    translate([-span / 2, restF, 0], cube([span, restT, restH])),
    ...odds.map(ownKnuckle),
    lug(-lugX - lugW), lug(lugX),
  ),
  windowCut,
  ...evens.map(baseClear),
  translate([-span / 2 - 1, 0, 0], tearHole(pinD / 2 + turnFit / 2, span + 2, 0)),
  translate([-lugX - lugW - 1, restB + standR, sa], tearHole(pinD / 2 + glueFit / 2, 2 * (lugX + lugW) + 2, 0)),
);

// ---- the kickstand, in its own frame: pin along X at the origin, foot along +y
const kickstand = difference(
  union(
    translate([-standW / 2, 0, 0], octX(standR, standW)),
    translate([-standW / 2, 0, -zt], cube([standW, standLen, plankT])),
    translate([-standW / 2, standLen, footZl], octX(footR, standW)),
  ),
  translate([-standW / 2 - 1, 0, 0], tearHole(pinD / 2 + turnFit / 2, standW + 2, Math.PI / 2)),
  // a big window keeps it light and lets cables through
  translate([-standW / 2 + 14, 14, -zt - 1], cube([standW - 28, standLen - 26, plankT + 2])),
);

// ---- the two print plates
if (parts === "dock") {
  return group(
    colorize("#2b2f36", dock),
    colorize("#3b82f6", translate([0, deckZ + deckT + 8, plateT - topZ], upper)),
  );
}
const yK = restH + knuckleR + 8 + standR;                 // where the kickstand's pin lies
const yP = yK + standLen + footR + 8;                     // and the pins
return group(
  colorize("#e8902a", translate([span / 2, restH, -restF], rotate([90, 0, 0], backrest))),
  colorize("#22c55e", translate([span / 2, yK, zt], kickstand)),
  colorize("#9aa4b2", union(
    translate([0, yP, 0], pinRod(span - 1)),
    translate([0, yP + pinD + 6, 0], pinRod(2 * (lugX + lugW) - 1)),
  )),
);
`,
};
