// Where on the stage is there still room for the model?
//
// The windows float over the 3D canvas, and the camera frames the part in the
// middle of the WHOLE canvas — so opening the editor puts the model behind it.
// Answering "where is there space" turns that into something the camera can be
// aimed at.
//
// This lives in its own file rather than inside the page because it is the one
// piece here with real algorithmic content, and it can be tested against known
// layouts instead of by opening windows and squinting.

// The grid the search is solved on. 16px is finer than any placement decision
// that matters and keeps a 4K screen under ten thousand cells.
export const FREE_CELL = 16;

// The largest rectangle containing none of `blockers`.
//
// Rasterise the blocked area, then sweep rows keeping a per-column run of free
// cells and solving largest-rectangle-in-a-histogram at each one. O(cells),
// and — unlike shrinking the viewport away from one window at a time — it can
// never return a rectangle that still has a window in it.
export function largestFreeRect(blockers, W, H, cell = FREE_CELL) {
  if (!(W > 0) || !(H > 0)) return null;
  const cols = Math.max(1, Math.ceil(W / cell));
  const rows = Math.max(1, Math.ceil(H / cell));
  const blocked = new Uint8Array(cols * rows);
  for (const q of blockers || []) {
    if (!q || !(q.right > q.left) || !(q.bottom > q.top)) continue;
    const x0 = Math.max(0, Math.floor(q.left / cell));
    const x1 = Math.min(cols - 1, Math.ceil(q.right / cell) - 1);
    const y0 = Math.max(0, Math.floor(q.top / cell));
    const y1 = Math.min(rows - 1, Math.ceil(q.bottom / cell) - 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) blocked[y * cols + x] = 1;
    }
  }
  const heights = new Int32Array(cols);
  const stack = [];                    // [firstColumn, height]
  let best = null, bestArea = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) heights[x] = blocked[y * cols + x] ? 0 : heights[x] + 1;
    stack.length = 0;
    for (let x = 0; x <= cols; x++) {
      const h = x === cols ? 0 : heights[x];
      let start = x;
      while (stack.length && stack[stack.length - 1][1] >= h) {
        const [i, hh] = stack.pop();
        const area = hh * (x - i);
        if (area > bestArea) {
          bestArea = area;
          best = {
            l: i * cell, r: x * cell,
            t: (y + 1 - hh) * cell, b: (y + 1) * cell,
          };
        }
        start = i;
      }
      stack.push([start, h]);
    }
  }
  if (!best) return null;
  best.r = Math.min(best.r, W);
  best.b = Math.min(best.b, H);
  return best;
}

export const rectsOverlap = (a, b) =>
  a.r > b.left && a.l < b.right && a.b > b.top && a.t < b.bottom;

// Below this there is no useful place to put a model, and shrinking one to fit
// would be a worse answer than leaving it where it is and saying so.
export const MIN_FREE_W = 170, MIN_FREE_H = 140;

// The rectangle to actually use, given the one already in use.
//
// The largest free rectangle can flip between two near-equal candidates on
// either side of a window as it moves, and a model that hops across the screen
// for a two-pixel difference in area is worse than one that stays put. So the
// previous answer wins while it is still clear and still nearly as large.
export function chooseFreeRect(blockers, W, H, previous = null, keepRatio = 0.88) {
  const list = (blockers || []).filter((q) => q && q.right - q.left > 4 && q.bottom - q.top > 4);
  if (!list.length) return { l: 0, t: 0, r: W, b: H };
  const best = largestFreeRect(list, W, H);
  if (!best || best.r - best.l < MIN_FREE_W || best.b - best.t < MIN_FREE_H) return null;
  if (previous) {
    const fits = previous.r <= W && previous.b <= H
      && previous.r - previous.l >= MIN_FREE_W && previous.b - previous.t >= MIN_FREE_H;
    const clean = !list.some((q) => rectsOverlap(previous, q));
    const area = (previous.r - previous.l) * (previous.b - previous.t);
    if (fits && clean && area >= (best.r - best.l) * (best.b - best.t) * keepRatio) return previous;
  }
  return best;
}
