// Adapter disc: two bolt circles, a central locating spigot (boss) and a through bore.
import { cylinder } from "brepscript";
const D = 120, T = 12;
const ring = (n, pcd, z, extra) => Array.from({ length: n }, (_, i) => {
  const a = ((i * 360) / n + (extra.rot ?? 0)) * Math.PI / 180;
  return { kind: "hole", at: [pcd / 2 * Math.cos(a), pcd / 2 * Math.sin(a), z], dir: [0, 0, 1], depth: T, through: true, noPos: true, ...extra.f };
});
export default {
  title: "ADAPTER DISC",
  body: () => cylinder({ d: D, h: T, $fn: 128 }),
  features: [
    ...ring(4, 100, T, { f: { d: 9 } }),
    ...ring(6, 70, T, { rot: 30, f: { d: 6.6, cbore: { d: 11, depth: 6.5 }, ctx: 2 } }),
    { kind: "boss", at: [0, 0, T], dir: [0, 0, 1], d: 50, h: 6, ctx: 3 },
    { kind: "hole", at: [0, 0, T + 6], dir: [0, 0, 1], d: 30, depth: T + 6, through: true, ctx: 4 },
  ],
  leaders: [
    { view: "top", at: [50 * 0.707, -50 * 0.707, T], text: ["4X ON Ø100 PCD"], dx: 140, dy: 120 },
    { view: "top", at: [-35 * 0.5, -35 * 0.866, T], text: ["6X ON Ø70 PCD, 30° OFFSET"], dx: -60, dy: 200 },
  ],
};
