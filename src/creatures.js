// Baseline silhouettes for organic models.
//
// Watching generated animals fail is watching the same failure: the model
// invents anatomy from scratch, in numbers, with no picture — and the giraffe
// comes out haunted, the cat is a potato with floating ears. What the model is
// GOOD at is adjusting: "the head a little bigger", "legs shorter". So give it
// something correct to adjust. Each archetype here is a hand-tuned ball
// skeleton — the blob() input — whose silhouette already reads as its animal,
// with cute proportions baked in per the #organic rules (head about a third of
// the height, stubby limbs, nothing under 2.5% of height in radius).
//
// Canonical space: height 100, +X is FORWARD (the face), Z up, grounded at
// z=0, symmetric in Y. creature() scales everything uniformly to the asked
// height. Anchors are for the parts that must NOT be blended (per #organic —
// eyes, ears, nose sit proud of the flesh): they give the model real
// coordinates on the finished form instead of guesses.

const C = {
  // A sitting cat/dog/bear mass: big haunch, chest rising to an oversized
  // head, front legs down the chest, tail curled at the base.
  "quadruped-sitting": {
    balls: [
      [-2, 0, 22, 26],                 // haunch
      [-5, 14, 18, 12], [-5, -14, 18, 12],   // hips
      [10, 0, 36, 18],                 // chest
      [12, 0, 52, 14],                 // upper chest / shoulders
      [15, 0, 78, 22],                 // head — a third of the height
      [28, 0, 72, 9],                  // muzzle
      [8, 12, 96, 6], [8, -12, 96, 6], // ears
      [18, 9, 14, 7], [18, -9, 14, 7],       // front legs
      [20, 9, 5, 6], [20, -9, 5, 6],         // paws
      [-24, 0, 14, 7], [-32, 0, 9, 5.5],     // tail curl (flop it aside yourself)
    ],
    anchors: {
      headCentre: [15, 0, 78], noseTip: [37, 0, 72],
      eyeL: [33, 9, 82], eyeR: [33, -9, 82],
      earL: [8, 12, 100], earR: [8, -12, 100],
      tailTip: [-36, 0, 9], back: [-2, 0, 48],
    },
  },
  // Standing on four stubby legs: dog, pony, giraffe body (give the giraffe
  // its comically short thick neck by scaling the neck ball, not adding one).
  "quadruped-standing": {
    balls: [
      [-20, 10, 8, 5.5], [-20, -10, 8, 5.5], [20, 10, 8, 5.5], [20, -10, 8, 5.5],   // lower legs
      [-20, 10, 22, 7], [-20, -10, 22, 7], [20, 10, 22, 7], [20, -10, 22, 7],       // upper legs
      [-14, 0, 40, 16], [0, 0, 42, 18], [14, 0, 42, 16],    // body
      [24, 0, 58, 10],                 // neck
      [32, 0, 74, 15],                 // head
      [44, 0, 70, 7],                  // muzzle
      [26, 8, 88, 5], [26, -8, 88, 5], // ears
      [-28, 0, 50, 6], [-34, 0, 58, 4.5],    // tail
    ],
    anchors: {
      headCentre: [32, 0, 74], noseTip: [51, 0, 70],
      eyeL: [44, 8, 78], eyeR: [44, -8, 78],
      earL: [26, 8, 92], earR: [26, -8, 92],
      tailTip: [-36, 0, 60], back: [0, 0, 60],
    },
  },
  // An egg with a big head: chick, owl, penguin start here.
  bird: {
    balls: [
      [0, 0, 30, 24],                  // body
      [8, 0, 22, 16],                  // breast
      [4, 0, 72, 21],                  // head
      [-18, 0, 34, 9], [-26, 0, 42, 6],      // tail
      [0, 19, 34, 10], [0, -19, 34, 10],     // wings
    ],
    anchors: {
      headCentre: [4, 0, 72], noseTip: [24, 0, 68],    // beak base
      eyeL: [21, 11, 77], eyeR: [21, -11, 77],
      earL: [0, 10, 92], earR: [0, -10, 92],
      tailTip: [-30, 0, 44], back: [0, 0, 52],
    },
  },
  // Side-on fish: fat front tapering back, tail flare, dorsal bump.
  fish: {
    balls: [
      [24, 0, 44, 40],                 // head/front
      [0, 0, 40, 34],
      [-28, 0, 40, 26],
      [-52, 0, 44, 14],                // tail root
      [-72, 0, 64, 14], [-72, 0, 24, 14],    // tail fin
      [0, 0, 80, 16],                  // dorsal bump
    ],
    anchors: {
      headCentre: [24, 0, 44], noseTip: [62, 0, 40],
      eyeL: [52, 25, 50], eyeR: [52, -25, 50],
      earL: [0, 24, 88], earR: [0, -24, 88],           // fin points, really
      tailTip: [-84, 0, 44], back: [0, 0, 92],
    },
  },
  // Gnome / snowman / mascot: three stacked masses and arm stubs.
  humanoid: {
    balls: [
      [0, 0, 20, 24],                  // base
      [0, 0, 50, 18],                  // belly
      [2, 0, 82, 17],                  // head
      [16, 12, 48, 6], [16, -12, 48, 6],     // arms, reaching a little forward
    ],
    anchors: {
      headCentre: [2, 0, 82], noseTip: [18, 0, 80],
      eyeL: [16, 8, 86], eyeR: [16, -8, 86],
      earL: [2, 16, 84], earR: [2, -16, 84],
      tailTip: [-20, 0, 24], back: [0, 0, 66],
    },
  },
};

export const CREATURE_NAMES = Object.keys(C);

const spec = (name) => {
  const s = C[name];
  if (!s) {
    throw new Error(`creature(): no "${name}" — the body plans are ${CREATURE_NAMES.join(", ")}.`);
  }
  return s;
};

// The scaled ball list — blob()'s input. `h` is the finished height in mm;
// `chubby` widens Y only (1.3 is plush-toy, 0.8 is sleek) without touching the
// silhouette that reads from the side.
export function creatureBalls(name, { h = 100, chubby = 1 } = {}) {
  const s = h / 100;
  return spec(name).balls.map(([x, y, z, r]) => [x * s, y * s * chubby, z * s, r * s]);
}

// The FACE, by plan. creature() ships decorated — the first bird anyone built
// from the bare plan came out with no beak and no eyes, which is a Halloween
// decoration, not a toy. Data only (dsl.js turns it into shapes): every plan
// gets eyes at its eye anchors; beaks, noses and their colours are the plan's
// own call. Sizes are per-100 height, scaled with everything else.
const DECOR = {
  "quadruped-sitting": [
    { kind: "eye", at: "eyeL", r: 2.6 }, { kind: "eye", at: "eyeR", r: 2.6 },
    { kind: "nose", at: "noseTip", r: 2.2, color: [230, 120, 140] },
  ],
  "quadruped-standing": [
    { kind: "eye", at: "eyeL", r: 2.2 }, { kind: "eye", at: "eyeR", r: 2.2 },
    { kind: "nose", at: "noseTip", r: 2, color: [60, 45, 45] },
  ],
  bird: [
    { kind: "eye", at: "eyeL", r: 2.6 }, { kind: "eye", at: "eyeR", r: 2.6 },
    // a stubby cone, pointing forward off the head
    { kind: "beak", at: "noseTip", r: 4.5, len: 10, color: [240, 160, 60] },
  ],
  fish: [
    { kind: "eye", at: "eyeL", r: 3.4 }, { kind: "eye", at: "eyeR", r: 3.4 },
  ],
  humanoid: [
    { kind: "eye", at: "eyeL", r: 2.2 }, { kind: "eye", at: "eyeR", r: 2.2 },
    { kind: "nose", at: "noseTip", r: 2.4, color: [225, 150, 130] },
  ],
};
const EYE_COLOR = [35, 35, 40];

export function creatureDecor(name, { h = 100, chubby = 1 } = {}) {
  spec(name);                        // validate before the quiet [] fallback
  const a = creatureAnchors(name, { h, chubby });
  const s = h / 100;
  return (DECOR[name] || []).map((d) => ({
    kind: d.kind,
    at: a[d.at],
    r: d.r * s,
    len: (d.len ?? 0) * s,
    color: d.color ?? EYE_COLOR,
  }));
}

// Real coordinates on the finished form, for the parts that must NOT go into
// the blend: eyes, nose, ear decorations, a tail pompom. Guessing these is how
// eyes end up floating beside the head.
export function creatureAnchors(name, { h = 100, chubby = 1 } = {}) {
  const s = h / 100;
  const out = {};
  for (const [k, [x, y, z]] of Object.entries(spec(name).anchors)) {
    out[k] = [x * s, y * s * chubby, z * s];
  }
  return out;
}
