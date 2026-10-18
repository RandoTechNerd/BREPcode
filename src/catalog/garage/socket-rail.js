// A rail of square posts that sockets push onto by their drive hole, in a
// row by size. The post is the drive square less a little clearance, with a
// chamfered top so a socket finds it without looking. Countersunk holes at
// each end screw it into a drawer or onto the wall.

export default {
  id: "socket-rail",
  category: "garage",
  title: "Socket rail",
  summary: "a rail of square posts that hold sockets by their drive hole, in a row by size.",
  print: "flat as shown, no supports.",
  names: ["socket rail", "socket organizer", "socket holder", "socket rack", "socket storage", "socket organiser",
    "socket holder rail", "socket strip"],
  nouns: ["rail", "organizer", "holder", "rack", "strip"],
  keywords: ["socket", "drive", "ratchet", "toolbox", "drawer", "garage"],
  fits: ["socket-drive"],
  fromSpec: (s) => ({ driveW: s.dims.w, pitch: s.dims.p }),
  tips: ["for 1/2 inch drive", "14 posts", "30 mm apart"],
  examples: ["I want a socket organizer", "make me a socket rail for 3/8 drive",
    "socket holder with 12 posts", "1/2 inch drive socket rack"],
  params: {
    driveW: { default: 9.53, min: 5, max: 20, unit: "mm", label: "drive square size (3/8 inch = 9.53)", say: ["square"] },
    fit: { default: 0.15, min: 0, max: 0.6, unit: "mm", label: "clearance per side", say: ["fit", "clearance", "loose", "tight"] },
    count: { default: 8, min: 1, max: 30, unit: "count", label: "posts", say: ["post", "peg", "spot"] },
    pitch: { default: 26, min: 10, max: 60, unit: "mm", label: "post spacing", say: ["spacing", "apart", "pitch"], more: ["roomier"], less: ["tighter"] },
    postH: { default: 9, min: 4, max: 20, unit: "mm", label: "post height", say: ["post", "tall"], more: ["taller"], less: ["shorter"] },
    baseH: { default: 5, min: 3, max: 12, unit: "mm", label: "rail thickness", say: ["thick"] },
    width: { default: 18, min: 10, max: 50, unit: "mm", label: "rail width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    screwD: { default: 4, min: 0, max: 6, unit: "mm", label: "end screw holes (0 = none)", say: ["screw"] },
  },
  things: [
    { names: ["1/4 socket rail", "1/4 drive socket rail", "quarter inch socket rail", "1/4 socket organizer", "1/4 socket holder"],
      title: "1/4 inch socket rail", spec: "drive-1-4", params: { count: 12, postH: 7 } },
    { names: ["3/8 socket rail", "3/8 drive socket rail", "3/8 socket organizer", "3/8 socket holder"],
      title: "3/8 inch socket rail", spec: "drive-3-8", params: { count: 10 } },
    { names: ["1/2 socket rail", "1/2 drive socket rail", "half inch socket rail", "1/2 socket organizer", "1/2 socket holder"],
      title: "1/2 inch socket rail", spec: "drive-1-2", params: { count: 6, postH: 11, width: 22, baseH: 6 } },
    { names: ["3/4 socket rail", "3/4 drive socket rail", "3/4 socket holder"],
      title: "3/4 inch socket rail", spec: "drive-3-4", params: { count: 4, postH: 14, width: 28, baseH: 7 } },
    { names: ["deep socket rail", "deep socket holder"], title: "Deep socket rail", params: { postH: 12, count: 8 } },
    { names: ["impact socket rail", "impact socket holder"], title: "Impact socket rail", spec: "drive-1-2", params: { count: 6, postH: 12, width: 22, baseH: 6 } },
  ],
  body: `
const side = driveW - 2 * fit;                  // the post: the drive square, a touch under
const ch = Math.min(1.2, side / 5);             // lead-in chamfer at the top
const end = screwD > 0 ? 12 : 4;
const L = count * pitch + 2 * end;
const w = Math.max(width, driveW + 6);
const rail = translate([-L / 2, -w / 2, 0], cube([L, w, baseH]));
const posts = Array.from({ length: count }, (_, i) => {
  const x = -L / 2 + end + (i + 0.5) * pitch;
  return hull(
    translate([x - side / 2, -side / 2, baseH - 0.1], cube([side, side, postH - ch + 0.1])),
    translate([x - side / 2 + ch, -side / 2 + ch, baseH + postH - 0.01], cube([side - 2 * ch, side - 2 * ch, 0.01])),
  );
});
const body = union(rail, ...posts);
if (screwD <= 0) return body;
const k = screwD / 2;
const holes = [-1, 1].flatMap((s) => {
  const x = s * (L / 2 - end / 2);
  return [
    translate([x, 0, -1], cylinder({ r: screwD / 2, h: baseH + 2, $fn: 24 })),
    translate([x, 0, baseH - k + 0.02], cylinder({ r1: screwD / 2, r2: screwD / 2 + k, h: k, $fn: 24 })),
  ];
});
return difference(body, ...holes);
`,
};
