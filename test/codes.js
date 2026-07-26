// Scannable codes: the geometry is only half the job — a code that prints in one
// colour does not scan. These check the contrast tagging and the placement
// options that the "stamp on a face" tool depends on.
import { gridToShape } from "../viewer/codes.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

// a tiny checkerboard stands in for a real encoded grid
const grid = (w, h) => ({
  w, h,
  grid: Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (x + y) % 2)),
});

// walk the shape tree collecting every tagged colour
function coloursOf(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (node.color) out.push(node.color);
  for (const c of (node.child ? [node.child] : (node.children || []))) coloursOf(c, out);
  return out;
}
function boundsOf(node, box = { x: [Infinity, -Infinity], y: [Infinity, -Infinity] }, off = [0, 0]) {
  if (!node || typeof node !== "object") return box;
  let o = off;
  if (node.kind === "xform" && node.matrix) {
    const e = node.matrix.elements;
    o = [off[0] + e[12], off[1] + e[13]];
  }
  if (node.kind === "prim" && node.params?.sizeX != null) {
    box.x = [Math.min(box.x[0], o[0]), Math.max(box.x[1], o[0] + node.params.sizeX)];
    box.y = [Math.min(box.y[0], o[1]), Math.max(box.y[1], o[1] + node.params.sizeY)];
  }
  for (const c of (node.child ? [node.child] : (node.children || []))) boundsOf(c, box, o);
  return box;
}

console.log("\ncode colours\n");
{
  const s = gridToShape(grid(6, 6), {});
  const cols = new Set(coloursOf(s));
  check("modules are tagged dark by default", cols.has("#111111"), [...cols].join(","));
  check("plate is tagged light by default", cols.has("#f2f2f2"), [...cols].join(","));
  check("exactly two colours, so a 2-colour 3MF works", cols.size === 2, `${cols.size}`);
}
{
  const cols = new Set(coloursOf(gridToShape(grid(6, 6), { color: "#ff0000", baseColor: "#0000ff" })));
  check("colours can be overridden", cols.has("#ff0000") && cols.has("#0000ff"), [...cols].join(","));
}
{
  const cols = new Set(coloursOf(gridToShape(grid(6, 6), { color: [0, 0, 0] })));
  check("rgb arrays accepted", cols.has("#000000"), [...cols].join(","));
  const named = new Set(coloursOf(gridToShape(grid(6, 6), { color: "black" })));
  check("named colours accepted", named.has("#111111"), [...named].join(","));
}
{
  const cols = coloursOf(gridToShape(grid(6, 6), { baseColor: null }));
  check("baseColor:null leaves the plate untagged", !cols.includes("#f2f2f2"));
  check("modules still tagged", cols.includes("#111111"));
}

console.log("\ncentring (what stamping on a face needs)\n");
{
  const b = boundsOf(gridToShape(grid(6, 6), { module: 2, border: 2 }));
  check("uncentred starts at the origin", b.x[0] === 0 && b.y[0] === 0, JSON.stringify(b));
  const c = boundsOf(gridToShape(grid(6, 6), { module: 2, border: 2, center: true }));
  const mid = (c.x[0] + c.x[1]) / 2;
  check("centred straddles the origin", Math.abs(mid) < 0.001, `mid ${mid}`);
  check("centring does not change the size",
    Math.abs((c.x[1] - c.x[0]) - (b.x[1] - b.x[0])) < 0.001);
}

// textGrid() and codeGrid() read pixels back off a canvas, so they only run in
// a browser; the viewer smoke tests cover them.

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
