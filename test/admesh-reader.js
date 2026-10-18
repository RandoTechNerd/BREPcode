// A faithful port of how admesh reads an STL: the reader inside PrusaSlicer,
// Bambu Studio, OrcaSlicer and SuperSlicer (libslic3r/admesh/stlinit.cpp,
// stl_open_count_facets + stl_read). Ported rather than approximated, because
// the way it fails is in the details:
//
//   - binary or ASCII is decided by looking for any byte > 127 in the 128
//     bytes after the 80-byte header
//   - an ASCII file's facet count is NOT found by parsing. It counts lines
//     (read 99 chars at a time, like fgets into a 100-byte buffer), skips
//     lines of 4 chars or fewer and lines that START with "solid" or
//     "endsolid", starts the count at 1, and divides by 7
//   - it then reads exactly that many facets, and ONE malformed facet fails
//     the whole file ("Something is syntactically very wrong with this ASCII
//     STL!"), which Bambu Studio reports as a file with no geometry
//   - a binary file must be exactly 84 + 50 * n bytes
//
// So anything after the last endsolid that adds 7 or more counted lines makes
// it go looking for facets that are not there.
//
// Returns { ok, type, facets, error }.
export function admeshRead(input) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = false;
  for (let i = 80; i < Math.min(bytes.length, 80 + 128); i++) if (bytes[i] > 127) { binary = true; break; }
  if (bytes.length < 84 + 50 && binary) return { ok: false, type: "binary", facets: 0, error: "too small" };
  if (binary) {
    const n = new DataView(bytes.buffer, bytes.byteOffset).getUint32(80, true);
    const fromSize = (bytes.length - 84) / 50;
    if (!Number.isInteger(fromSize)) return { ok: false, type: "binary", facets: 0, error: "the file has the wrong size" };
    return { ok: n === fromSize && n > 0, type: "binary", facets: fromSize, error: n === fromSize ? "" : "facet count does not match the size" };
  }
  const text = new TextDecoder().decode(bytes).replace(/\r\n/g, "\n");
  // pass 1: count, the way it does
  let numLines = 1;
  for (const line of text.split("\n")) {
    // fgets(linebuf, 100, fp): up to 99 characters per read, newline included
    const full = line + "\n";
    for (let at = 0; at < full.length; at += 99) {
      const chunk = full.slice(at, at + 99);
      if (chunk.length <= 4) continue;
      if (chunk.startsWith("solid") || chunk.startsWith("endsolid")) continue;
      numLines++;
    }
  }
  const facets = Math.floor(numLines / 7);
  if (facets <= 0) return { ok: false, type: "ascii", facets: 0, error: "no facets" };
  // pass 2: read exactly that many, fscanf style (leading whitespace skipped,
  // literals must match)
  let p = 0;
  const ws = () => { while (p < text.length && /\s/.test(text[p])) p++; };
  const lit = (word) => {
    ws();
    if (text.startsWith(word, p)) { p += word.length; return true; }
    return false;
  };
  const skipLineIf = (word) => {
    const save = p;
    ws();
    if (text.startsWith(word, p)) { const nl = text.indexOf("\n", p); p = nl < 0 ? text.length : nl + 1; return; }
    p = save;
  };
  const num = () => {
    ws();
    const m = /^[^\s]+/.exec(text.slice(p, p + 64));
    if (!m) return null;
    p += m[0].length;
    return Number(m[0]);
  };
  for (let i = 0; i < facets; i++) {
    skipLineIf("endsolid");
    skipLineIf("solid");
    const okNormal = lit("facet") && lit("normal") && [num(), num(), num()].every((v) => v !== null);
    const okLoop = lit("outer") && lit("loop");
    let okVerts = true;
    for (let k = 0; k < 3; k++) {
      if (!lit("vertex")) { okVerts = false; break; }
      const v = [num(), num(), num()];
      if (v.some((x) => x === null || !Number.isFinite(x))) { okVerts = false; break; }
    }
    const okEnd = okVerts && lit("endloop") && lit("endfacet");
    if (!(okNormal && okLoop && okVerts && okEnd)) {
      return { ok: false, type: "ascii", facets, error: `Something is syntactically very wrong with this ASCII STL! (facet ${i + 1} of ${facets})` };
    }
  }
  return { ok: true, type: "ascii", facets, error: "" };
}
