// The words of the menu, read from the constants of the source (not retyped): node loads the TypeScript file as text and takes the two lines.
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "..", "..", "src", "lib", "membership-learning.ts"), "utf8");
const take = (name) => source.match(new RegExp(`export const ${name} = "([^"]+)"`))[1];
module.exports = { PAUSE_MENU_LABEL: take("PAUSE_MENU_LABEL"), END_PAUSE_MENU_LABEL: take("END_PAUSE_MENU_LABEL") };
