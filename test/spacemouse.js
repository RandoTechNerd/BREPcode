// 3D mouse (viewer/spacemouse.js): the two report dialects, the buttons, the
// dead zone, and which way each axis moves the view.
import { parseReport, frameMove, VENDORS } from "../viewer/spacemouse.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};
const dv = (axes) => { const b = new DataView(new ArrayBuffer(axes.length * 2)); axes.forEach((v, i) => b.setInt16(i * 2, v, true)); return b; };

check("3Dconnexion and Logitech vendor ids", VENDORS.includes(0x256f) && VENDORS.includes(0x046d));
const six = parseReport(1, dv([350, -175, 0, 0, 350, -350]));
check("newer units: all six axes in report 1", JSON.stringify(six) === JSON.stringify({ t: [1, -0.5, 0], r: [0, 1, -1] }), JSON.stringify(six));
check("older units: translation in report 1", JSON.stringify(parseReport(1, dv([0, 175, 0]))) === JSON.stringify({ t: [0, 0.5, 0] }));
check("older units: rotation in report 2", JSON.stringify(parseReport(2, dv([0, 0, 350]))) === JSON.stringify({ r: [0, 0, 1] }));
check("full deflection is clamped to 1", parseReport(2, dv([900, -900, 0])).r[0] === 1);
check("buttons in report 3", parseReport(3, new DataView(new Uint8Array([2, 0]).buffer)).buttons === 2);
check("an unknown report is ignored", parseReport(7, dv([1, 2, 3])) === null);
const still = frameMove([0.03, -0.04, 0.02], [0.05, 0, -0.03], 0.016);
check("the cap at rest moves nothing", !still.pan[0] && !still.pan[1] && !still.zoom && !still.yaw && !still.pitch, JSON.stringify(still));
const m = frameMove([1, 1, -1], [0, 0, 1], 0.016);
check("cap right pans right, cap up pans up", m.pan[0] > 0 && m.pan[1] > 0);
check("pulling the cap zooms in", m.zoom > 0);
check("a twist turns the view", m.yaw !== 0);
check("speed scales every move", frameMove([1, 0, 0], [0, 0, 0], 0.016, { speed: 2 }).pan[0] === 2 * m.pan[0]);
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
