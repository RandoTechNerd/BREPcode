// Catalog category: storage. One import per family file in this folder; specs that
// only this category's families use (their real-object sizes) go in SPECS.
// This file belongs to the storage category alone, so parallel work on other
// categories never touches it.

import storageBox from "./storage-box.js";

export const FAMILIES = [storageBox];

export const SPECS = [];
