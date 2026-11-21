// PAY-TAILS, screens part 3: the REAL answers of the server (tests/fixtures/paytails = auth-service `tests/fixtures/paytails`, made from its own routes; ids and moments are stable).
// The screens are tested on these first; the stub of part 1 / 2 (paytails-fixture.cjs, paytails-fixture2.cjs) stays only where the server cannot give the state (see the list in the report of the pack):
//   - the open rows of the group «Математика 7» next to the closed ones (the server fixture of a group is `bucket=left_open` only);
//   - eight-digit sums / the long name and group (LESSONS 155);
//   - a pack centre («Уроков ещё не было», `starts`), the bar of the drawer for a batch of several students with no `upcoming_total`.
const fs = require("node:fs");
const path = require("node:path");

const DIR = path.join(__dirname, "..", "fixtures", "paytails");
const cache = new Map();
/**
 * TEMPORARY (fixtures of auth 5e93ab6): that head still answers `recalc` of a leaving / an archive / a transfer as a bare list; the next head answers the object `{lines, more}` ALWAYS and the screens read only the object.
 * Until the fixtures are taken again this wraps the list - and does nothing to an answer that already has the object.  Delete it with the next pull of the fixtures.
 */
const FIXTURES_AT = "5e93ab6";
const withObjectRecalc = (value) => {
  if (Array.isArray(value)) return value.map(withObjectRecalc);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = key === "recalc" && Array.isArray(inner) && inner.some((line) => line && typeof line.text === "string" && "label" in line) ? { lines: inner, more: 0 } : withObjectRecalc(inner);
  }
  return out;
};
/** A fresh copy of the server's answer `name` (the file `tests/fixtures/paytails/<name>.json`): a test may change it. */
const fx = (name) => {
  if (!cache.has(name)) cache.set(name, fs.readFileSync(path.join(DIR, `${name}.json`), "utf8"));
  return withObjectRecalc(JSON.parse(cache.get(name)));
};
const NAMES = fs.readdirSync(DIR).filter((file) => file.endsWith(".json")).map((file) => file.slice(0, -5)).sort();

const NB = " ";
/** Plain text of a DOM node: every kind of space is one ordinary space (what a person reads). */
const plain = (text) => String(text ?? "").replace(/[\s  ]+/g, " ").trim();

/** `GET /org/payments/status` for the tab «Аванс» of the centre: the server's pages (`advance_tab_all` / `advance_tab_left_only`), the other tabs - the empty page of the server. */
const advanceStatus = (query) => {
  const params = new URLSearchParams(query);
  if (params.get("bucket") === "advance") return fx(params.get("left_only") === "true" ? "advance_tab_left_only" : "advance_tab_all");
  return { ...fx("status_debtors_closed"), items: [], total: 0, students: 0, amount_total: 0 };
};

module.exports = { FIXTURES_AT, fx, NAMES, NB, plain, advanceStatus };
