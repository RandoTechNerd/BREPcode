// Phones, tablets and e-readers: height x width x thickness in mm, bare
// device, from the makers' published spec sheets. A holder sized off these
// adds its own allowance for a case, because nobody's phone is bare.
//
// `names` are what people type. Normalisation (match.js) splits letters from
// digits and drops punctuation, so "iPhone15 Pro" and "iphone 15 pro" meet,
// and the longest alias that appears wins: "iphone 15 pro max" beats
// "iphone 15".

const phone = (id, names, h, w, t) => ({ id, kind: "phone", names, dims: { h, w, t }, label: names[0] });
const tablet = (id, names, h, w, t) => ({ id, kind: "tablet", names, dims: { h, w, t }, label: names[0] });

export const SPECS = [
  // ---- Apple
  phone("iphone-17-pro-max", ["iPhone 17 Pro Max"], 163.4, 78.0, 8.75),
  phone("iphone-17-pro", ["iPhone 17 Pro"], 150.0, 71.9, 8.75),
  phone("iphone-air", ["iPhone Air"], 156.2, 74.7, 5.64),
  phone("iphone-17", ["iPhone 17"], 149.6, 71.5, 7.95),
  phone("iphone-16-pro-max", ["iPhone 16 Pro Max"], 163.0, 77.6, 8.25),
  phone("iphone-16-pro", ["iPhone 16 Pro"], 149.6, 71.5, 8.25),
  phone("iphone-16-plus", ["iPhone 16 Plus"], 160.9, 77.8, 7.8),
  phone("iphone-16e", ["iPhone 16e"], 146.7, 71.5, 7.8),
  phone("iphone-16", ["iPhone 16"], 147.6, 71.6, 7.8),
  phone("iphone-15-pro-max", ["iPhone 15 Pro Max"], 159.9, 76.7, 8.25),
  phone("iphone-15-pro", ["iPhone 15 Pro"], 146.6, 70.6, 8.25),
  phone("iphone-15-plus", ["iPhone 15 Plus"], 160.9, 77.8, 7.8),
  phone("iphone-15", ["iPhone 15"], 147.6, 71.6, 7.8),
  phone("iphone-14-pro-max", ["iPhone 14 Pro Max"], 160.7, 77.6, 7.85),
  phone("iphone-14-pro", ["iPhone 14 Pro"], 147.5, 71.5, 7.85),
  phone("iphone-14-plus", ["iPhone 14 Plus"], 160.8, 78.1, 7.8),
  phone("iphone-14", ["iPhone 14"], 146.7, 71.5, 7.8),
  phone("iphone-13-pro-max", ["iPhone 13 Pro Max"], 160.8, 78.1, 7.65),
  phone("iphone-13-pro", ["iPhone 13 Pro"], 146.7, 71.5, 7.65),
  phone("iphone-13-mini", ["iPhone 13 mini", "iPhone 12 mini"], 131.5, 64.2, 7.65),
  phone("iphone-13", ["iPhone 13"], 146.7, 71.5, 7.65),
  phone("iphone-12-pro-max", ["iPhone 12 Pro Max"], 160.8, 78.1, 7.4),
  phone("iphone-12", ["iPhone 12", "iPhone 12 Pro"], 146.7, 71.5, 7.4),
  phone("iphone-11-pro-max", ["iPhone 11 Pro Max"], 158.0, 77.8, 8.1),
  phone("iphone-11-pro", ["iPhone 11 Pro"], 144.0, 71.4, 8.1),
  phone("iphone-11", ["iPhone 11", "iPhone XR"], 150.9, 75.7, 8.3),
  phone("iphone-se", ["iPhone SE", "iPhone 8", "iPhone 7"], 138.4, 67.3, 7.3),
  // ---- Google
  phone("pixel-10-pro-xl", ["Pixel 10 Pro XL"], 162.8, 76.6, 8.5),
  phone("pixel-10", ["Pixel 10", "Pixel 10 Pro"], 152.8, 72.0, 8.6),
  phone("pixel-9-pro-xl", ["Pixel 9 Pro XL"], 162.8, 76.6, 8.5),
  phone("pixel-9a", ["Pixel 9a"], 154.7, 73.3, 8.9),
  phone("pixel-9", ["Pixel 9", "Pixel 9 Pro"], 152.8, 72.0, 8.5),
  phone("pixel-8-pro", ["Pixel 8 Pro"], 162.6, 76.5, 8.8),
  phone("pixel-8a", ["Pixel 8a"], 152.1, 72.7, 8.9),
  phone("pixel-8", ["Pixel 8"], 150.5, 70.8, 8.9),
  phone("pixel-7-pro", ["Pixel 7 Pro"], 162.9, 76.6, 8.9),
  phone("pixel-7a", ["Pixel 7a"], 152.4, 72.9, 9.0),
  phone("pixel-7", ["Pixel 7"], 155.6, 73.2, 8.7),
  // ---- Samsung
  phone("galaxy-s25-ultra", ["Galaxy S25 Ultra", "S25 Ultra"], 162.8, 77.6, 8.2),
  phone("galaxy-s25-plus", ["Galaxy S25+", "Galaxy S25 Plus", "S25 Plus"], 158.4, 75.8, 7.3),
  phone("galaxy-s25", ["Galaxy S25", "Samsung S25"], 146.9, 70.5, 7.2),
  phone("galaxy-s24-ultra", ["Galaxy S24 Ultra", "S24 Ultra"], 162.3, 79.0, 8.6),
  phone("galaxy-s24-plus", ["Galaxy S24+", "Galaxy S24 Plus", "S24 Plus"], 158.5, 75.9, 7.7),
  phone("galaxy-s24", ["Galaxy S24", "Samsung S24"], 147.0, 70.6, 7.6),
  phone("galaxy-s23-ultra", ["Galaxy S23 Ultra", "S23 Ultra"], 163.4, 78.1, 8.9),
  phone("galaxy-s23", ["Galaxy S23", "Samsung S23"], 146.3, 70.9, 7.6),
  phone("galaxy-s22-ultra", ["Galaxy S22 Ultra", "S22 Ultra"], 163.3, 77.9, 8.9),
  phone("galaxy-s22", ["Galaxy S22", "Samsung S22"], 146.0, 70.6, 7.6),
  phone("galaxy-a54", ["Galaxy A54"], 158.2, 76.7, 8.2),
  phone("galaxy-a15", ["Galaxy A15"], 160.1, 76.8, 8.4),
  phone("galaxy-z-flip", ["Galaxy Z Flip", "Z Flip"], 85.1, 71.9, 15.1),     // folded
  phone("galaxy-z-fold", ["Galaxy Z Fold", "Z Fold"], 154.9, 67.1, 13.4),    // folded
  // ---- others
  phone("oneplus-12", ["OnePlus 12"], 164.3, 75.8, 9.15),
  phone("nothing-phone-2", ["Nothing Phone 2", "Nothing Phone"], 162.1, 76.4, 8.6),
  // generic sizes for when the model is not in the table
  phone("phone-small", ["small phone", "compact phone"], 135, 66, 8),
  phone("phone-large", ["big phone", "large phone", "phone max", "plus size phone"], 163, 78, 8.6),
  // ...and for a brand with no model number: "an iphone stand", "a stand for
  // my samsung". A typical current phone; the chat still offers to size it
  // to the exact model. Not a bare "phone": that word is the thing itself.
  { ...phone("phone-generic", ["iphone", "an iphone", "android phone", "android", "samsung phone", "samsung", "galaxy phone",
    "pixel phone", "smartphone", "smart phone", "cell phone", "cellphone", "mobile phone", "mobile"], 150, 72, 8.2),
    note: "a typical phone (about 150 x 72 x 8 mm); name the model to size it exactly" },

  // ---- tablets and e-readers
  tablet("ipad-pro-13", ["iPad Pro 13", "iPad Pro 12.9"], 281.6, 215.5, 5.1),
  tablet("ipad-pro-11", ["iPad Pro 11", "iPad Pro"], 249.7, 177.5, 5.3),
  tablet("ipad-air-13", ["iPad Air 13"], 280.6, 214.9, 6.1),
  tablet("ipad-air", ["iPad Air", "iPad Air 11"], 247.6, 178.5, 6.1),
  tablet("ipad-mini", ["iPad mini"], 195.4, 134.8, 6.3),
  tablet("ipad", ["iPad", "iPad 10th gen", "iPad 11th gen"], 248.6, 179.5, 7.0),
  tablet("galaxy-tab-s9", ["Galaxy Tab S9", "Galaxy Tab", "Samsung tablet"], 254.3, 165.8, 5.9),
  { ...tablet("tablet-generic", ["android tablet", "a tablet", "my tablet", "fire tablet", "amazon fire", "kindle fire"], 250, 170, 7.5),
    note: "a typical 10 inch tablet (about 250 x 170 x 7.5 mm); name the model to size it exactly" },
  tablet("kindle-paperwhite", ["Kindle Paperwhite"], 174.2, 124.6, 8.1),
  tablet("kindle", ["Kindle", "e-reader", "ereader"], 157.8, 108.6, 8.0),
  tablet("switch", ["Nintendo Switch", "Switch OLED", "Switch 2"], 102, 242, 13.9),   // landscape: w is the long side
  tablet("steam-deck", ["Steam Deck"], 117, 298, 49),
];
