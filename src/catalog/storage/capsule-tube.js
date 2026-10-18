// A round tube with a slip-on cap: coin rolls, needles, pencil leads, beads.
// The cap fits over the outside of the tube, so the tube wall never has to
// thin down to a neck, and it prints upside down beside the tube with its
// closed end on the bed. Coins size it from the mint's own diameters.

export default {
  id: "capsule-tube",
  category: "storage",
  title: "Tube with cap",
  summary: "a round storage tube with a slip-on cap, sized for coins, needles, leads or beads.",
  print: "tube upright, cap upside down beside it, no supports.",
  names: ["coin tube", "coin holder", "capsule container", "tube with cap", "tube with lid", "storage tube",
    "coin roll holder", "small tube container", "slip cap tube", "capsule tube", "coin storage tube", "round tube container"],
  nouns: ["tube", "capsule", "vial"],
  keywords: ["coin", "coins", "cap", "round", "roll", "needle", "storage"],
  fits: ["coin"],
  fromSpec: (s) => ({ innerD: s.dims.d + 0.6 }),
  specNote: "with 0.3 mm of room round each coin",
  primary: "innerD",
  tips: ["for quarters", "100 mm long", "30 mm across inside"],
  examples: ["make me a coin tube for quarters", "a storage tube with cap 20mm inside, 80 long",
    "coin holder for dimes", "tube with lid for sewing needles"],
  params: {
    innerD: { default: 25, min: 5, max: 80, unit: "mm", label: "inside diameter", say: ["diameter", "across", "inside", "wide"], more: ["wider", "bigger"], less: ["narrower", "smaller"] },
    innerL: { default: 60, min: 10, max: 200, unit: "mm", label: "inside length", say: ["long", "length", "tall", "deep"], more: ["longer", "taller"], less: ["shorter"] },
    wall: { default: 1.6, min: 1.2, max: 4, unit: "mm", label: "wall thickness", say: ["wall", "thick"] },
    capL: { default: 15, min: 5, max: 40, unit: "mm", label: "cap length", say: ["cap", "lid"] },
    fit: { default: 0.25, min: 0.1, max: 0.6, unit: "mm", label: "cap clearance per side", say: ["fit", "clearance", "loose", "tight"] },
  },
  things: [
    { names: ["quarter tube", "quarter holder", "quarter roll holder"], title: "Quarter tube", spec: "us-quarter", params: { innerL: 72 } },
    { names: ["penny tube", "penny holder", "penny roll holder"], title: "Penny tube", spec: "us-penny", params: { innerL: 78 } },
    { names: ["dime tube", "dime holder", "dime roll holder"], title: "Dime tube", spec: "us-dime", params: { innerL: 70 } },
    { names: ["nickel tube", "nickel holder", "nickel roll holder"], title: "Nickel tube", spec: "us-nickel", params: { innerL: 80 } },
    { names: ["euro coin tube", "2 euro coin tube", "euro coin holder"], title: "Euro coin tube", spec: "euro-2", params: { innerL: 60 } },
    { names: ["pound coin tube", "pound coin holder"], title: "Pound coin tube", spec: "gbp-1", params: { innerL: 60 } },
    { names: ["needle case", "sewing needle case", "needle tube", "needle holder"], title: "Needle case", params: { innerD: 10, innerL: 70, capL: 12 } },
    { names: ["pencil lead case", "lead refill case", "mechanical pencil lead holder"], title: "Pencil lead case", params: { innerD: 8, innerL: 80, wall: 1.2, capL: 12 } },
    { names: ["bead tube", "seed bead tube", "glitter tube"], title: "Bead tube", params: { innerD: 16, innerL: 50, capL: 10 } },
  ],
  body: `
const R = innerD / 2 + wall;                        // tube outside
const floor = Math.max(1.2, wall);
// a cup: closed at the bottom, open at the top
const cup = (ro, ri, h) => difference(
  cylinder({ r: ro, h: h + floor, $fn: 64 }),
  translate([0, 0, floor], cylinder({ r: ri, h: h + 1, $fn: 64 })),
);
const vessel = cup(R, innerD / 2, innerL);
// the cap slides over the outside of the tube; printed closed end down
const capIn = R + fit, capOut = capIn + wall;
const cap = cup(capOut, capIn, capL);
return group(translate([-capOut - 3, 0, 0], vessel), translate([R + 3, 0, 0], cap));
`,
};
