// A maze puzzle: a square tray whose walls are a perfect maze (exactly one
// way through), carved by a seeded random walk, so each seed is its own
// maze and the same seed always gives the same one. Trace it with a finger,
// or roll a marble from the gap at one corner to the gap at the other.
// The walls are merged into straight runs and stand on the base plate.

export default {
  id: "maze-puzzle",
  category: "kids",
  title: "Maze puzzle",
  summary: "a tray with a generated maze of walls, one way through, for a finger or a marble; change the seed for a new maze.",
  print: "flat as shown, no supports. No small parts; a marble is a choking hazard for under-3s, so trace it with a finger instead.",
  names: ["maze puzzle", "maze", "finger maze", "marble maze", "labyrinth puzzle", "maze game", "ball maze", "tilt maze",
    "labyrinth maze", "maze board"],
  nouns: ["maze", "labyrinth"],
  keywords: ["puzzle", "marble", "ball", "finger", "kids", "travel", "tilt"],
  fits: ["marble"],
  fromSpec: (s) => ({ cell: Math.round(s.dims.d + 5), wallH: Math.max(8, Math.round(s.dims.d * 0.7)) }),
  triple: ["cells", "rows"],
  tips: ["12 x 12", "another maze", "for a 16 mm marble"],
  examples: ["I want a maze puzzle", "make me a marble maze for a 16mm marble", "a finger maze 10 cells across",
    "labyrinth puzzle with seed 7"],
  params: {
    cells: { default: 8, min: 4, max: 14, unit: "count", label: "cells across", say: ["cell", "across", "square", "wide"] },
    rows: { default: 0, min: 0, max: 14, unit: "count", label: "rows of cells (0 = as many as across, a square maze)", say: ["row", "rows", "down"] },
    cell: { default: 16, min: 10, max: 30, unit: "mm", label: "cell size", say: ["path", "lane", "size"], more: ["bigger", "wider"], less: ["smaller"] },
    wallT: { default: 2, min: 1.2, max: 4, unit: "mm", label: "wall thickness", say: ["wall", "thick"] },
    wallH: { default: 8, min: 3, max: 20, unit: "mm", label: "wall height", say: ["tall", "high", "deep"], more: ["taller", "deeper"], less: ["lower"] },
    baseT: { default: 3, min: 2, max: 6, unit: "mm", label: "base thickness", say: ["base"] },
    seed: { default: 1, min: 1, max: 999, unit: "count", label: "maze number (each one differs)", say: ["seed", "number"] },
  },
  things: [
    { names: ["finger maze", "finger labyrinth", "sensory maze"], title: "Finger maze", params: { cell: 18, wallH: 5, wallT: 2.4 } },
    { names: ["marble maze", "marble labyrinth", "marble maze game"], title: "Marble maze", spec: "marble" },
    { names: ["tilt maze", "tilting maze", "ball maze game"], title: "Tilt maze", spec: "marble", params: { cells: 9 } },
    { names: ["travel maze", "pocket maze", "small maze puzzle"], title: "Travel maze", params: { cells: 6, cell: 12, wallH: 5, baseT: 2 } },
    { names: ["hard maze", "big maze puzzle", "giant maze"], title: "Big maze", params: { cells: 14, cell: 15, wallH: 6 } },
    { names: ["bead maze", "bb maze", "steel ball maze"], title: "Steel ball maze", params: { cells: 10, cell: 11, wallH: 6, wallT: 1.6 } },
  ],
  body: `
// a seeded random walk carves the maze: the same seed, the same maze. nx cells
// across, ny rows (a square maze unless rows says otherwise).
let s = (seed * 2654435761) % 4294967296;
const rand = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
const nx = cells, ny = rows > 0 ? rows : cells;
const right = Array.from({ length: nx }, () => Array(ny).fill(true));   // wall on a cell's +x side
const up = Array.from({ length: nx }, () => Array(ny).fill(true));      // wall on a cell's +y side
const seen = Array.from({ length: nx }, () => Array(ny).fill(false));
const stack = [[0, 0]];
seen[0][0] = true;
while (stack.length) {
  const [x, y] = stack[stack.length - 1];
  const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy, dx, dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < nx && b < ny && !seen[a][b]);
  if (!next.length) { stack.pop(); continue; }
  const [a, b, dx, dy] = next[Math.floor(rand() * next.length)];
  if (dx === 1) right[x][y] = false; else if (dx === -1) right[a][b] = false;
  else if (dy === 1) up[x][y] = false; else up[a][b] = false;
  seen[a][b] = true;
  stack.push([a, b]);
}
// walls: the outside frame with a gap in at the first cell and out at the last, then the inside walls merged into runs
const L = nx * cell + wallT, D = ny * cell + wallT, z = baseT - 0.01, h = wallH + 0.01;
const wallX = (x0, x1, y) => translate([x0, y, z], cube([x1 - x0 + wallT, wallT, h]));   // along x at a grid line y
const wallY = (y0, y1, x) => translate([x, y0, z], cube([wallT, y1 - y0 + wallT, h]));   // along y at a grid line x
const runs = [wallX(0, nx * cell, 0), wallX(0, nx * cell, ny * cell), wallY(cell, ny * cell, 0), wallY(0, (ny - 1) * cell, nx * cell)];
for (let c = 0; c < nx - 1; c++) {
  let start = -1;
  for (let r = 0; r <= ny; r++) {
    const on = r < ny && right[c][r];
    if (on && start < 0) start = r;
    if (!on && start >= 0) { runs.push(wallY(start * cell, r * cell, (c + 1) * cell)); start = -1; }
  }
}
for (let r = 0; r < ny - 1; r++) {
  let start = -1;
  for (let c = 0; c <= nx; c++) {
    const on = c < nx && up[c][r];
    if (on && start < 0) start = c;
    if (!on && start >= 0) { runs.push(wallX(start * cell, c * cell, (r + 1) * cell)); start = -1; }
  }
}
return translate([-L / 2, -D / 2, 0], union(cube([L, D, baseT]), ...runs));
`,
};
