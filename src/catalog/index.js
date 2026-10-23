// The model catalog's registry: every family, every named thing, every
// real-object spec. Static imports on purpose: the site bundle checks that
// every relative import resolves (build-site.mjs), so a family file that is
// registered but missing fails the build instead of blanking the page.
//
// To add a family: write src/catalog/<category>/<id>.js, import it in that
// category's index.js. Nothing here changes.

import { CATEGORIES } from "./schema.js";
import { SPECS as DEVICE_SPECS } from "./specs/devices.js";
import { SPECS as HOUSEHOLD_SPECS } from "./specs/household.js";
import * as desk from "./desk/index.js";
import * as wall from "./wall/index.js";
import * as storage from "./storage/index.js";
import * as kitchen from "./kitchen/index.js";
import * as bathroom from "./bathroom/index.js";
import * as garage from "./garage/index.js";
import * as garden from "./garden/index.js";
import * as electronics from "./electronics/index.js";
import * as home from "./home/index.js";
import * as fitness from "./fitness/index.js";
import * as gaming from "./gaming/index.js";
import * as pets from "./pets/index.js";
import * as travel from "./travel/index.js";
import * as kids from "./kids/index.js";
import * as printer from "./printer/index.js";
import * as vehicle from "./vehicle/index.js";
import * as decor from "./decor/index.js";
import * as access from "./access/index.js";

const GROUPS = { desk, wall, storage, kitchen, bathroom, garage, garden, electronics, home,
  fitness, gaming, pets, travel, kids, printer, vehicle, decor, access };

export { CATEGORIES };
export const FAMILIES = Object.values(GROUPS).flatMap((g) => g.FAMILIES);
export const SPECS = [...DEVICE_SPECS, ...HOUSEHOLD_SPECS, ...Object.values(GROUPS).flatMap((g) => g.SPECS)];

const byId = new Map(FAMILIES.map((f) => [f.id, f]));
export const familyById = (id) => byId.get(id) || null;
const specById = new Map(SPECS.map((s) => [s.id, s]));
export const specFor = (id) => specById.get(id) || null;

// Every named request the catalog answers: each family under its own names,
// then each of its things. What "the top 1000" counts.
export function allThings() {
  const out = [];
  for (const f of FAMILIES) {
    out.push({ family: f.id, names: f.names, params: {}, title: f.title });
    for (const t of f.things || []) out.push({ family: f.id, ...t, title: t.title || t.names[0] });
  }
  return out;
}

export function catalogStats() {
  const perCategory = {};
  for (const f of FAMILIES) perCategory[f.category] = (perCategory[f.category] || 0) + 1;
  return { families: FAMILIES.length, things: allThings().length, specs: SPECS.length, perCategory };
}
