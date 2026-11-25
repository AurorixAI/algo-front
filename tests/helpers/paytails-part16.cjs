// PAY-TAILS Б11.39 / Б11.40 / Б11.41 / Б11.45 (part 16-18), the window «Пауза ученика»: the REAL answers of the server (`tests/fixtures/paytails/part16/pause_probe_*.json`, `pauses_list_mixed.json`: byte
// copies of `paytails-r7/answers/`, head of the server 6ee236c) and a small server of the window.  NOTHING in an answer is moved (lesson 178): the page clock stands on the working day of the WORLD the answer
// was taken in (24.11.2026; 02.12.2026 for the «_0212» ones and the backdated month start) and `day(n)` counts from that day; `contract` returns the answer exactly as the server wrote it.
const fs = require("node:fs");
const path = require("node:path");
const F = require("./money2-fixture.cjs");

const dir = path.join(__dirname, "..", "fixtures", "paytails", "part16");
const FIXTURE_DAY = "2026-11-24";
/** The working day of the world an answer was taken in (the server's probes: 24.11, the worlds of Б11.43 - 02.12). */
const worldDay = (name) => (/_0212$|month_start$/.test(name) ? "2026-12-02" : FIXTURE_DAY);
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const diffDays = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
// the day of the world of the test that runs now: `setWorld` (the tests of a world of 02.12) and the reset before every test are in the test file; `open` puts the page clock on it
let world = FIXTURE_DAY;
const setWorld = (iso) => { world = iso; };
const currentWorld = () => world;
const day = (shift) => addDays(world, shift);
const dmy = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const dm = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

/** The answer `name` exactly as the server wrote it. */
const contract = (name) => JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8"));
/** The pause of an answer as it stood BEFORE the action (a taking off writes `voided_at`): the card the window showed when the person pressed the button. */
const pauseBefore = (name) => ({ ...contract(name).pause, voided_at: null, void_reason: null });
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

module.exports = { contract, worldDay, setWorld, currentWorld, pauseBefore, FIXTURE_DAY, pauseOf, pauseServer, day, dmy, dm, addDays, diffDays };
