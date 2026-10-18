// A wall or baseboard door stop: a round post with a domed end the door hits,
// screwed on through a counterbore in the dome (or stuck on, on a wider
// flange). Short and wide it is the dome that saves the wall from a door
// knob; tiny it is a cabinet-door bumper. Printed standing on its mounting
// face.

export default {
  id: "door-bumper",
  category: "home",
  title: "Door bumper",
  summary: "a domed wall or baseboard door stop, screwed or stuck on.",
  print: "standing on its base as shown, no supports. TPU for a soft, quiet stop.",
  names: ["door bumper", "door stop bumper", "wall bumper", "wall door stop", "wall door stopper", "door buffer",
    "wall mounted door stop", "door stopper for the wall", "wall door bumper"],
  nouns: ["bumper", "stopper", "stop", "protector", "buffer"],
  keywords: ["door", "wall", "baseboard", "knob", "handle", "floor", "cabinet", "skirting"],
  primary: "length",
  tips: ["80 mm long", "stick on", "wider"],
  examples: ["I want a door bumper", "make me a wall door stop 70mm long",
    "a baseboard door stop", "stick on door knob wall protector"],
  params: {
    diameter: { default: 25, min: 8, max: 80, unit: "mm", label: "diameter", say: ["diameter", "across", "wide", "thick"], more: ["wider", "thicker"], less: ["thinner", "narrower"] },
    length: { default: 60, min: 3, max: 150, unit: "mm", label: "how far it sticks out", say: ["long", "length", "out", "deep", "projection"], more: ["longer"], less: ["shorter"] },
    flange: { default: 5, min: 0, max: 20, unit: "mm", label: "base flange width", say: ["flange", "base"] },
    mount: { default: "screw", unit: "choice", choices: ["screw", "adhesive"], label: "mounting",
      words: { adhesive: ["adhesive", "stick on", "sticky", "no drill", "no screws", "tape", "self adhesive"], screw: ["screw", "screwed"] } },
    screwD: { default: 4.5, min: 3, max: 6, unit: "mm", label: "screw diameter", say: ["screw"] },
    headD: { default: 9, min: 6, max: 14, unit: "mm", label: "screw head counterbore", say: ["head"] },
  },
  things: [
    { names: ["baseboard door stop", "baseboard door stopper", "baseboard bumper", "skirting board door stop"], title: "Baseboard door stop",
      params: { length: 80, diameter: 22 } },
    { names: ["door knob wall protector", "wall protector", "doorknob bumper", "door handle wall protector", "wall guard for door knob", "door knob bumper"],
      title: "Door knob wall protector", params: { diameter: 60, length: 8, flange: 0, mount: "adhesive" } },
    { names: ["cabinet door bumper", "cabinet bumper", "drawer bumper", "cupboard door bumper"], title: "Cabinet door bumper",
      params: { diameter: 10, length: 3, flange: 0, mount: "adhesive" } },
    { names: ["floor door stop", "floor door stopper", "floor mounted door stop"], title: "Floor door stop",
      params: { diameter: 35, length: 30, flange: 6 } },
    { names: ["short door stop", "hinge side door stop", "short wall door stop"], title: "Short door stop",
      params: { diameter: 30, length: 30 } },
  ],
  body: `
// z = 0 is the face against the wall; the dome the door hits is on top
const r = diameter / 2;
const dh = Math.min(r, length * 0.6);               // dome height
const fT0 = Math.min(2.5, length * 0.4);
// a flange that tapers in to the post at 45 degrees, if the post is long enough for one
const fl = Math.max(0, Math.min(flange, length - dh - fT0 - 0.3));
const fT = fl > 0 ? fT0 : 0;
const base = fl > 0 ? [[r + fl, 0], [r + fl, fT], [r, fT + fl]] : [[r, 0]];
// the screw goes in through the dome: its head sits at the bottom of a
// counterbore, which is part of the turned outline (a bore cut down a
// revolve's axis is very slow); only the screw hole itself is cut
const screwed = mount === "screw";
const floor = Math.max(3, Math.min(6, length * 0.4));
const rc = screwed && floor < length - 0.5 ? Math.min(headD / 2, r - 1.2) : 0;
const aMax = rc > 0 ? Math.acos(Math.min(1, rc / r)) : Math.PI / 2;
const dome = Array.from({ length: 13 }, (_, i) => {
  const a = aMax * i / 12;
  return [r * Math.cos(a), length - dh + dh * Math.sin(a)];
}).filter(([x]) => x > 0.01);
const inner = rc > 0 ? [[rc, floor], [0, floor]] : [[0, length]];
const prof = [[0, 0], ...base, ...dome, ...inner];
const post = revolve(360, polygon(prof.filter((p, i) => i === 0 || Math.hypot(p[0] - prof[i - 1][0], p[1] - prof[i - 1][1]) > 1e-4)));
if (!screwed) return post;
const hole = polygon(Array.from({ length: 24 }, (_, i) => [screwD / 2 * Math.cos(Math.PI * i / 12), screwD / 2 * Math.sin(Math.PI * i / 12)]));
return difference(post, translate([0, 0, -1], linearExtrude({ h: floor + 2 }, hole)));
`,
};
