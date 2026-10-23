// A mouse bungee: a heavy round base and a springy arm that lifts the mouse
// cable off the desk and lets it run free. The arm is printed flat as one
// outline (a straight plug, a long bend forward, and a little hook that
// curls up under the cable) and plugs into a socket in the base, so neither
// piece has anything hanging while it prints.

export default {
  id: "mouse-bungee",
  category: "gaming",
  title: "Mouse bungee",
  summary: "a weighted base and a springy arm that holds a mouse cable up off the desk.",
  print: "both pieces flat as shown, no supports. The arm's plug pushes into the socket in the base.",
  names: ["mouse bungee", "mouse cable bungee", "mouse cord holder", "mouse cable holder", "mouse wire holder", "mouse cord bungee",
    "cord bungee", "mouse cable management"],
  nouns: ["bungee"],
  keywords: ["mouse", "cable", "cord", "wire", "gaming", "desk", "drag"],
  fits: ["cable"],
  fromSpec: (s) => ({ cableD: s.dims.d }),
  tips: ["taller arm", "for a 3 mm cable", "bigger base"],
  examples: ["I want a mouse bungee", "mouse cable holder 130mm tall",
    "a mouse cord bungee with a bigger base", "keyboard cable bungee"],
  params: {
    height: { default: 110, min: 60, max: 180, unit: "mm", label: "arm height", say: ["tall", "high", "height", "arm"], more: ["taller", "higher"], less: ["shorter", "lower"] },
    reach: { default: 50, min: 20, max: 120, unit: "mm", label: "forward reach of the bend", say: ["reach", "forward", "out"], more: ["further"] },
    cableD: { default: 4, min: 2, max: 9, unit: "mm", label: "cable diameter", say: ["cable", "cord", "wire"] },
    armT: { default: 5, min: 3, max: 9, unit: "mm", label: "arm thickness (springiness)", say: ["thick", "thickness", "stiff"], more: ["stiffer"], less: ["springier", "softer"] },
    armW: { default: 8, min: 5, max: 15, unit: "mm", label: "arm width", say: ["wide", "width"] },
    baseD: { default: 80, min: 50, max: 140, unit: "mm", label: "base diameter", say: ["base", "diameter", "across"], more: ["bigger", "heavier"], less: ["smaller"] },
    baseH: { default: 14, min: 8, max: 30, unit: "mm", label: "base height", say: ["weight", "heavy"] },
  },
  things: [
    { names: ["keyboard cable bungee", "keyboard cable holder", "keyboard cord holder", "keyboard bungee"], title: "Keyboard cable bungee",
      params: { height: 90, reach: 40, cableD: 4.5 } },
    { names: ["headset cable bungee", "headphone cable holder", "headphone cord holder"], title: "Headset cable bungee",
      params: { height: 140, reach: 60, cableD: 3.5 } },
    { names: ["drawing tablet cable bungee", "pen tablet cable holder", "stylus cable holder"], title: "Drawing tablet cable bungee",
      params: { height: 120, reach: 70, cableD: 3, armT: 4 } },
    { names: ["controller cable bungee", "controller cord holder", "wired controller bungee"], title: "Controller cable bungee",
      params: { height: 100, reach: 45, cableD: 3.5 } },
  ],
  body: `
// the arm's centre line, lying flat: x runs forward, y runs up the arm as it stands
const plug = baseH - 3;                          // the part that goes into the base
const rise = Math.max(plug + 6, height - reach);
const rc = cableD / 2 + 0.4 + armT / 2;          // centre-line radius of the cable hook
const path = [[0, 0, 90], [0, rise, 90]];        // [x, y, heading in degrees]
for (let i = 1; i <= 24; i++) {                  // bend from straight up to 25 degrees below level
  const ph = Math.PI - (115 * Math.PI / 180) * i / 24;
  path.push([reach + reach * Math.cos(ph), rise + reach * Math.sin(ph), ph * 180 / Math.PI - 90]);
}
const [ex, ey, eh] = path[path.length - 1];
const hcx = ex + rc * Math.cos((eh + 90) * Math.PI / 180), hcy = ey + rc * Math.sin((eh + 90) * Math.PI / 180);
for (let i = 1; i <= 20; i++) {                  // the hook curls up and back under the cable
  const ps = (eh - 90 + 170 * i / 20) * Math.PI / 180;
  path.push([hcx + rc * Math.cos(ps), hcy + rc * Math.sin(ps), ps * 180 / Math.PI + 90]);
}
const off = (p, side) => {
  const a = (p[2] + 90) * Math.PI / 180;
  return [p[0] + side * armT / 2 * Math.cos(a), p[1] + side * armT / 2 * Math.sin(a)];
};
const outline = [...path.map((p) => off(p, 1)), ...path.slice().reverse().map((p) => off(p, -1))];
const arm = linearExtrude({ h: armW }, polygon(outline));
// the base: a slightly tapered disc with a socket for the plug
const R = baseD / 2;
const base = difference(cylinder({ r1: R, r2: R - 2, h: baseH }),
  translate([-(armT + 0.4) / 2, -(armW + 0.4) / 2, baseH - plug], cube([armT + 0.4, armW + 0.4, plug + 1])));
return group(base, translate([R + 10 + armT / 2, -(rise + reach) / 2, 0], arm));
`,
};
