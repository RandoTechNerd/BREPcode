// Export formats: OBJ conversion and the hand-rolled 3MF package. The 3MF is
// validated by actually unzipping it (jszip) and parsing the mesh XML back.

import { cube, cylinder, difference, translate, build, toSTL } from "../index.js";
import {
  stlToObj, stlTo3MF, colored3MF, splitConnectedParts, layoutOnPlates, partsPlate3MF,
  embedPage, MV_CDN,
} from "../viewer/exporters.js";
import JSZip from "jszip";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

const r = await build(difference(
  cube([20, 20, 8]),
  translate([10, 10, -1], cylinder({ r: 4, h: 10, $fn: 32 })),
));
const stl = toSTL(r, "t");
const facets = (stl.match(/facet normal/g) || []).length;

console.log("\nOBJ\n");
const obj = stlToObj(stl, "part");
const objVerts = (obj.match(/^v /gm) || []).length;
const objFaces = (obj.match(/^f /gm) || []).length;
check("face count matches STL facets", objFaces === facets, `${objFaces} vs ${facets}`);
check("vertices deduplicated", objVerts < facets * 3, `${objVerts} verts for ${facets} facets`);
check("indices are 1-based and in range", (() => {
  for (const m of obj.matchAll(/^f (\d+) (\d+) (\d+)$/gm)) {
    for (const g of [m[1], m[2], m[3]]) {
      const i = +g;
      if (i < 1 || i > objVerts) return false;
    }
  }
  return true;
})());

console.log("\n3MF\n");
const mf = stlTo3MF(stl, "part");
check("starts with zip magic PK", mf[0] === 0x50 && mf[1] === 0x4b);

const zip = await JSZip.loadAsync(mf);   // validates central directory + CRCs
const names = Object.keys(zip.files).sort();
check("package structure", JSON.stringify(names) ===
  JSON.stringify(["3D/3dmodel.model", "[Content_Types].xml", "_rels/.rels"]), names.join(", "));

const model = await zip.file("3D/3dmodel.model").async("string");
const triCount = (model.match(/<triangle /g) || []).length;
const vertCount = (model.match(/<vertex /g) || []).length;
check("model XML declares millimetres", model.includes('unit="millimeter"'));
check("triangle count matches STL", triCount === facets, `${triCount} vs ${facets}`);
check("vertex count matches OBJ dedupe", vertCount === objVerts, `${vertCount} vs ${objVerts}`);
check("triangle indices in range", (() => {
  for (const m of model.matchAll(/v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)) {
    for (const g of [m[1], m[2], m[3]]) if (+g >= vertCount) return false;
  }
  return true;
})());
check("rels points at the model", (await zip.file("_rels/.rels").async("string")).includes("/3D/3dmodel.model"));

// ---- where the part lands on the plate --------------------------------
//
// A slicer's plate origin is its FRONT-LEFT corner, and models here are built
// around 0,0 — so a 3MF written as-modelled opens in the corner with half the
// part off the bed. That is what a user hit with a four-colour Benchy in Orca.
console.log("\n3MF plate placement\n");

const boundsOfModel = (xml) => {
  const b = { x: [Infinity, -Infinity], y: [Infinity, -Infinity], z: [Infinity, -Infinity] };
  for (const m of xml.matchAll(/<vertex x="([-\d.eE]+)" y="([-\d.eE]+)" z="([-\d.eE]+)"\/>/g)) {
    const v = { x: +m[1], y: +m[2], z: +m[3] };
    for (const a of ["x", "y", "z"]) {
      b[a][0] = Math.min(b[a][0], v[a]);
      b[a][1] = Math.max(b[a][1], v[a]);
    }
  }
  return {
    centre: ["x", "y", "z"].map((a) => +((b[a][0] + b[a][1]) / 2).toFixed(3)),
    size: ["x", "y", "z"].map((a) => +(b[a][1] - b[a][0]).toFixed(3)),
    minZ: +b.z[0].toFixed(3),
  };
};
const modelOf = async (bytes) =>
  (await JSZip.loadAsync(bytes)).file("3D/3dmodel.model").async("string");

const placed = boundsOfModel(await modelOf(stlTo3MF(stl, "part")));
check("centred on a 256 × 256 plate by default",
  placed.centre[0] === 128 && placed.centre[1] === 128, placed.centre.join(", "));
check("...standing ON the bed, not through it", placed.minZ === 0, String(placed.minZ));
check("...with the geometry itself untouched",
  placed.size.join(",") === "20,20,8", placed.size.join(", "));

const mini = boundsOfModel(await modelOf(stlTo3MF(stl, "part", { plate: { x: 180, y: 180 } })));
check("a smaller plate centres on ITS middle",
  mini.centre[0] === 90 && mini.centre[1] === 90, mini.centre.join(", "));

const asIs = boundsOfModel(await modelOf(stlTo3MF(stl, "part", { plate: null })));
check("plate: null keeps the model's own coordinates",
  asIs.centre[0] === 10 && asIs.centre[1] === 10, asIs.centre.join(", "));

// A multi-colour model must move as ONE assembly: centring each colour on its
// own middle would take the model apart.
const twoParts = [
  { color: "#c0392b", verts: [[0, 0, 0], [10, 0, 0], [0, 10, 0], [0, 0, 5]],
    tris: [[0, 1, 2], [0, 1, 3], [1, 2, 3], [0, 2, 3]] },
  { color: "#1e2a78", verts: [[20, 0, 0], [30, 0, 0], [20, 10, 0], [20, 0, 5]],
    tris: [[0, 1, 2], [0, 1, 3], [1, 2, 3], [0, 2, 3]] },
];
const colour = boundsOfModel(await modelOf(colored3MF(twoParts, "part")));
check("a colour 3MF centres the whole assembly",
  colour.centre[0] === 128 && colour.centre[1] === 128, colour.centre.join(", "));
check("...without pulling its parts apart",
  colour.size.join(",") === "30,10,5", colour.size.join(", "));

// ---- parts laid out on plates -----------------------------------------
//
// "Part" is decided by CONNECTIVITY: a two-colour piece whose colours share
// vertices is one part; two pieces of the same colour are two. The laid-out
// export then packs every part side by side on the bed, each on z=0.
console.log("\n3MF parts laid out\n");

// a closed-ish tetra soup at an offset, in a colour
const tetra = (ox, oy, oz, color) => ({
  color,
  verts: [[ox, oy, oz], [ox + 10, oy, oz], [ox, oy + 10, oz], [ox, oy, oz + 6]],
  tris: [[0, 2, 1], [0, 1, 3], [1, 2, 3], [0, 3, 2]],
});
{
  // same colour, far apart -> 2 parts; two colours SHARING vertices -> 1 part
  const separate = splitConnectedParts([tetra(0, 0, 0, "#aa0000"), tetra(60, 0, 0, "#aa0000")]);
  check("two islands of one colour are two parts", separate.length === 2, String(separate.length));
  const shared = splitConnectedParts([
    tetra(0, 0, 0, "#aa0000"),
    { color: "#0000aa", verts: [[10, 0, 0], [0, 10, 0], [0, 0, 6], [8, 8, 8]],
      tris: [[0, 1, 2], [0, 1, 3], [1, 2, 3], [0, 2, 3]] },   // reuses the tetra's corners
  ]);
  check("two colours sharing vertices stay ONE part", shared.length === 1, String(shared.length));
  check("...and that part keeps both colours",
    shared[0]?.groups.length === 2, String(shared[0]?.groups.length));
}
{
  // an assembly: a lid FLOATING ABOVE a base, same x/y — assembled they overlap
  // in plan view, laid out they must sit apart, both ON the bed
  const base = tetra(0, 0, 0, "#aa0000");
  const lid = tetra(0, 0, 30, "#0000aa");
  const files = partsPlate3MF([base, lid], "jar", { plate: { x: 200, y: 200 } });
  check("one plate is enough for two small parts", files.length === 1, String(files.length));
  check("...reporting both parts", files[0].parts === 2, String(files[0]?.parts));
  const xml = await modelOf(files[0].bytes);
  const b = boundsOfModel(xml);
  check("everything stands on the bed (the floating lid came down)", b.minZ === 0, String(b.minZ));
  check("the layout fits the plate",
    b.centre[0] > 0 && b.centre[0] < 200 && b.size[0] <= 200 && b.size[1] <= 200,
    `centre ${b.centre.join(",")} size ${b.size.join(",")}`);
  check("parts are separate build items", (xml.match(/<item /g) || []).length === 2);
  check("each part is its own object with components",
    (xml.match(/<components>/g) || []).length === 2);
  // laid out means NOT overlapping: the two tetras share x 0..10 as modelled,
  // so if the second still overlaps the first the layout did nothing
  const xs = [...xml.matchAll(/<vertex x="([-\d.eE]+)"/g)].map((m) => +m[1]);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  check("the two parts sit apart, not on top of each other",
    Math.max(...xs) - Math.min(...xs) > 20, `x span ${(Math.max(...xs) - Math.min(...xs)).toFixed(1)}`);
  void mid;
}
{
  // parts that cannot share a plate spill onto plate 2, as separate files
  const big = (ox) => tetra(ox, 0, 0, "#00aa00");
  // 150mm footprints on a 200mm plate: one per plate, no two ways about it
  const files = partsPlate3MF(
    [big(0), big(100), big(200)].map((t) => ({ ...t, verts: t.verts.map(([x, y, z]) => [x * 15, y * 15, z]) })),
    "wide", { plate: { x: 200, y: 200 }, gap: 8 });
  check("oversized batch spills onto more plates", files.length > 1, String(files.length));
  check("...with numbered suffixes", files[0].suffix === "-plate1" && files[1].suffix === "-plate2",
    files.map((f) => f.suffix).join(" "));
  const total = files.reduce((n, f) => n + f.parts, 0);
  check("...and no part is lost in the split", total === 3, String(total));
}

console.log("\nthe shared page is a way IN, not a dead end\n");
{
  // The page someone is actually handed. Two things about it are easy to get
  // quietly wrong: it shows nothing for seconds while megabytes of base64 GLB
  // decode, and it offers no route back to the source.
  const GLB = "R0lGODlhAQABAAAAACw=";        // stand-in; the builder never parses it
  const look = { bg: "#101820", exposure: 1.1, shadow: 0.8 };

  const bare = embedPage({ glbBase64: GLB, title: "bracket", look });
  check("it is a whole document", bare.trim().startsWith("<!doctype html>"));
  check("the model is inlined, so the file stands alone",
    bare.includes("data:model/gltf-binary;base64," + GLB));
  check("the viewer script is the pinned model-viewer", bare.includes(MV_CDN));
  check("the editor lighting travels with it",
    bare.includes('exposure="1.1"') && bare.includes('shadow-intensity="0.8"')
      && bare.includes("#101820"));
  check("it credits BREPcode", /brepcode\.com/.test(bare));

  // Without a poster there is nothing to reveal, so the lazy attributes must
  // NOT be claimed — in the markup they would simply be untrue.
  check("no poster => no reveal attributes",
    !bare.includes("poster=") && !bare.includes('reveal="auto"'));

  const full = embedPage({
    glbBase64: GLB, title: "bracket", look,
    poster: "data:image/jpeg;base64,AAAA",
    editUrl: "https://brepcode.com/#m=abc-123",
  });
  check("a poster is shown first", full.includes('poster="data:image/jpeg;base64,AAAA"'));
  check("...and the model is swapped in as soon as it is ready", full.includes('reveal="auto"'));
  check("...starting that load AT ONCE, not on scroll", full.includes('loading="eager"'));
  check("the edit link is offered", full.includes("https://brepcode.com/#m=abc-123"));
  check("...and says what it does", /Edit the code/.test(full));

  // No link beats a broken one: when the model will not fit in a URL the
  // caller passes nothing, and the button must simply not appear.
  check("no edit url => no button", !/Edit the code/.test(bare));

  // The title is a filename a person typed, and the url is built from it.
  const nasty = embedPage({ glbBase64: GLB, title: "</title><script>x</script>" });
  check("the title cannot break out of the document",
    !nasty.includes("<script>x</script>") && nasty.includes("&lt;/title&gt;"));
  const nastyUrl = embedPage({ glbBase64: GLB, title: "t", editUrl: 'https://x/"onmouseover="y' });
  check("...nor can the edit url break out of its attribute",
    !nastyUrl.includes('"onmouseover="y'));

  let threw = "";
  try { embedPage({ title: "no model" }); } catch (e) { threw = e.message; }
  check("a page with no model is refused, by name", /base64 GLB/.test(threw), threw);
}

// ---- a shared link has to be openable by someone ELSE ---------------------
//
// The desktop app serves itself over a private app:// scheme (file:// gives ES
// modules an opaque origin, so app:// is the fix for that — see
// desktop/main.cjs). location.origin there is "app://bundle", so a share link
// built from the current origin came out as app://bundle/index.html#m=... —
// a URL only that one exe can resolve. Reported as "the URL doesn't work in
// the exe, but it's the same zip as the site": the model in the fragment was
// always fine, it was the address in front of it that nobody could open.
{
  const HTML = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
  console.log("\na share link points somewhere a stranger can open\n");

  check("the app knows its public home",
    /\|\| "https:\/\/brepcode\.com\/brep\/index\.html";/.test(HTML));
  check("...and only trusts the current origin on http(s)",
    /\/\^https\?:\$\/\.test\(location\.protocol\)/.test(HTML));
  check("the share link is built from it", /const url = shareBase\(\) \+ frag;/.test(HTML));
  check("...and so is the published page's edit link",
    /if \(frag\) editUrl = shareBase\(\) \+ frag;/.test(HTML));
  check("no share URL is still built from the raw origin",
    !/const url = location\.origin \+ location\.pathname \+ frag;/.test(HTML));
  // The embed page is hosted on someone else's site, so ITS edit link must be
  // absolute and public — never this origin, not even in a browser.
  check("the embed page links to the public site, not wherever it was made",
    /embedEdit = PUBLIC_SITE \+ frag;/.test(HTML));
  check("...and the public site is the page that READS the fragment, not the root",
    /"https:\/\/brepcode\.com\/brep\/index\.html"/.test(HTML));
  check("...overridable by the deployment without a rebuild",
    /window\.__BREPCODE_PUBLIC_URL/.test(HTML));

  // The predicate itself, against every scheme this app actually runs under.
  // The app lives at /brep/index.html. A link to the domain root opens a page
  // that never reads the fragment — which is why an exe-made link "did not
  // work" even after it stopped emitting app:// URLs.
  const SITE = "https://brepcode.com/brep/index.html";
  const shareBase = (protocol, origin, pathname) =>
    (/^https?:$/.test(protocol) ? origin + pathname : SITE);
  for (const [proto, origin, path, want, why] of [
    ["https:", "https://brepcode.com", "/", "https://brepcode.com/", "the live site"],
    ["http:", "http://localhost:5320", "/viewer/index.html",
      "http://localhost:5320/viewer/index.html", "a local dev server"],
    ["app:", "app://bundle", "/index.html", SITE, "the desktop exe"],
    ["app:", "app://bundle", "/", SITE, "the exe, however it addresses itself"],
    ["file:", "file://", "/C:/x/index.html", SITE, "opened straight off disk"],
  ]) {
    check(`${why} -> ${want}`, shareBase(proto, origin, path) === want,
      shareBase(proto, origin, path));
  }

  // Publishing without a GLB gives a page showing a PHOTOGRAPH of the model
  // rather than the model. That is allowed — a still page beats no page — but
  // it must not happen silently, which is how "the published page is just an
  // ugly pic" became a mystery instead of a message.
  check("a failed GLB pack is reported, not swallowed",
    /glbFailed = String\(err\?\.message \|\| err\);/.test(HTML));
  check("...and the user is told the page will be a still",
    /will show the still thumbnail, not a `\s*\+ `model you can spin/.test(HTML));

  // ---- the consolidated list --------------------------------------------
  //
  // Twelve rows became six. Anything that PICKS BETWEEN outputs is a dropdown,
  // because the dialog exports exactly one thing; the single checkbox does not
  // choose between exports, it changes the one output — and says so.
  console.log("\nExport dialog: one row, several files\n");

  const listRows = [...HTML.matchAll(/<button data-fmt="([^"]+)"(?:\s+data-group="([^"]+)")?/g)]
    .map((m) => ({ fmt: m[1], group: m[2] || null }));
  check("the list is down to nine rows (four of them conditional)",
    listRows.length === 9, `${listRows.length}: ${listRows.map((r) => r.fmt).join(", ")}`);
  for (const gone of ["stl", "obj", "3mf-parts", "step-curved", "embed"]) {
    check(`"${gone}" no longer has a row of its own`,
      !listRows.some((r) => r.fmt === gone));
  }
  for (const [fmt, group] of [["3mf", "mesh"], ["step", "step"], ["glb", "glb"]]) {
    check(`"${fmt}" leads the ${group} group`,
      listRows.some((r) => r.fmt === fmt && r.group === group));
  }

  // The dropdowns must offer exactly the formats the group claims, or a
  // variant becomes unreachable — which is how an export silently disappears.
  const optionsOf = (id) => {
    const block = HTML.match(new RegExp(`<select id="${id}">([\\s\\S]*?)</select>`));
    return block ? [...block[1].matchAll(/value="([^"]+)"/g)].map((m) => m[1]) : [];
  };
  const meshOpts = optionsOf("mesh-variant");
  check("Mesh offers 3MF, laid-out 3MF, STL and OBJ",
    JSON.stringify(meshOpts) === JSON.stringify(["3mf", "3mf-parts", "stl", "obj"]), meshOpts.join(","));
  check("...defaulting to 3MF, which is the one that carries colour",
    meshOpts[0] === "3mf");
  const stepOpts = optionsOf("step-variant");
  check("STEP offers faceted and true-curved",
    JSON.stringify(stepOpts) === JSON.stringify(["step", "step-curved"]), stepOpts.join(","));
  check("...defaulting to faceted, which needs no 11 MB download",
    stepOpts[0] === "step");
  check("the GLB box names the extension it changes the file to",
    /id="glb-wrap"[\s\S]{0,220}<b>\.html<\/b>[\s\S]{0,80}<b>\.glb<\/b>/.test(HTML));

  // Every format the dialog can land on needs an extension, or the filename
  // line has nothing to say and quietly renders blank.
  for (const fmt of ["stl", "obj", "3mf", "3mf-parts", "step", "step-curved", "svg", "glb", "embed"]) {
    check(`"${fmt}" declares the extension it writes`,
      new RegExp(`"?${fmt.replace(/[-]/g, "\\-")}"?: \\{ kind: "[a-z]+", ext: "`).test(HTML));
  }

  // ---- rows that hide must actually collapse -----------------------------
  //
  // An ID selector outranks the browser's own `[hidden] { display: none }`.
  // #publish-row set `display: block` that way and so kept 600px of height on
  // every format that was not Publish, shoving the real options a screenful
  // below the fold of a panel that looked empty. Any row the dialog toggles
  // with .hidden and also styles by ID needs the guard said out loud.
  console.log("\nHidden option rows collapse\n");
  const TOGGLED = ["publish-row", "mesh-variant-row", "step-variant-row", "glb-wrap-row",
    "mf-colour-row", "mf-printer-row", "plate-row", "printer-row", "nozzle-row", "layer-row",
    "walls-row", "infill-row", "pattern-row", "skin-row", "stagger-row", "supports-row",
    "style-row", "angle-row", "gcode-row", "gcode-text-row"];
  for (const id of TOGGLED) {
    const rule = HTML.match(new RegExp(`#${id}\\s*\\{([^}]*)\\}`));
    if (!rule || !/display\s*:/.test(rule[1])) continue;   // no ID display rule, nothing to beat
    check(`#${id} sets display by ID, so it guards [hidden]`,
      new RegExp(`#${id}\\[hidden\\]\\s*\\{[^}]*display\\s*:\\s*none`).test(HTML),
      rule[1].trim());
  }

  // ---- the blueprint button ---------------------------------------------
  console.log("\nBlueprint button\n");
  check("the drawing is built ahead of the click, not during it",
    /bpIdle = setTimeout\(\(\) => \{ buildBlueprint\(\)/.test(HTML));
  check("...but not before the user has ever asked for one (11 MB)",
    /if \(!bpWarm \|\| bpTooHeavy\(\)\) return;/.test(HTML));
  check("pressing it once earns the background rebuilds",
    /localStorage\.setItem\(BP_WARM_KEY, "1"\);/.test(HTML));
  // A popup blocker eats any window opened after an await, so the ordering
  // inside the handler is the whole feature, not a detail. Compare positions
  // rather than matching a span — the code between them is allowed to grow.
  {
    const body = HTML.slice(HTML.indexOf('$("blueprint-btn")?.addEventListener("click"'));
    const opened = body.indexOf('window.open("", "_blank")');
    const firstAwait = body.indexOf("await ");
    check("the tab is opened inside the click, before any await",
      opened > -1 && firstAwait > -1 && opened < firstAwait,
      `open at ${opened}, first await at ${firstAwait}`);
  }
  check("a superseded drawing is revoked, not leaked",
    /URL\.revokeObjectURL\(bp\.url\)/.test(HTML));
  check("the ready dot goes out the moment the source diverges",
    /paintBlueprintBtn\(\);\s*\n\s*scheduleBuild\(\);/.test(HTML));
  check("the exe hands it to the OS, which does have tabs",
    /desktop\?\.openBlueprint/.test(HTML));
  check("a blocked popup falls back to a file, and says so",
    /Your browser blocked the tab/.test(HTML));
  // The pre-build's brakes, found by an orca. The projection runs replicad on
  // the MAIN thread, and an organic hull-chain model turns it into minutes —
  // fired automatically 1.5s after every rebuild, that is an app that freezes
  // every time you type. The kernel build itself was never the problem: it
  // runs in the worker with single-digit-ms stalls.
  check("a heavy model gets no automatic blueprint rebuild",
    /if \(!bpWarm \|\| bpTooHeavy\(\)\) return;/.test(HTML));
  check("...heavy meaning the kernel build itself ran long",
    /lastBuildMs > BP_AUTO_MS/.test(HTML));
  check("one slow projection turns pre-building off for the session",
    /performance\.now\(\) - t0 > BP_SLOW_MS\) bpSlowSession = true;/.test(HTML));
  check("...and the button says the wait now belongs to the click",
    /projects when you click/.test(HTML));

  const BP = readFileSync(new URL("../desktop/blueprint.cjs", import.meta.url), "utf8");
  check("the desktop handler refuses anything that is not an SVG",
    /\^\\s\*<\(\\\?xml\|svg\)\\b/.test(BP));
  check("...and reports openPath's message rather than assuming success",
    /const err = await shell\.openPath\(file\);\s*\n\s*if \(err\)/.test(BP));
  const PRELOAD = readFileSync(new URL("../desktop/preload.cjs", import.meta.url), "utf8");
  check("the bridge exposes it", /openBlueprint: \(name, svg\)/.test(PRELOAD));
  const MAIN = readFileSync(new URL("../desktop/main.cjs", import.meta.url), "utf8");
  check("the main process registers it", /blueprint\.register\(\);/.test(MAIN));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
