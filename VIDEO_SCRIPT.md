# BREPcode launch video — script

*Walkthrough style, ~6–8 minutes. [SCREEN] = what's being recorded, VO = spoken line.
Model builds take 1–20s depending on complexity — cut the dead air, or talk over the spinner.*

---

## COLD OPEN — the hook (0:00)

[SCREEN: blank viewer at BREPcode.com. Type, live:]
```
difference(
  cube([30, 30, 12]),
  translate([15, 15, -1], cylinder({ r: 8, h: 14, $fn: 64 })),
)
```
*(the plate with a hole appears as you finish typing)*

**VO:** "I just typed a 3D model into a browser tab. No install, no account, no
upload — real CAD geometry, built as I type. This is BREPcode. And it gets
weirder — watch this."

[SCREEN: select all, paste an OpenSCAD snippet — braces syntax:]
```
$fn = 64;
difference() {
  cube([30,30,12]);
  translate([15,15,-1]) cylinder(h=14, r=8);
}
```

**VO:** "That's OpenSCAD. Different language. Same model. It just… translates.
JSCAD too — paste a whole module with `require` and `main()`, straight out of
a tutorial or an AI chat, and it runs. Code-CAD, three dialects, one browser tab."

---

## BEAT 1 — but you can also just… grab it (0:45)

[SCREEN: click the plate. Handles appear. Drag the +X square outward — hint
shows "cube width (x): 30 → 38.4". Release. Code updates on screen.]

**VO:** "Here's the part I haven't seen anywhere else. Click the model — it
grows handles. Drag a square, that side moves. And look at the editor: it
didn't just move pixels — **it rewrote the code.** The code is always the
truth; the mouse is just another way of writing it."

[SCREEN: drag a corner ball — box stretches in two axes. Then click the
crosshair toggle, drag again — grows from centre instead.]

**VO:** "Corners stretch. This little crosshair picks whether the pulled side
moves or it grows from the middle. Drag the inside of the hole — it selects
the cylinder that *cut* the hole. The engine remembers which face came from
which feature, even after booleans. That's the B-rep part — more on that in
a second."

[SCREEN: clock icon → Feature history panel; click a row, code highlights.]

**VO:** "Full feature history, every step the kernel took, click any of them
to jump to its line of code."

---

## BEAT 2 — the assistant (2:00)

[SCREEN: chat bubble. Type: "make a box with a cone on top" → bot asks for
sizes → "go ahead" → model appears.]

**VO:** "There's a built-in assistant for the simple stuff — stacks, holes,
brackets, picture frames — it asks follow-up questions like a person would.
Say 'flip it', 'make it smoother', 'move it up 10' — it edits the code."

[SCREEN: ⚙ settings. Paste API key → green ✓ appears → chat says
"Connected — N models available." Type something ambitious.]

**VO:** "And if you drop in your own Gemini or Claude API key, it verifies the
connection, pulls the models *your* key can use, and hands your words to a
real AI that writes BREPcode directly into the editor. That's the unlock."

---

## BEAT 3 — manual fillets: from ugly to beautiful (3:00)

**VO:** "Now the technique video-within-the-video. This engine has no fillet
button — so let me show you how to *write* your fillets. We're going from an
ashtray to something you'd actually print. A coin dish, four steps."

[SCREEN: type step 1 — the ugly version:]
```
// step 1: the ugly ashtray
difference(
  cylinder({ r: 40, h: 16, $fn: 96 }),
  translate([0, 0, 4], cylinder({ r: 34, h: 14, $fn: 96 })),
)
```

**VO:** "Step one. A cylinder minus a cylinder. Functional. Hideous. Every
edge is a knife."

[SCREEN: replace the inner cutter with a sphere:]
```
// step 2: the sphere scoop — one big ball carves an organic bowl
difference(
  cylinder({ r: 40, h: 16, $fn: 96 }),
  translate([0, 0, 66], sphere({ r: 60, $fn: 96 })),
)
```

**VO:** "Step two, trick one: **the sphere scoop**. Don't cut a hole — subtract
one giant ball. The bigger the ball, the shallower and silkier the bowl.
Instant organic curve, one line of code."

[SCREEN: replace the plain cylinder with the rounded puck:]
```
// step 3: the rounded puck — a core, a band, and two donuts
const R = 40, H = 16, rr = 6, FN = 96;
const puck = union(
  cylinder({ r: R - rr, h: H, $fn: FN }),                        // core
  translate([0, 0, rr], cylinder({ r: R, h: H - 2 * rr, $fn: FN })), // wide band
  translate([0, 0, rr], torus({ r: R - rr, tube: rr, $fn: FN })),    // bottom roll
  translate([0, 0, H - rr], torus({ r: R - rr, tube: rr, $fn: FN })),// top roll
);
return difference(puck, translate([0, 0, 66], sphere({ r: 60, $fn: FN })));
```

**VO:** "Step three, trick two: **the rounded puck**. A skinny core, a short
wide band, and two donuts filling the corners. Union them and the outside has
perfect quarter-round fillets — top and bottom. That's a hand-written fillet:
torus radius equals fillet radius."

[SCREEN: add the final line — rim roll. Or click Cheat sheet → "Rounded coin
dish" which is this exact model:]
```
// step 4: the rim roll — a slim donut erases the last sharp edge
const rimR = Math.sqrt(60 * 60 - (60 - 10) ** 2);
return difference(puck, scoop, translate([0, 0, H], torus({ r: rimR, tube: 2, $fn: FN })));
```

**VO:** "Step four, trick three: **the rim roll**. The scoop left one sharp
circle at the rim — so we subtract a thin donut right along that edge, and it
rolls over smooth. Puck, scoop, roll. Three tricks, zero fillet buttons, and
this thing looks injection-moulded. It's in the cheat sheet as 'Rounded coin
dish' if you want to skip the typing."

---

## BEAT 4 — a real part: the LTT screwdriver collar (5:00)

[SCREEN: Cheat sheet → "LTT screwdriver collar (TPU snap-fit)". It builds.
Orbit it. Optionally cut to a printed one snapping onto the actual driver.]

**VO:** "Same tricks, real part: a snap-fit collar for the LTT screwdriver.
Arc-drawn outline with tangent fillets, rounded rims from the torus envelope,
a squeezed bore so it actually grips, and magnet pockets in the flat back.
Print it in TPU, it clicks over the handle's waist. It's a one-click recipe
in the cheat sheet — measure your driver and tune one number."

[SCREEN: ⭳ export menu — STL / OBJ / 3MF / STEP. Click 3MF.]

**VO:** "When you're happy: STL, OBJ, 3MF, or STEP, straight out of the tab."

---

## BEAT 5 — what it's built on (5:45)

[SCREEN: About card (ⓘ), pointing at the credit links.]

**VO:** "Credit where it's massively due: the geometry engine under all of
this is **BREP.io** — an open-source, browser-native CAD kernel by
**@mmiscool**. It's the reason the booleans never fail and the reason clicking
a hole knows which feature cut it: real boundary-representation topology,
named faces and edges that survive every operation, running entirely
client-side. BREPcode is my authoring layer on top — the languages, the
handles, the assistant. The kernel is his, it's brilliant, links below. My
fork's code lands on the RandoTechNerd GitHub soon after beta."

---

## OUTRO (6:15)

[SCREEN: montage — typing, dragging handles, the chatbot building a bracket,
the dish, exports.]

**VO:** "BREPcode.com. Free, in your browser, nothing to install. Type it,
speak it, or grab it with the mouse — it's all the same code underneath.
Discord and everything else below. If you print the coin dish, show me your
worst first attempt — the ugly ashtray deserves love too."

---

## Description-box checklist
- BREPcode.com
- Built on BREP.io by @mmiscool — https://brep.io · https://github.com/mmiscool/BREP
- Discord: https://discord.gg/8fjQHDX8PQ
- Coffee: https://buymeacoffee.com/randotechnerd
- Contact: RandoTechNerd@gmail.com
- Chapters: 0:00 Type it / 0:45 Grab it / 2:00 Ask it / 3:00 Manual fillets /
  5:00 LTT collar / 5:45 Built on BREP.io / 6:15 Outro
