// Ctrl+Z, and the two things it has to put back.
//
// Shave and Simplify are both destructive edits to a PREVIEW — the one kind of
// model with no code behind it to rebuild from. If the triangles are gone and
// nothing kept a copy, they are gone for good, so both have to hand a copy to
// the undo stack before they touch anything.
//
// Simplify matters more than shave here, and for a reason worth stating: a
// shave either works or declines, but a Simplify always "works" — it is the
// NUMBER that can be wrong. 2k on a rabbit is a potato. Being unable to go
// back and try 10k means re-importing a 12MB STL and re-cutting every whisker.
//
// The other half is that the binding has to actually fire. It did not: the
// shortcut sat below an early return that bailed on any modifier key, so the
// undo the shave hint had been promising all along could never run.

import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

const HTML = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");

console.log("\nthe shortcut can actually be reached\n");
{
  // The regression this guards is subtle in the worst way: the code was there,
  // it read correctly, and it was dead. Anything that wants a modifier has to
  // be tested BEFORE the handler throws modified keys away.
  const body = HTML.slice(HTML.indexOf('document.addEventListener("keydown"'));
  const zAt = body.indexOf('=== "z"');
  const bailAt = body.indexOf("if (e.ctrlKey || e.metaKey || e.altKey) return;");
  check("Ctrl+Z is handled", zAt > 0);
  check("the modifier bail-out is still there", bailAt > 0);
  check("...and Ctrl+Z is tested BEFORE it, or it never runs",
    zAt > 0 && bailAt > 0 && zAt < bailAt, `z at ${zAt}, bail at ${bailAt}`);
  check("it does not steal Ctrl+Shift+Z or Ctrl+Alt+Z",
    /=== "z"[\s\S]{0,80}|\!e\.altKey && \!e\.shiftKey[\s\S]{0,120}=== "z"/.test(body)
      && /!e\.altKey && !e\.shiftKey\s*$|!e\.altKey && !e\.shiftKey/m.test(body.slice(0, zAt + 40)));
  check("...and it leaves the editor's own undo alone",
    /activeElement/.test(HTML.slice(HTML.indexOf('code.addEventListener("keydown"'), HTML.indexOf('code.addEventListener("keydown"') + 400))
      || /TEXTAREA/.test(body.slice(0, 400)), "typing Ctrl+Z in the code pane must still undo TEXT");
}

console.log("\none stack, so the order is the order things happened\n");
{
  check("entries are tagged rather than assumed", /\{ kind: "shave", mesh, positions/.test(HTML));
  check("...and the undo reads the tag", /if \(last\.kind === "simplify"\) return restoreSimplify\(last\)/.test(HTML));
  check("a shave still restores its own triangles", /applyShaved\(last\.mesh, last\.positions\)/.test(HTML));
  check("the 'still applied' count counts shaves only, not simplifies",
    /shaveUndo\.filter\(\(u\) => u\.kind === "shave"\)\.length/.test(HTML),
    "otherwise the message miscounts once a simplify is on the stack");
}

console.log("\nSimplify hands over a copy before it consumes the preview\n");
{
  check("there is a snapshot", /function snapshotPreview\(\)/.test(HTML));
  const snap = HTML.slice(HTML.indexOf("function snapshotPreview()"), HTML.indexOf("function pushSimplifyUndo"));
  check("...taken from the SCREEN, not from the import",
    /previewGroup\.children\.filter/.test(snap),
    "reading pendingSimplify instead would miss shaves and scaling");
  check("...as a copy, not a live reference", /position\.array\.slice\(0\)/.test(snap),
    "the array is about to be thrown away by the caller");
  check("...with the offset already spent", /off: \[0, 0, 0\]/.test(snap));
  check("...and the code that goes with it", /code: code\.value/.test(snap));
  check("...and which detail was chosen", /target: SIMPLIFY_TARGET/.test(snap));

  check("the snapshot is taken while the preview is still up",
    HTML.indexOf("const back = snapshotPreview();") < HTML.indexOf("await importObjectsAsParts(fileName, slim"),
    "after the import the editor text has already changed");
  check("...and pushed only once the simplify actually worked",
    /clearMeshPreview\(\);\s*\n\s*pushSimplifyUndo\(back\);/.test(HTML),
    "a failed simplify must not leave a phantom undo step");
  check("a failed simplify is inside the catch, so nothing is pushed",
    /catch \(e\) \{[\s\S]{0,400}simplify failed/.test(HTML));
}

console.log("\n...and putting it back leaves a usable screen\n");
{
  const r = HTML.slice(HTML.indexOf("function restoreSimplify(snap)"), HTML.indexOf("function restoreSimplify(snap)") + 1400);
  check("the code comes back first", /code\.value = snap\.code/.test(r));
  check("...and the revert is a step in History too", /pushHistory\(\)/.test(r),
    "the user asked for it to be adjustable there");
  check("the preview is rebuilt", /showMeshPreview\(snap\.objects, snap\.partColours, snap\.off\)/.test(r));
  check("the cached topology is dropped — it belongs to a mesh that is gone",
    /shaveTopoFor = null/.test(r), "stale topology would shave the wrong triangles");
  check("the Simplify offer comes back with it", /offerSimplify\(hint, snap\.fileName/.test(r),
    "otherwise there is no way to run it again at a different number");
  check("the chosen detail is restored", /SIMPLIFY_TARGET = snap\.target/.test(r));
  check("and it says what happened", /setStatus\("ok"/.test(r));
}

console.log("\na visible way back, not only a shortcut\n");
{
  // Ctrl+Z is invisible. The number most likely to be wrong is the one on the
  // FIRST simplify somebody runs, which is the moment they know the shortcut
  // least well.
  check("the finished-simplify line offers an undo button",
    /pick a different detail/.test(HTML));
  check("...which explains itself on hover", /Put the \$\{\(back\.totalTris/.test(HTML));
  check("...and does not leave a duplicate entry on the stack",
    /const at = shaveUndo\.indexOf\(back\);\s*\n\s*if \(at >= 0\) shaveUndo\.splice\(at, 1\);/.test(HTML));
}

console.log("\nthe shortcut has to be REACHABLE, not merely bound\n");
{
  // Found by driving the real app: writing the new code leaves the caret in
  // the textarea, and the handler correctly refuses to touch a keystroke aimed
  // at a text field — so Ctrl+Z straight after a Simplify undid nothing at all.
  // The fix is not to weaken that rule but to step out of the field, at the one
  // moment the undo somebody reaches for is the model rather than the words.
  check("the caret leaves the editor once a simplify lands",
    /if \(document\.activeElement === code\) code\.blur\(\);/.test(HTML));
  check("...only if it was actually in there", /activeElement === code/.test(HTML),
    "blurring unconditionally would steal focus from wherever else it sat");
}

console.log("\nthe count it reports is the count it simplified\n");
{
  // offerSimplify closes over the count the FILE arrived with. Shave whiskers
  // off and that number is stale, so the finished line claimed a reduction
  // from 225k when the mesh on screen was 214k.
  check("the 'from' figure comes off the snapshot, not the import",
    /const from = back\?\.totalTris \?\? totalTris;/.test(HTML));
  check("...and is what the sentence uses", /Simplified <b>\$\{esc\(fileName\)\}<\/b> from \$\{\(from \/ 1000\)/.test(HTML));
}

console.log("\na stale click cannot walk off the end of the mesh\n");
{
  // A live raycast cannot produce an out-of-range face, but a held-over one
  // can, and the trace then threw from inside shave.js — leaving the status
  // stuck on "Tracing the strand..." with nothing to explain it.
  check("the face index is checked against the mesh it will walk",
    /if \(!\(face >= 0 && face < P\.length \/ 9\)\)/.test(HTML));
  check("...and says so rather than throwing",
    /that triangle is no longer in the model/.test(HTML));
}

console.log("\nthe snapshots cannot pile up\n");
{
  // A 255k-triangle preview is ~9MB of Float32. Twenty of those is a tab that
  // dies rather than a tab that can undo twenty times.
  const p = HTML.slice(HTML.indexOf("function pushSimplifyUndo"), HTML.indexOf("function restoreSimplify"));
  check("only the newest simplify snapshot is kept",
    /if \(shaveUndo\[i\]\.kind === "simplify"\) shaveUndo\.splice\(i, 1\)/.test(p));
  check("...and shaves keep their own cap", /if \(shaveUndo\.length > 20\) shaveUndo\.shift\(\)/.test(HTML));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
