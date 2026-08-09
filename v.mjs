import * as dsl from "./index.js";
const fns = Object.keys(dsl).filter((k) => typeof dsl[k] === "function").sort();
console.log("total callable:", fns.length);
console.log("\nrounding / box-ish:");
console.log(fns.filter((f) => /round|fillet|chamfer|cub|box|cuboid|hull|blend/i.test(f)).join("  "));
console.log("\ngears:");
console.log(fns.filter((f) => /gear|rack/i.test(f)).join("  "));
