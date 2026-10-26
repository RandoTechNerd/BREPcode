# Blueprint layout: before and after

The app's 3-view blueprint (`curvedDrawingSVG` in `viewer/curved.js`). People read it, and so does the
AI when it checks a rebuilt model against an input drawing (CADGenBench). Regenerate the shots with
`node bench/blueprint-shots/render.mjs <suffix>`.

| part | before | after |
|---|---|---|
| octagonal flange like CADGenBench sample 121 (278.6 x 278.6 x 65) | `flange-before.png` | `flange-after.png` |
| tall jar with a neck (80 x 80 x 185) | `jar-before.png` | `jar-after.png` |

## What was wrong

- The isometric shared the sheet's spare corner and its size depended on the other views, so on some
  parts it came out tiny. Its three dimensions ran along the projected axes, crossing its own outline,
  and its label sat on the picture and on those dimensions.
- Labels sat at fixed offsets with nothing checking them against each other or against the geometry.
- Every axis was dimensioned three times (two ortho views plus the iso).
- "TOP" was replicad's `"top"` view, which looks up from below, so it was really a bottom view (hidden
  hub drawn dashed). "RIGHT" was the mirror of the third-angle right view.

## What it does now

- Fixed grid: TOP over FRONT in column A, the isometric over RIGHT in column B, title block in its own
  row. TOP, FRONT and RIGHT share one scale (title block). The isometric gets its own cell (at least
  280 px, and at least 60% of column A's width) and is scaled to fill 94% of it. Its scale is printed
  in its label: `ISOMETRIC (SCALE n)`.
- Views are now `"bottom"` (true plan), `"front"` and `"left"` (true third-angle right). The isometric
  is seen from [100,-100,100], matching the CADGenBench input drawings.
- Each axis is dimensioned once, outside the views: X under FRONT, Z left of FRONT, Y left of TOP.
  The isometric has no dimensions.
- Labels sit centred below each view, in a reserved band.
- Collision pass: every text gets a box. A text goes only where it overlaps no other text, no view and
  no other dimension's lines. If its spot is taken, a label is nudged; a dimension tries a few
  positions and is dropped whole if none is clear.
- Thin views: every grid cell is at least 28 px, so labels and dimensions keep their room. A dimension
  too short to hold its number along it puts the number level, beside it, with the arrows outside.
  A RIGHT view under 4 px thick (a line, both extents already on TOP and FRONT) is left out, and the
  isometric takes the whole column instead.
- The sheet is sized from everything drawn: content stays 28 px inside the border, clear of the
  title block.
- The SVG has `<metadata id="brepcode-layout">` holding every text, view and dimension box in sheet
  coordinates, so tests (and tools) can check the layout instead of guessing it.

## Tests

`test/blueprint.js` checks a sample-121-style octagonal flange, a flat 200 x 120 x 2 plate, a tall jar,
a cube, a needle and a 300 x 20 x 3 strip for:

- no text overlapping other text
- no text on a view or another dimension
- no dimension line crossing a view
- everything inside the border with padding and clear of the title block
- iso cell fill of at least 60%, at its own scale
- every overall size dimensioned

`test/curvedstep.js` now expects exactly one dimension per axis.
