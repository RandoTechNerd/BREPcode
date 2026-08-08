// The parametric source has to survive the round trip out to a mesh file and
// back. A mesh is a dead end otherwise — "make it 3mm taller" a year after
// exporting means rebuilding the part from scratch.
//
// The thing worth guarding hardest is that embedding the source cannot change
// the GEOMETRY. An STL carrying its own source must still read as exactly the
// same triangles to every other tool, or we have traded a real file for a
// convenience.
import {
  stlWithSource, extractSourceFromStl, stripSourceHeader, stlTo3MF, colored3MF, SOURCE_MARKER, SOURCE_PART,
  parseBcodeFile, HISTORY_KEEP,
} from "../viewer/exporters.js";
import { unzipEntry } from "../viewer/inventory.js";
import * as dsl from "../index.js";
import { build, toSTL } from "../index.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

const CODE = `const EPS = 0.01, w = 60, d = 40, h = 12;
// a plate with a hole — "réglage" and an em dash to prove UTF-8 survives
return difference(
  cube([w, d, h]),
  translate([w / 2, d / 2, -EPS], cylinder({ r: 8, h: h + EPS * 2, $fn: 64 })));`;

const stl = toSTL(await build(dsl.cube([20, 20, 20])), "part");

console.log("\nSTL\n");
{
  const withSrc = stlWithSource(stl, CODE);
  check("the source comes back byte-identical", extractSourceFromStl(withSrc) === CODE.trim(),
    JSON.stringify(extractSourceFromStl(withSrc).slice(0, 60)));
  check("non-ASCII survives", extractSourceFromStl(withSrc).includes("réglage"));

  // The geometry must be untouched: same facet count, same vertices, and the
  // original text still a literal prefix.
  const facets = (s) => (s.match(/facet normal/g) || []).length;
  check("not one triangle added or lost", facets(withSrc) === facets(stl),
    `${facets(stl)} -> ${facets(withSrc)}`);
  check("the original STL is still a prefix of the file", withSrc.startsWith(stl.trimEnd()));
  check("the payload sits after endsolid",
    withSrc.indexOf(SOURCE_MARKER) > withSrc.lastIndexOf("endsolid"));

  // This is the trap the base64 exists for: three.js's ASCII loader scans the
  // WHOLE file for facet blocks instead of stopping at endsolid, so source
  // containing those words would inject phantom triangles on reimport.
  const nasty = 'return text({ text: "facet normal 0 0 0 outer loop vertex 1 2 3" });';
  const withNasty = stlWithSource(stl, nasty);
  check("source containing STL keywords cannot forge triangles",
    facets(withNasty) === facets(stl), `${facets(stl)} -> ${facets(withNasty)}`);
  check("...and still round-trips", extractSourceFromStl(withNasty) === nasty);

  // and the ordinary cases
  check("no source asked for, no change made", stlWithSource(stl, "") === stl);
  check("a plain STL reports no source", extractSourceFromStl(stl) === "");
  check("a truncated payload fails closed rather than throwing",
    extractSourceFromStl(withSrc.slice(0, withSrc.length - 40)) === "");
}

console.log("\n3MF\n");
{
  const zip = stlTo3MF(stl, "part", { source: CODE });
  const bytes = zip;                                  // storedZip hands back a Uint8Array
  const part = new TextDecoder().decode(await unzipEntry(bytes, /BREPcode\.source\.js$/i));
  check("the source part is in the package", part.includes("return difference("));
  check("it round-trips through our own unzip", part.trim().endsWith(CODE.trim().split("\n").pop()));
  // Stripping every `//` line to remove our header also ate the author's own
  // comments — the 3MF round trip came back without them.
  check("stripping the header keeps the author's comments",
    stripSourceHeader(part) === CODE.trim(), JSON.stringify(stripSourceHeader(part).slice(0, 70)));
  check("a headerless part is passed through untouched",
    stripSourceHeader("return cube([1,1,1]);") === "return cube([1,1,1]);");
  check("a comment-first source is not mistaken for a header",
    stripSourceHeader("// my part\n\nreturn cube([1,1,1]);") === "// my part\n\nreturn cube([1,1,1]);");
  check("it is labelled so a human opening the zip knows what it is",
    part.includes(SOURCE_MARKER) && /BREPcode\.com/i.test(part));

  // A part with no declared content type makes the package invalid, and a
  // slicer is entitled to reject the whole file for it.
  const types = new TextDecoder().decode(await unzipEntry(bytes, /Content_Types/i));
  check("the js extension is declared in [Content_Types].xml",
    /Extension="js"/.test(types), types);
  check("the geometry part is still declared", /Extension="model"/.test(types));

  // The model XML must be untouched — the geometry a slicer reads cannot move
  // because we added a sidecar.
  const plain = stlTo3MF(stl, "part");
  const a = new TextDecoder().decode(await unzipEntry(bytes, /\.model$/i));
  const b = new TextDecoder().decode(await unzipEntry(plain, /\.model$/i));
  check("the 3D model XML is identical with and without the source", a === b);
  check("without a source the package gains no extra part",
    !/Extension="js"/.test(new TextDecoder().decode(await unzipEntry(plain, /Content_Types/i))));
  let missing = false;
  try { await unzipEntry(plain, /BREPcode\.source\.js$/i); } catch { missing = true; }
  check("...and no orphan source part is written", missing);

  // the colour exporter is the multi-material path — it must carry it too
  const g = (color, z) => ({
    color,
    verts: [[0, 0, z], [10, 0, z], [0, 10, z]],
    tris: [[0, 1, 2]],
  });
  const cz = colored3MF([g("#d4af37", 0), g("#2b2b2b", 5)], "part", { source: CODE });
  // Two things this has to get right, both found the hard way.
  //
  // 1. WELDING. A colour 3MF exported from BREPcode would not reimport into
  //    BREPcode: "non-manifold". The groups come from the on-screen meshes,
  //    which are one per FACE, so every boundary point arrived several times
  //    and triangles sharing an edge referenced different vertices. The file
  //    that reported it had 6585 vertices for 1719 distinct positions.
  //
  // 2. COLOUR STRUCTURE. OrcaSlicer ignores <m:colorgroup> entirely. Taking
  //    apart a Bambu 4-colour Benchy that does work showed colour is per PART:
  //    an object per colour, an assembly of components, and an extruder number
  //    per part in Metadata/model_settings.config.
  {
    const quad = (z) => ({
      verts: [[0, 0, z], [10, 0, z], [10, 10, z], [0, 10, z]],
      tris: [[0, 1, 2], [0, 2, 3]],          // two triangles sharing an edge
    });
    const gold = { ...quad(0), color: "#D4AF37" };
    const black = { ...quad(5), color: "#2B2B2B" };
    const zip = colored3MF([gold, black], "two-colour");
    const model = new TextDecoder().decode(await unzipEntry(zip, /3dmodel\.model$/i));
    const cfg = new TextDecoder().decode(await unzipEntry(zip, /model_settings\.config$/i));

    // One object per colour, plus the assembly that holds them together.
    check("an object per colour, plus an assembly", (model.match(/<object /g) || []).length === 3,
      String((model.match(/<object /g) || []).length));
    check("the assembly references both", (model.match(/<component /g) || []).length === 2);
    check("...and the build points at the assembly", /<item objectid="4"\/>/.test(model));

    // The part/extruder mapping is what Orca actually reads.
    check("each colour becomes a part", (cfg.match(/<part /g) || []).length === 2);
    check("...with its own extruder", /value="1"/.test(cfg) && /value="2"/.test(cfg));
    check("...and part ids match the component objectids",
      /<part id="2"/.test(cfg) && /<part id="3"/.test(cfg), cfg.match(/<part id="\d+"/g)?.join(" "));

    // Welding happens WITHIN a colour: the shared edge of the two gold
    // triangles must be one edge, not two.
    const firstObj = model.slice(model.indexOf('<object id="2"'), model.indexOf('<object id="3"'));
    const vs = [...firstObj.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)]
      .map((m) => m.slice(1).join(","));
    check("a shared edge inside one colour is welded", vs.length === 4 && new Set(vs).size === 4,
      `${vs.length} written, ${new Set(vs).size} distinct`);
    check("...and both its triangles survive", (firstObj.match(/<triangle /g) || []).length === 2);

    // The spec-correct colorgroup rides along for tools that do read it.
    check("the colorgroup is still there for other tools",
      (model.match(/<m:color /g) || []).length === 2);

    // None of the Bambu project furniture that produced four dialogs in a row.
    check("no BambuStudio project marker", !/BambuStudio/.test(model));
    check("no printer presets shipped", !Object.keys({}).length
      && !/project_settings/.test(model));

    // Welding must not silently drop a face by collapsing it.
    const degenerate = { color: "#FFFFFF", verts: [[0, 0, 0], [0, 0, 0], [1, 1, 1]], tris: [[0, 1, 2]] };
    const y = new TextDecoder().decode(
      await unzipEntry(colored3MF([gold, degenerate], "deg"), /3dmodel\.model$/i));
    check("a triangle collapsed by the weld is dropped, not written broken",
      (y.match(/<triangle /g) || []).length === 2);
  }

  check("the colour 3MF carries the source as well",
    new TextDecoder().decode(await unzipEntry(cz, /BREPcode\.source\.js$/i)).includes("difference("));
}

check("the part name is stable (old files must keep loading)",
  SOURCE_PART === "Metadata/BREPcode.source.js");
check("the marker is stable", SOURCE_MARKER === "BREPCODE-SOURCE-V1");

console.log("\n3MF carries the whole project, not just the source\n");
{
  // A .3mf is a zip, so the part inside it IS a .bcode. Export, hand the file
  // to a slicer, get it back a year later, and the scene and the undo history
  // are still in there — not just the text of the model.
  const SCENE = { material: { color: "#d4af37", metal: 0.4 }, camera: [10, 20, 30], negatives: true };
  const HIST = ["return cube([10,10,10]);", "return cube([20,10,10]);", "return cube([20,20,10]);"];
  const zip = stlTo3MF(stl, "part", { source: CODE, scene: SCENE, history: HIST });
  const part = new TextDecoder().decode(await unzipEntry(zip, /BREPcode\.source\.js$/i));
  const back = parseBcodeFile(part);

  check("the source still comes back exactly", back.source === CODE.trim(),
    JSON.stringify(back.source.slice(0, 50)));
  check("the scene comes back", JSON.stringify(back.scene) === JSON.stringify(SCENE),
    JSON.stringify(back.scene));
  check("the undo history comes back, in order",
    JSON.stringify(back.history) === JSON.stringify(HIST), JSON.stringify(back.history));
  check("and the name the file was saved under", back.name === "part", back.name);

  // THE thing that must not change. A slicer reads 3D/3dmodel.model and nothing
  // else; if carrying a scene moved one vertex we would have traded a real file
  // for a convenience.
  const plain = stlTo3MF(stl, "part");
  const types = new TextDecoder().decode(await unzipEntry(zip, /Content_Types/i));
  check("the geometry a slicer reads is byte-identical",
    new TextDecoder().decode(await unzipEntry(zip, /\.model$/i))
    === new TextDecoder().decode(await unzipEntry(plain, /\.model$/i)));
  check("...and every part still has a declared content type",
    /Extension="model"/.test(types) && /Extension="js"/.test(types), types);

  // Files written before the part carried anything but source must keep
  // opening. parseBcodeFile treats a body with no scene block as exactly that,
  // so this checks we did not start REQUIRING one.
  const old = parseBcodeFile(new TextDecoder().decode(
    await unzipEntry(stlTo3MF(stl, "part", { source: CODE }), /BREPcode\.source\.js$/i)));
  check("a source-only part still parses", old.source === CODE.trim());
  check("...with an empty history rather than a throw",
    Array.isArray(old.history) && old.history.length === 0);
  check("...and no scene", old.scene === null);

  // The colour exporter is a separate writer and has to carry it too.
  const g = (color, z) => ({ color, verts: [[0, 0, z], [10, 0, z], [0, 10, z]], tris: [[0, 1, 2]] });
  const cz = colored3MF([g("#d4af37", 0), g("#2b2b2b", 5)], "part",
    { source: CODE, scene: SCENE, history: HIST });
  const cpart = parseBcodeFile(new TextDecoder().decode(await unzipEntry(cz, /BREPcode\.source\.js$/i)));
  check("the colour 3MF carries the history too",
    JSON.stringify(cpart.history) === JSON.stringify(HIST), JSON.stringify(cpart.history));
  check("...and the scene", JSON.stringify(cpart.scene) === JSON.stringify(SCENE));

  // History is capped so a long session cannot bloat a print file.
  const huge = Array.from({ length: 200 }, (_, i) => `return cube([${i},1,1]);`);
  const capped = parseBcodeFile(new TextDecoder().decode(await unzipEntry(
    stlTo3MF(stl, "part", { source: CODE, history: huge }), /BREPcode\.source\.js$/i)));
  check("a 200-step history is capped, keeping the most recent",
    capped.history.length === HISTORY_KEEP
    && capped.history[capped.history.length - 1] === huge[huge.length - 1],
    `${capped.history.length}`);
}


console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
