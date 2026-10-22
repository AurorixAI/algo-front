// Lead review 23.10 (item 4): the «Организация» tab of the settings showed an empty name for an organisation created through the API.
// Cause: the form reads `org` of the auth store, which is filled only by the sign-in response; a session restored from the cookies alone
// (cleared site data, another device, the e2e sign-in) has `org: null`.  The page now reads the organisation once when the store has none.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

test("settings: with no organisation in the store the page loads it (GET /auth/org) and never overwrites one that is there", () => {
  const page = read("src/app/owner/settings/page.tsx");
  assert.match(page, /if \(org\) return;\s*let alive = true;\s*orgApi\.get\(\)\.then\(\(loaded\) => \{\s*if \(alive && loaded\) useAuthStore\.setState\(\(state\) => \(state\.org \? \{\} : \{ org: loaded \}\)\)/);
  assert.match(page, /return \(\) => \{ alive = false; \};\s*\}, \[org\]\);/);
  // the form is filled from `org.name` (the field of the server's OrgInfo), by the same effect as before
  assert.match(page, /const next = \{ name: org\.name \|\| "", city: org\.city \|\| "", phone: org\.phone \|\| "" \};/);
  assert.match(read("src/lib/api.ts"), /get: \(\) => api<OrgInfo>\("\/auth\/org"\)/);
});
