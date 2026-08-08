// The printer presets an exported 3MF names.
//
// A slicer matches these by STRING against its own installed presets. A name
// that is close but not exact is not an error anywhere — the slicer silently
// keeps whatever printer was selected last, and the file opens looking fine
// while being set up for the wrong machine. So the thing worth testing is that
// every id we write is spelled the way the vendor spells it.
//
// Where a real OrcaSlicer is installed this checks against ITS profile files,
// which is the only check that can catch a vendor rename. Where one is not, the
// shape of the config is still checked, so this suite is meaningful on a build
// machine too.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { PRINTERS, projectSettings, colored3MF } from "../viewer/exporters.js";
import { unzipEntry } from "../viewer/inventory.js";

let pass = 0, fail = 0, skipped = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};
const skip = (label, why) => { skipped++; console.log(`  SKIP  ${label} — ${why}`); };

console.log("\nthe preset config has the shape a slicer reads\n");
{
  const s = projectSettings("snapmaker-u1", ["#d4af37", "#2b2b2b"]);
  check("a known printer produces a config", !!s);
  check("an unknown one produces nothing rather than a guess",
    projectSettings("no-such-printer", []) === null);
  check("no printer at all produces nothing", projectSettings(undefined, []) === null);

  // The U1 is a toolchanger with four heads. Every per-extruder array has to be
  // four long or the slicer reads a printer with fewer tools than it has.
  const n = PRINTERS["snapmaker-u1"].nozzles;
  check("four tool heads", n === 4, `${n}`);
  for (const key of ["filament_settings_id", "nozzle_diameter", "filament_colour", "filament_type"]) {
    check(`${key} has one entry per tool head`, Array.isArray(s[key]) && s[key].length === n,
      `${s[key]?.length}`);
  }
  // The model's own colours come first, in extruder order; unused heads still
  // need a filament named or the slicer invents one.
  check("the model's colours land on the first heads",
    s.filament_colour[0].toLowerCase() === "#d4af37" && s.filament_colour[1].toLowerCase() === "#2b2b2b",
    s.filament_colour.join(","));
  check("...and the spare heads are still filled",
    s.filament_colour.slice(2).every((c) => /^#[0-9A-Fa-f]{6}$/.test(c)), s.filament_colour.join(","));
  check("it declares itself a project", s.from === "project" && s.name === "project_settings");
}

console.log("\nchoosing a printer changes the file, and only that part of it\n");
{
  const g = (color, z) => ({
    color,
    verts: [[0, 0, z], [20, 0, z], [20, 20, z], [0, 20, z], [0, 0, z + 3], [20, 0, z + 3], [20, 20, z + 3], [0, 20, z + 3]],
    tris: [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
      [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]],
  });
  const groups = [g("#d4af37", 0), g("#2b2b2b", 3)];
  const withPrinter = colored3MF(groups, "demo", { printer: "snapmaker-u1" });
  const without = colored3MF(groups, "demo", {});

  const read = async (zip, re) => new TextDecoder().decode(await unzipEntry(zip, re));
  const a = await read(withPrinter, /project_settings\.config$/);
  const b = await read(without, /project_settings\.config$/);
  check("the printer is named when one is chosen", /Snapmaker U1 \(0\.4 nozzle\)/.test(a), a.slice(0, 80));
  check("...and not when one is not", !/printer_settings_id/.test(b), b.slice(0, 80));
  check("the palette still travels either way",
    /filament_colour/.test(a) && /filament_colour/.test(b));

  // The geometry a slicer reads must not depend on which printer was picked.
  check("3D/3dmodel.model is byte-identical with and without a printer",
    (await read(withPrinter, /\.model$/)) === (await read(without, /\.model$/)));
}

console.log("\nevery id matches a preset OrcaSlicer actually ships\n");
{
  const roots = [
    "C:/Program Files/OrcaSlicer/resources/profiles",
    "C:/Program Files (x86)/OrcaSlicer/resources/profiles",
    "/Applications/OrcaSlicer.app/Contents/Resources/profiles",
  ];
  const root = roots.find((r) => existsSync(r));
  if (!root) {
    skip("checked against the installed OrcaSlicer", "no OrcaSlicer install found here");
  } else {
    // Every preset name the vendor defines, from the profile files themselves.
    const names = (vendor, kind) => {
      const dir = `${root}/${vendor}/${kind}`;
      if (!existsSync(dir)) return new Set();
      const out = new Set();
      for (const f of readdirSync(dir)) {
        if (!f.endsWith(".json")) continue;
        try { out.add(JSON.parse(readFileSync(`${dir}/${f}`, "utf8")).name); } catch { /* skip */ }
      }
      return out;
    };
    const machines = names("Snapmaker", "machine");
    const processes = names("Snapmaker", "process");
    const filaments = names("Snapmaker", "filament");
    check("the Snapmaker profiles are present", machines.size > 0, `${machines.size}`);

    for (const [key, p] of Object.entries(PRINTERS)) {
      check(`${key}: the printer preset exists`, machines.has(p.printer), p.printer);
      check(`${key}: the process preset exists`, processes.has(p.process), p.process);
      check(`${key}: the filament preset exists`, filaments.has(p.filament), p.filament);

      // And the machine profile agrees with what we claim about the machine —
      // a vendor changing the tool count would otherwise go unnoticed until a
      // four-colour print came out on one head.
      const dir = `${root}/Snapmaker/machine`;
      const file = readdirSync(dir).find((f) => {
        try { return JSON.parse(readFileSync(`${dir}/${f}`, "utf8")).name === p.printer; }
        catch { return false; }
      });
      if (!file) { check(`${key}: machine file readable`, false, p.printer); continue; }
      const m = JSON.parse(readFileSync(`${dir}/${file}`, "utf8"));
      check(`${key}: the profile really has ${p.nozzles} nozzles`,
        Array.isArray(m.nozzle_diameter) && m.nozzle_diameter.length === p.nozzles,
        `${m.nozzle_diameter?.length}`);
      check(`${key}: printer_model matches`, m.printer_model === p.model, `${m.printer_model}`);
      check(`${key}: the build volume we advertise matches the profile`,
        Math.abs(Number(m.printable_height) - p.height) < 1.5,
        `profile ${m.printable_height} vs ours ${p.height}`);
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ""}\n`);
process.exit(fail ? 1 : 0);
