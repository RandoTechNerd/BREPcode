// An 8-bit binary PGM (lib/tiles.py --gray) as { gray, w, h }.
import { readFileSync } from "node:fs";
export function readPGM(path) {
  const b = readFileSync(path);
  let i = 0;
  const tok = () => {
    while (i < b.length) {
      if (b[i] === 35) { while (i < b.length && b[i] !== 10) i++; continue; }   // # comment
      if (b[i] > 32) break;
      i++;
    }
    const s = i;
    while (i < b.length && b[i] > 32) i++;
    return b.toString("latin1", s, i);
  };
  if (tok() !== "P5") throw new Error(`${path}: not a binary PGM`);
  const w = +tok(), h = +tok(), max = +tok();
  i++;
  if (max > 255) throw new Error(`${path}: 16-bit PGM`);
  return { gray: new Uint8Array(b.buffer, b.byteOffset + i, w * h), w, h };
}
