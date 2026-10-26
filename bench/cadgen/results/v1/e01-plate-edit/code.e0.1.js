const T = 12, z0 = -6;
const thru = (x, y, r) => translate([x, y, z0 - 1], cylinder({ r, h: T + 2, $fn: 64 }));

// widened slot: 10 mm wide, centres at x = ±15, centre line y = -25
const slotW = 10, slotY = -25, slotHalf = 15;
const slot = union(
  translate([-slotHalf, slotY - slotW / 2, z0 - 1], cube([2 * slotHalf, slotW, T + 2])),
  thru(-slotHalf, slotY, slotW / 2),
  thru(slotHalf, slotY, slotW / 2),
);

let part = importedSolid("input.step");
part = difference(part, thru(0, 0, 18));          // bore Ø30 -> Ø36
part = difference(part, slot);                    // slot 8 -> 10 mm
part = difference(part, thru(-20, 20, 3.3), thru(20, 20, 3.3));  // new Ø6.6 holes
return part;