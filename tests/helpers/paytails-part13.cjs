// PAY-TAILS Б11.33: the answers of the server by the CONTRACT (`artifacts/analysis/PAY_TAILS_SPEC.md`, Б11.33), for the two screens of part 13: «Куда пойдут N сум» of the window «Внести оплату» and the pause
// closed by a leaving (`days_locked`).  The files in `tests/fixtures/paytails/part13/` are written by hand from the contract («по договору Б11.33»); when the server sends the real ones they replace them.
const fs = require("node:fs");
const path = require("node:path");
const { toshmatovPreview, TOSHMATOV } = require("./stage-numbers.cjs");

const dir = path.join(__dirname, "..", "fixtures", "paytails", "part13");
const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, `${name}_по_договору_Б11.33.json`), "utf8"));
/** The state names are the files `preview_<state>_по_договору_Б11.33.json`. */
const STATES = ["partial_one_period", "owner_example_two_periods", "four_periods_fold_advance", "within_term_due", "single_closed", "packages", "personal_periods_dates", "year_and_long_labels"];
const previewState = (state) => read(`preview_${state}`);

/** The preview of the window for a state: the old fields of the walk of 05.11 with the part of the contract laid over `result` (what a server that has the fields sends). */
function previewFor(state) {
  const over = previewState(state);
  const base = toshmatovPreview(over.amount);
  const { amount, mode, ...result } = over;
  return { ...base, amount, mode: mode ?? base.mode, result: { ...base.result, ...result, summary_text: "Погасит долг 0 сум (старая фраза: окно её не показывает)" } };
}

const isDry = (request) => /dry_run=true/.test(request.query);
/** The server of the window for one state (`null`: the old answer without the new fields; `{ error }`: the preview fails). */
function paymentServer(state, extra = {}) {
  return async (request) => {
    if (request.method === "GET" && request.path === "/auth/org/memberships/m1/payments/preview") {
      if (extra.error) return { status: 500, json: { detail: "boom" } };
      if (state === null) return { json: toshmatovPreview(Number(/amount=(\d+)/.exec(request.query)?.[1]) || null) };
      return { json: /amount=\d+/.test(request.query) ? previewFor(state) : toshmatovPreview(null) };
    }
    return null;
  };
}

module.exports = { STATES, previewState, previewFor, paymentServer, read, TOSHMATOV, isDry };
