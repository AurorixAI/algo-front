// PAY-TAILS Б11.39 / Б11.40 / Б11.41 (part 16-17), the window «Пауза ученика»: the REAL answers of the server step 8.14.10 (`tests/fixtures/paytails/part16/pause_probe_*.json`, `pauses_list_mixed.json`: byte
// copies of `paytails-r7/answers/`) and a small server of the window.  Every answer is written for the working day of ITS world (24.11.2026; 02.12.2026 for the «_0212» ones and the backdated month start);
// `contract` moves the DATES of the pause / of the rows by the distance to today, the TEXT of a row (`label`) and `period_begins` stay as the server wrote them (the screen only reads them); `labels: true` (the pictures) moves them with the dates.
const fs = require("node:fs");
const path = require("node:path");
const F = require("./money2-fixture.cjs");

const dir = path.join(__dirname, "..", "fixtures", "paytails", "part16");
const FIXTURE_DAY = "2026-11-24";
/** The working day of the world an answer was taken in (the server's probes: 24.11, the worlds of Б11.43 - 02.12). */
const worldDay = (name) => (/_0212$|month_start$/.test(name) ? "2026-12-02" : FIXTURE_DAY);
const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const diffDays = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
const day = (shift) => addDays(todayIso(), shift);
const dmy = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const dm = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

function shifted(value, by) {
  if (Array.isArray(value)) return value.map((item) => shifted(item, by));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = (key === "first_day" || key === "last_day") && typeof item === "string" ? addDays(item, by) : shifted(item, by);
    return out;
  }
  return value;
}
/** «24.11–30.11» of the fixture -> the same days moved by `by` (for the pictures only: the server writes the label of the days it counted). */
const relabel = (text, by) => String(text).replace(/(\d\d)\.(\d\d)/g, (_all, d, m) => { const moved = addDays(`2026-${m}-${d}`, by); return `${moved.slice(8, 10)}.${moved.slice(5, 7)}`; });
function relabelled(value, by) {
  if (Array.isArray(value)) return value.map((item) => relabelled(item, by));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === "label" && typeof item === "string" ? relabel(item, by) : key === "period_begins" && typeof item === "string" ? addDays(item, by) : key === "charge_later" || key === "charge_rows" || (item && typeof item === "object") ? relabelled(item, by) : item]));
  return value;
}
/** The contract answer `name` as of today; `labels: true` moves the TEXT of the labels with the dates (the pictures), the tests read the labels as the sample wrote them. */
function contract(name, { labels = false, raw: asIs = false } = {}) {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8"));
  if (asIs) return raw;   // the answer exactly as the server wrote it (the pictures of a world with a fixed working day)
  const by = diffDays(todayIso(), worldDay(name));
  const moved = shifted(raw, by);
  return labels ? relabelled(moved, by) : moved;
}
const pauseOf = (id, first, last, over = {}) => ({ id, membership_id: "m-a", first_day: first, last_day: last, days: diffDays(last, first) + 1, reason: null, created_by_name: null, created_at: null, voided_at: null, void_reason: null, ...over });

/**
 * The server of the window: the list of the pauses of `m-a`; `create` / `end` / `void` are the answers (an object, or a function of the request that returns `{ status, json }`) of the dry run AND the real call.
 * `calls` of the page say what was asked.
 */
function pauseServer({ pauses = [], create, end, void: voidAnswer } = {}) {
  let list = pauses;
  const answer = (spec, request, fallback) => {
    const value = typeof spec === "function" ? spec(request) : spec;
    return value && value.json !== undefined ? value : { json: value ?? fallback };
  };
  const server = F.baseServer((request) => {
    if (request.method === "GET" && request.path === "/auth/org/memberships/m-a/pauses") return { json: typeof list === "function" ? list() : list };
    if (request.method === "POST" && request.path === "/auth/org/memberships/m-a/pauses" && create) return answer(create, request);
    if (request.method === "PATCH" && /^\/auth\/org\/pauses\/[^/]+$/.test(request.path) && end) return answer(end, request);
    if (request.method === "POST" && /^\/auth\/org\/pauses\/[^/]+\/void$/.test(request.path) && voidAnswer) return answer(voidAnswer, request);
    return null;
  });
  server.setPauses = (next) => { list = next; };
  return server;
}

module.exports = { contract, worldDay, pauseOf, pauseServer, day, dmy, dm, todayIso, addDays, diffDays };
