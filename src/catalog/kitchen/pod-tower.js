// A dispenser tower: coffee pods (or anything round and flat) drop in at the
// top and stack; the bottom one slides out of a doorway at the foot, pushed
// from a finger hole at the back, and a slot up the front shows how many are
// left. A tube on a wide foot, every opening topped with a pointed arch so
// the whole thing prints upright without support.

export default {
  id: "pod-tower",
  category: "kitchen",
  title: "Coffee pod dispenser",
  summary: "a stacking tower for coffee pods or capsules that hands out the bottom one, with a slot to see how many are left.",
  print: "upright as shown, no supports.",
  names: ["coffee pod holder", "coffee pod dispenser", "pod holder", "pod dispenser", "capsule holder", "capsule dispenser",
    "coffee capsule holder", "coffee capsule dispenser", "pod tower", "capsule tower", "coffee pod tower", "coffee pod storage"],
  nouns: ["dispenser", "tower", "holder"],
  keywords: ["coffee", "pod", "capsule", "espresso", "keurig", "nespresso", "kitchen"],
  fits: ["pod"],
  fromSpec: (s) => ({ podD: s.dims.d, podH: s.dims.h }),
  specNote: "the tube allows 1.2 mm round each one",
  ask: { unless: ["podD"], text: "Which pods are they? Say “for K-cups”, “Nespresso”, “Vertuo” or “Dolce Gusto” and I’ll size the tube; I used Nespresso OriginalLine capsules (37 mm)." },
  tips: ["for K-cups", "taller", "on the wall"],
  examples: ["I want a coffee pod holder", "make me a capsule dispenser for nespresso",
    "a k cup holder 200 mm tall", "coffee pod dispenser for my keurig pods"],
  params: {
    podD: { default: 37, min: 20, max: 110, unit: "mm", label: "pod diameter (at its rim)", say: ["pod", "capsule", "diameter", "across"] },
    podH: { default: 30, min: 3, max: 60, unit: "mm", label: "one pod's height (sets the doorway)", say: ["thick", "thickness"] },
    height: { default: 220, min: 50, max: 250, unit: "mm", label: "tower height", say: ["tall", "high", "height"], more: ["taller", "higher"], less: ["shorter", "lower"] },
    wall: { default: 2, min: 1.6, max: 4, unit: "mm", label: "wall thickness", say: ["wall"], more: ["thicker", "stronger"] },
    foot: { default: 14, min: 0, max: 40, unit: "mm", label: "foot that sticks out past the tube", say: ["foot", "base"] },
    viewSlot: { default: 8, min: 0, max: 20, unit: "mm", label: "viewing slot up the front (0 = none)", say: ["window", "slot", "view"] },
    mount: { default: "stand", unit: "choice", choices: ["stand", "wall"], label: "free standing, or a flat back for wall tape",
      words: { wall: ["wall", "wall mounted", "on the wall", "flat back", "adhesive", "tape"], stand: ["stand", "standing", "countertop", "free standing"] } },
  },
  things: [
    { names: ["k cup holder", "k cup dispenser", "kcup holder", "keurig pod holder", "k cup tower", "keurig pod dispenser"], title: "K-cup dispenser", spec: "k-cup" },
    { names: ["nespresso holder", "nespresso capsule holder", "nespresso pod holder", "nespresso dispenser", "nespresso tower"], title: "Nespresso capsule dispenser", spec: "nespresso" },
    { names: ["vertuo holder", "vertuo pod holder", "vertuo capsule holder", "vertuo dispenser"], title: "Vertuo capsule dispenser", spec: "vertuo" },
    { names: ["dolce gusto holder", "dolce gusto capsule holder", "dolce gusto dispenser"], title: "Dolce Gusto capsule dispenser", spec: "dolce-gusto" },
    { names: ["ese pod holder", "espresso pod holder", "paper pod holder"], title: "ESE pod dispenser", spec: "ese-pod" },
    { names: ["cotton pad dispenser", "cotton round dispenser", "makeup pad dispenser", "makeup remover pad dispenser"], title: "Cotton pad dispenser", spec: "cotton-pad", params: { height: 160, viewSlot: 10 } },
    { names: ["wall pod dispenser", "wall mounted pod holder", "wall capsule holder"], title: "Wall pod dispenser", params: { mount: "wall" } },
    { names: ["tea light dispenser", "tealight dispenser", "tea light tower"], title: "Tea light dispenser", spec: "tea-light", params: { height: 180 } },
  ],
  body: `
const ri = podD / 2 + 1.2;                       // inside of the tube
const ro = ri + wall;
const floorT = Math.max(2, wall);
const backY = ro + 3;                            // the flat back, when it goes on a wall
const rf = mount === "wall" ? ro : ro + foot;
let tower = union(
  cylinder({ r: rf, h: floorT, $fn: 64 }),
  cylinder({ r: ro, h: height, $fn: 64 }),
);
if (mount === "wall") tower = union(tower, translate([-ro * 0.6, 0, 0], cube([ro * 1.2, backY, height])));
tower = difference(tower, translate([0, 0, floorT], cylinder({ r: ri, h: height, $fn: 64 })));

// an opening in the wall on the -y (front) or +y (back) side: straight sides, a pointed top
const arch = (w, z0, z1, side) => {
  const apex = z1 + w * 0.6;                     // steeper than 45 degrees: no overhang
  const prism = rotate([90, 0, 0], linearExtrude({ h: ro + 4 }, polygon([[-w / 2, z0], [w / 2, z0], [w / 2, z1], [0, apex], [-w / 2, z1]])));
  return side < 0 ? translate([0, 0.01, 0], prism) : translate([0, -0.01, 0], mirror([0, 1, 0], prism));
};
const doorW = Math.min(2 * ri * 0.85, 2 * ri - 4);
const doorTop = floorT + podH + 3;
const cuts = [arch(doorW, floorT, doorTop, -1)];
if (mount !== "wall") cuts.push(arch(Math.max(8, doorW * 0.45), floorT, doorTop, 1));
const slitBottom = doorTop + doorW * 0.6 + 6;
const slitTop = height - 10 - viewSlot * 0.6;
if (viewSlot > 0 && slitTop - slitBottom > 10) cuts.push(arch(Math.min(viewSlot, doorW * 0.6), slitBottom, slitTop, -1));
return difference(tower, ...cuts);
`,
};
