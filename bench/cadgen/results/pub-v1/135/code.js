const T = 2, H = 19, L = 254, W = 114;
const Ri = 15, Ro = 35;
const tabW = 40.46, tabTop = 40, tabR = 17;
const yc = W / 2;
const slotW = 5, slotL = 17, slotZ = 28.5;
const sHalf = (slotL - slotW) / 2;

const arm = () => intersection(
  difference(
    difference(cylinder({ r: Ro, h: H }), translate([0, 0, -1], cylinder({ r: Ri, h: H + 2 }))),
    translate([0, 0, T], difference(
      cylinder({ r: Ro - T, h: H - 2 * T }),
      translate([0, 0, -1], cylinder({ r: Ri + T, h: H }))))
  ),
  translate([0, 0, -1], cube([Ro + 1, Ro + 1, H + 2]))
);

const slotEnd = (y) => translate([3, y, slotZ], rotate([0, 90, 0], cylinder({ r: slotW / 2, h: T + 2 })));

const tabBody = () => union(
  translate([4, yc - tabW / 2, 17], cube([T, tabW, 6.5])),
  intersection(
    translate([4, yc, tabTop - tabR], rotate([0, 90, 0], cylinder({ r: tabR, h: T }))),
    translate([3, yc - tabW / 2, 22], cube([T + 2, tabW, 20]))
  )
);

const tab = () => {
  let t = tabBody();
  t = difference(t, translate([3, yc - sHalf, slotZ - slotW / 2], cube([T + 2, 2 * sHalf, slotW])));
  t = difference(t, slotEnd(yc - sHalf));
  t = difference(t, slotEnd(yc + sHalf));
  return t;
};

const endPart = () => union(
  translate([0, 15, 0], cube([T, W - 30, H])),
  translate([0, 15, 0], cube([6, W - 30, T])),
  translate([0, 15, H - T], cube([6, W - 30, T])),
  translate([2, 0, 0], arm()),
  translate([2, W, 0], mirror([0, 1, 0], arm())),
  tab()
);

const rail = union(
  translate([16.5, 0, 0], cube([221, T, H])),
  translate([16.5, 0, 0], cube([221, 4, T])),
  translate([16.5, 0, H - T], cube([221, 4, T]))
);

const left = endPart();
const right = translate([L, 0, 0], mirror([1, 0, 0], endPart()));

return union(rail, left, right);