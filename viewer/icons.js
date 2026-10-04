// Line icons for the welcome card, the tool cards, the drop menu and the
// FizzCore / fins dialogs. Same drawing rules as the toolbox icons in
// index.html (16-unit grid, 1.3-1.5 stroke, round caps, currentColor), and the
// toolbox's own paths are reused where a tool already had one, so the new
// screens read as part of the same app rather than a different hand.

const P = {
  // reused from the toolbox
  drill: '<circle cx="8" cy="9.5" r="3.4"/><path d="M8 6.1V2.2M6 3.4h4"/>',
  measure: '<path d="M1.6 10.2 10.2 1.6l4.2 4.2-8.6 8.6z"/><path d="M4.4 7.4 5.8 8.8M6.6 5.2 8.7 7.3M8.8 3 10.2 4.4"/>',
  fins: '<path d="M3.5 13.5V3l7.5 10.5z"/><path d="M5.6 5.9h1.6M7 8.4h1.6M8.4 10.9h1.6"/>',
  fizz: '<circle cx="6" cy="9.5" r="3.6"/><circle cx="11.6" cy="5.2" r="2.2"/><circle cx="11.8" cy="11.6" r="1.4"/><circle cx="5.2" cy="3.2" r="1.1"/>',
  texture: '<path d="M2 6l4-4 4 4-4 4z"/><path d="M6 10l4-4 4 4-4 4z"/>',
  emboss: '<rect x="2" y="2" width="12" height="12" rx="1.5"/><circle cx="6" cy="6.4" r="1.5"/><path d="M2 12l3.4-3.4 2.4 2.4 3.4-3.6L14 10.5"/>',
  qr: '<rect x="2" y="2" width="4.5" height="4.5"/><rect x="9.5" y="2" width="4.5" height="4.5"/><rect x="2" y="9.5" width="4.5" height="4.5"/><path d="M9.5 9.5h2v2h-2zM12.5 12.5h1.5v1.5h-1.5"/>',
  datamatrix: '<path d="M2.5 2.5v11h11"/><path d="M5 5h1.6v1.6H5zM8.4 5H10v1.6H8.4zM11.6 5h1.6M5 8.4h1.6V10H5zM10 8.4h1.6V10H10z"/>',
  shelf: '<path d="M1.5 3.5h13M1.5 8h13M1.5 12.5h13"/><rect x="3" y="1.4" width="3.2" height="2.1"/><rect x="8.4" y="1.4" width="4.6" height="2.1"/><rect x="3" y="5.9" width="4.6" height="2.1"/><rect x="9.8" y="5.9" width="3.2" height="2.1"/>',
  gridfinity: '<rect x="1.6" y="1.6" width="5.4" height="5.4" rx="1.2"/><rect x="9" y="1.6" width="5.4" height="5.4" rx="1.2"/><rect x="1.6" y="9" width="5.4" height="5.4" rx="1.2"/><rect x="9" y="9" width="5.4" height="5.4" rx="1.2"/>',
  scale: '<path d="M2.5 9.5V13.5h4"/><path d="M13.5 6.5V2.5h-4"/><path d="M2.8 13.2L13.2 2.8"/>',
  whisker: '<path d="M2.5 11.5c3-.6 6-2.4 8.2-5.2"/><path d="M10.2 2.3l3.3 2.6-2.4 3"/><path d="M3 13.9h10" opacity=".55"/>',
  cutter: '<path d="M8 2.2c1.5 1.4 2.6 1.1 3.6 1.9 1.4 1.1 1.6 3.2.6 4.6-.7 1-.6 1.6-.3 2.6.3 1-.4 2-1.4 2.1-1 .1-1.4-.5-2.5-.5s-1.5.6-2.5.5c-1-.1-1.7-1.1-1.4-2.1.3-1 .4-1.6-.3-2.6C2.8 7.3 3 5.2 4.4 4.1c1-.8 2.1-.5 3.6-1.9z"/>',
  // new, drawn to match
  open: '<path d="M1.8 4.4a1 1 0 0 1 1-1h3.3l1.5 1.7h5.6a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1z"/>',
  chat: '<path d="M2.5 3.2h11v7.3H7.6l-3.1 2.4v-2.4h-2z"/><path d="M5.2 6.2h5.6M5.2 8.1h3.4" opacity=".6"/>',
  part: '<path d="M8 1.8l5.6 3.1v6.2L8 14.2 2.4 11.1V4.9z"/><path d="M2.4 4.9 8 8l5.6-3.1M8 8v6.2"/>',
  example: '<rect x="1.9" y="7.2" width="6.2" height="6.4" rx="1"/><circle cx="11.3" cy="5" r="2.9"/><path d="M10.4 9.6l3.6 4" opacity=".6"/>',
  tour: '<circle cx="8" cy="8" r="6.1"/><path d="M10.6 5.4 9.1 9.1 5.4 10.6 6.9 6.9z"/>',
  hole: '<rect x="2" y="2" width="12" height="12" rx="2"/><circle cx="8" cy="8" r="2.6"/>',
  stretch: '<path d="M1.8 8h12.4M4.5 5.3 1.8 8l2.7 2.7M11.5 5.3 14.2 8l-2.7 2.7"/>',
  narrow: '<path d="M1.8 8h4M14.2 8h-4M3.9 5.7 6.2 8 3.9 10.3M12.1 5.7 9.8 8l2.3 2.3"/><path d="M8 3v10" opacity=".5"/>',
  shaveBottom: '<rect x="3" y="2.5" width="10" height="7.6" rx="1"/><path d="M1.5 13.4h13"/><path d="M5 10.1v1.6M11 10.1v1.6" opacity=".55"/>',
  thicken: '<rect x="2" y="2" width="12" height="12" rx="1"/><rect x="5.2" y="5.2" width="5.6" height="5.6" rx=".5"/>',
  rotate: '<path d="M13 8.2a5 5 0 1 1-1.6-3.8"/><path d="M11.8 1.8v2.9H8.9"/>',
  flip: '<path d="M2 8h12" opacity=".55"/><path d="M5 2.6h6L8 6.1zM5 13.4h6L8 9.9z"/>',
};

const WIDTH = { fizz: 1.3, texture: 1.3, emboss: 1.3, gridfinity: 1.3, qr: 1.4, measure: 1.4, shelf: 1.4, cutter: 1.4 };

/** An inline SVG icon by name; unknown names give an empty string. */
export function icon(name, size = 18) {
  const body = P[name];
  if (!body) return "";
  return `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${WIDTH[name] || 1.5}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const ICON_NAMES = Object.keys(P);
