// A display stand for a ball: a lathed pedestal whose top is a ring the
// ball sits in, a dish inside it to keep clear of the ball, flaring out to
// the ring at 52 degrees so it prints upright with nothing hanging. Sized
// from the ball's real diameter; several in a row share one base bar.

export default {
  id: "ball-stand",
  category: "fitness",
  title: "Ball display stand",
  summary: "a pedestal that holds a ball on a ring, sized to the ball; one or a row of them.",
  print: "upright as shown, no supports.",
  names: ["ball stand", "ball display stand", "ball holder stand", "sports ball stand", "ball display", "ball pedestal",
    "ball rest", "signed ball display", "ball display holder", "autographed ball stand"],
  nouns: ["stand", "display", "pedestal", "rest"],
  keywords: ["ball", "balls", "signed", "autographed", "sports", "trophy", "display"],
  fits: ["ball"],
  fromSpec: (s) => ({ ballD: s.dims.d }),
  primary: "ballD",
  ask: {
    unless: ["ballD"],
    text: "Which ball is it for? Name it (“for a soccer ball”, “golf ball”) and I’ll size the ring to it; I used a baseball, 74 mm.",
  },
  tips: ["for a basketball", "3 balls in a row", "taller"],
  examples: ["I want a ball display stand", "make me a ball stand for a soccer ball", "golf ball display stand for 3 balls",
    "a stand for my signed baseball"],
  params: {
    ballD: { default: 74, min: 30, max: 250, unit: "mm", label: "ball diameter", say: ["ball", "diameter", "across"] },
    height: { default: 30, min: 10, max: 150, unit: "mm", label: "stand height", say: ["tall", "high", "height"], more: ["taller", "higher"], less: ["shorter", "lower"] },
    wall: { default: 3, min: 1.6, max: 8, unit: "mm", label: "ring thickness", say: ["wall", "thick"] },
    seat: { default: 0.5, min: 0.3, max: 0.7, unit: "ratio", label: "ring size, as a share of the ball", say: ["seat", "ring"] },
    count: { default: 1, min: 1, max: 6, unit: "count", label: "how many balls in a row", say: ["ball", "balls"] },
  },
  things: [
    { names: ["golf ball display stand", "golf ball stand", "golf ball holder"], title: "Golf ball stand", spec: "golf-ball" },
    { names: ["golf ball display", "golf ball display rack", "hole in one display"], title: "Golf ball display", spec: "golf-ball", params: { count: 3, height: 20 } },
    { names: ["baseball display stand", "baseball stand", "baseball holder", "signed baseball display"], title: "Baseball stand", spec: "baseball" },
    { names: ["softball display stand", "softball stand", "softball holder"], title: "Softball stand", spec: "softball" },
    { names: ["tennis ball display stand", "tennis ball stand"], title: "Tennis ball stand", spec: "tennis-ball" },
    { names: ["basketball display stand", "basketball stand", "basketball holder"], title: "Basketball stand", spec: "basketball", params: { height: 40, wall: 4 } },
    { names: ["soccer ball display stand", "soccer ball stand", "soccer ball holder", "football display stand"], title: "Soccer ball stand", spec: "soccer-ball", params: { height: 40, wall: 4 } },
    { names: ["volleyball display stand", "volleyball stand", "volleyball holder"], title: "Volleyball stand", spec: "volleyball", params: { height: 40, wall: 4 } },
    { names: ["bowling ball stand", "bowling ball cup", "bowling ball holder"], title: "Bowling ball cup", spec: "bowling-ball", params: { height: 30, wall: 5, seat: 0.6 } },
    { names: ["pickleball display stand", "pickleball stand"], title: "Pickleball stand", spec: "pickleball" },
    { names: ["cricket ball display stand", "cricket ball stand"], title: "Cricket ball stand", spec: "cricket-ball" },
    { names: ["billiard ball stand", "pool ball stand", "8 ball display stand"], title: "Billiard ball stand", spec: "billiard-ball", params: { height: 20 } },
    { names: ["table tennis ball display", "table tennis ball stand"], title: "Table tennis ball stand", spec: "table-tennis-ball", params: { height: 15, wall: 2 } },
    { names: ["lacrosse ball stand", "lacrosse ball display"], title: "Lacrosse ball stand", spec: "lacrosse-ball" },
  ],
  body: `
const Rb = ballD / 2;
const rs = Rb * seat;                                     // the ring the ball sits on
const sag = Rb - Math.sqrt(Rb * Rb - rs * rs);            // how far the ball dips below the ring
const ro = rs + wall;
const rw = Math.max(rs * 0.55, 5);                        // waist
const k = Math.tan(52 * Math.PI / 180);
const flare = (ro - rw) * k;                              // the flare up to the ring
const baseR = Math.max(ro * 1.05, rw + 10), baseT = 4;
const H = Math.max(height, baseT + (baseR - rw) + flare + 2);
const dish = Math.min(H - 2, sag + 2);                    // a cone inside the ring, clear of the ball
const one = revolve(360, polygon([
  [0, 0], [baseR, 0], [baseR, baseT], [rw, baseT + baseR - rw], [rw, H - flare], [ro, H], [rs, H], [0, H - dish],
]));
if (count <= 1) return one;
const pitch = Math.max(ballD + 4, 2 * baseR + 2);
const span = (count - 1) * pitch;
const bar = translate([-span / 2, -baseR * 0.6, 0], cube([span, baseR * 1.2, baseT]));
return union(bar, ...Array.from({ length: count }, (_, i) => translate([-span / 2 + i * pitch, 0, 0], one)));
`,
};
