// Catalog category: wall. One import per family file in this folder; specs that
// only this category's families use (their real-object sizes) go in SPECS.
// This file belongs to the wall category alone, so parallel work on other
// categories never touches it.

import cradleHook from "./cradle-hook.js";
import wallShelf from "./wall-shelf.js";

export const FAMILIES = [cradleHook, wallShelf];

export const SPECS = [];
