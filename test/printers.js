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
import { PRINTERS, projectSettings, colored3MF, partsPlate3MF, bambuPreset, BAMBU_NOZZLES, BAMBU_PROJECT_VERSION } from "../viewer/exporters.js";
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

console.log("\na Bambu printer makes the file a Bambu Studio project that names installed presets\n");
{
  // Bambu Studio only reads a project config from a file whose Application
  // says BambuStudio-, and draws plates only from that config. Verified by
  // hand in Bambu Studio 2.7 on an A1 mini: three plates, presets as before.
  const s = projectSettings("bambu-a1m", ["#AA0000", "#00AA00", "#0000AA"], "0.6");
  check("the 0.6 nozzle names the 0.6 presets",
    s.printer_settings_id === "Bambu Lab A1 mini 0.6 nozzle" && s.print_settings_id === "0.30mm Standard @BBL A1M 0.6 nozzle",
    `${s.printer_settings_id} / ${s.print_settings_id}`);
  check("one filament slot per colour", s.filament_settings_id.length === 3 && s.filament_colour.length === 3);
  // Preset::normalize trims every per-filament list to filament_diameter's
  // length; without it the second and third filament names were emptied
  check("filament_diameter is one per slot", Array.isArray(s.filament_diameter) && s.filament_diameter.length === 3,
    JSON.stringify(s.filament_diameter));
  check("different_settings_to_system has process + filaments + printer entries",
    s.different_settings_to_system.length === 3 + 2, `${s.different_settings_to_system.length}`);
  check("it carries no preset values of its own",
    Object.keys(s).every((k) => ["version", "name", "from", "printer_settings_id", "print_settings_id",
      "filament_settings_id", "filament_colour", "filament_diameter", "different_settings_to_system"].includes(k)),
    Object.keys(s).join());
  check("an unknown nozzle falls back to the printer's default",
    bambuPreset("bambu-a1m", "1.0").nozzle === "0.4" && projectSettings("bambu-a1m", [], "1.0").printer_settings_id === "Bambu Lab A1 mini 0.4 nozzle");
  check("no colours still gives one slot", projectSettings("bambu-x1c", [], "0.4").filament_colour.length === 1);
  check("the version is one every current Bambu Studio is newer than",
    /^0?2\.00\./.test(BAMBU_PROJECT_VERSION), BAMBU_PROJECT_VERSION);

  const g = (color, z) => ({
    color,
    verts: [[0, 0, z], [20, 0, z], [20, 20, z], [0, 20, z], [0, 0, z + 3], [20, 0, z + 3], [20, 20, z + 3], [0, 20, z + 3]],
    tris: [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
      [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]],
  });
  const groups = [g("#d4af37", 0), g("#2b2b2b", 3)];
  const read = async (zip, re) => new TextDecoder().decode(await unzipEntry(zip, re));
  const [parts] = partsPlate3MF(groups, "demo", { printer: "bambu-a1m", nozzle: "0.6" });
  const model = await read(parts.bytes, /\.model$/);
  check("the parts file says it is a Bambu Studio project",
    /<metadata name="Application">BambuStudio-/.test(model) && /BambuStudio:3mfVersion">1</.test(model));
  const cfg = JSON.parse(await read(parts.bytes, /project_settings\.config$/));
  check("...and its project config names the presets", cfg.printer_settings_id === "Bambu Lab A1 mini 0.6 nozzle");
  const colour = await read(colored3MF(groups, "demo", { printer: "bambu-p1s", nozzle: "0.4" }), /\.model$/);
  check("so does the colour 3MF", /BambuStudio-/.test(colour) && /3mfVersion/.test(colour));
  const plain = await read(partsPlate3MF(groups, "demo", {})[0].bytes, /\.model$/);
  check("with no printer the file is still BREPcode's own",
    /<metadata name="Application">BREPcode-/.test(plain) && !/3mfVersion/.test(plain));
  const snap = await read(colored3MF(groups, "demo", { printer: "snapmaker-u1" }), /\.model$/);
  check("and a Snapmaker file never claims to be a Bambu project", !/BambuStudio/.test(snap));
}

console.log("\nevery Bambu id matches a preset the installed slicer ships\n");
{
  // Bambu Studio keeps its vendor profiles under %APPDATA%; OrcaSlicer bundles
  // a copy of them. Process and filament presets say which machines they fit
  // in compatible_printers, inherited down a chain, so that is what is read.
  const appdata = process.env.APPDATA || "";
  const roots = [
    `${appdata}/BambuStudio/system/BBL`,
    "C:/Program Files/OrcaSlicer/resources/profiles/BBL",
    "/Applications/OrcaSlicer.app/Contents/Resources/profiles/BBL",
  // OrcaSlicer 2.5 packs its profiles into BBL.opc and leaves the BBL folder
  // holding only cover images, so a root counts only with its machine/ folder
  ].filter((r) => appdata || !r.startsWith("/")).filter((r) => existsSync(`${r}/machine`));
  if (!roots.length) {
    skip("checked against an installed Bambu Studio or OrcaSlicer", "neither found here");
  }
  for (const root of roots) {
    const load = (kind) => {
      const dir = `${root}/${kind}`;
      const out = new Map();
      if (!existsSync(dir)) return out;
      for (const f of readdirSync(dir)) {
        if (!f.endsWith(".json")) continue;
        try { const d = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")); if (d.name) out.set(d.name, d); } catch { /* skip */ }
      }
      return out;
    };
    const machines = load("machine"), processes = load("process"), filaments = load("filament");
    const compat = (table, d) => {
      const seen = new Set();
      while (d && !seen.has(d)) {
        seen.add(d);
        if (Array.isArray(d.compatible_printers)) return d.compatible_printers;
        d = table.get(d.inherits);
      }
      return [];
    };
    const label = root.includes("OrcaSlicer") ? "OrcaSlicer's bundled Bambu profiles" : "Bambu Studio's profiles";
    check(`${label} are present`, machines.size > 0, root);
    for (const [key, p] of Object.entries(PRINTERS)) {
      if (!p.bambu) continue;
      for (const nz of BAMBU_NOZZLES) {
        const b = bambuPreset(key, nz);
        const proc = processes.get(b.process), fil = filaments.get(b.filament);
        check(`${label}: ${b.printer} exists`, machines.has(b.printer), b.printer);
        check(`...${b.process} fits it`, !!proc && compat(processes, proc).includes(b.printer), b.process);
        // The names are Bambu Studio's, and Orca's bundled copy of the BBL
        // profiles lags it (three per-nozzle PLA Basic presets were split out
        // after Orca's copy). There a missing filament is Orca inventing a
        // project filament preset, not a wrong machine: noted, not failed.
        if (!fil && root.includes("OrcaSlicer")) { skip(`...${b.filament} in Orca's copy`, "not in its older BBL profiles"); continue; }
        check(`...${b.filament} fits it`, !!fil && compat(filaments, fil).includes(b.printer), b.filament);
      }
    }
  }
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
  // OrcaSlicer 2.5 packs each vendor into a .opc file; only unpacked
  // vendor folders (2.4 and earlier) can be read here
  const root = roots.find((r) => existsSync(`${r}/Snapmaker/machine`));
  if (!root) {
    skip("checked against the installed OrcaSlicer", "no OrcaSlicer install with unpacked profiles found here");
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
      if (p.bambu) continue;      // checked against the BBL profiles above
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
