---
tag: looks
title: Materials and lighting — making it look like the thing
match: material, materials, finish, brushed, anodised, anodized, aluminium, aluminum, steel, brass, copper, gold, chrome, matte, glossy, satin, lighting, lit, light it, render, realistic, photoreal, presentation, showroom, studio, dramatic, moody, warm light, cool light, backdrop, background, look, looks, style it, make it look
---

Three levels, and reaching for the wrong one is the usual mistake:

| you want | the call |
|---|---|
| one part a different colour | `colorize("#hex", part)` |
| one part made of something else | `finish("Titanium", screws)` |
| the WHOLE model's material and light | `look({ … })` |

`look()` is the scene — the settings that used to live only in the Material
panel. It changes nothing about the geometry, the export or the print.

## The two halves

```js
// what it is made of
look({ filament: "cc-witchcraft", metal: 80, rough: 25 });

// how it is lit
look({ key: 170, fill: 45, rim: 120, exposure: 112, filmic: true });

return cylinder({ r: 18, h: 44, $fn: 64 });
```

Calls merge, so those two lines together set both. Put them at the top of the
file, before the model, where a reader will find them.

## Materials that read right

| the object is | metal | rough | notes |
|---|---|---|---|
| machined aluminium | 85 | 30 | the default "engineered" look |
| anodised black | 60 | 40 | add `color: "#26262a"` |
| brushed steel | 90 | 45 | rough is what makes it brushed, not polished |
| chrome / mirror | 100 | 5 | needs light to reflect: raise `rim` |
| matte plastic | 5 | 75 | most printed parts, honestly |
| glossy plastic | 5 | 20 | |
| rubber / TPU | 0 | 95 | |
| ceramic | 0 | 35 | |

For a real filament instead, `filament:` takes any spool name (`cc-witchcraft`,
`cc-golddust`, …) and paints the whole model in it — glitter, gradient and all.

## Lighting that reads right

`key` is the main light, `fill` softens the shadow side, `rim` separates the
part from the background, `ambient` lifts everything.

Three that cover almost everything — name them, then apply one:

```js
// strong key, gentle fill, a rim to lift the part off the backdrop
const PRODUCT = { ambient: 45, key: 175, fill: 55, rim: 110, exposure: 108, filmic: true };
// kill the fill and let the rim do the work
const MOODY   = { ambient: 20, key: 200, fill: 10, rim: 160, bg: "#07090e", filmic: true };
// for READING the geometry rather than admiring it
const FLAT    = { ambient: 90, key: 120, fill: 80, rim: 0, filmic: false };

look(PRODUCT);                       // swap in MOODY or FLAT

return sphere({ r: 20, $fn: 48 });
```

`filmic: true` is worth having on for anything shiny — it rolls off highlights
instead of clipping them white.

## The rules

- **Set it once, at the top.** Calls merge and the last wins, so scattering
  `look()` through a file makes the final state hard to read.
- **A metal with no light to catch is just grey.** Raising `metal` without
  raising `rim` (or `key`) usually looks worse, not better.
- **`bg` is yours until you change it.** Setting a background from code marks
  it as deliberate, so the theme stops repainting over it.
- **It is not a colour tool.** One part in a different colour is `colorize()`;
  one part in a different material is `finish()`. `look()` is the room.

## A whole presentation, the pattern

```js
// a torch that looks like an anodised torch
look({ color: "#26262a", metal: 65, rough: 38 });
look({ ambient: 40, key: 180, fill: 50, rim: 130, exposure: 110, filmic: true });

const body = /* … geometry … */ cylinder({ r: 13, h: 73 });

return group(
  body,
  colorize("#eb8c32", translate([0, 0, 74], cylinder({ r: 13.5, h: 4 }))),  // accent
  glow("#ffe9b0", 2.5, translate([0, 0, 85], sphere({ r: 2.8, $fn: 32 }))), // the LED
  glass(0.3, translate([0, 0, 97], cylinder({ r: 15, h: 2 }))),             // the lens
);
```

`look()` does the body and the room; `colorize`/`glow`/`glass` do the parts
that differ from it. That division is the whole idea.
