// Catalog category: desk. One import per family file in this folder; specs that
// only this category's families use (their real-object sizes) go in SPECS.
// This file belongs to the desk category alone, so parallel work on other
// categories never touches it.

import phoneStand from "./phone-stand.js";
import headphoneHanger from "./headphone-hanger.js";
import penCup from "./pen-cup.js";

export const FAMILIES = [phoneStand, headphoneHanger, penCup];

export const SPECS = [];
