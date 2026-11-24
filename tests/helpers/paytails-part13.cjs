// PAY-TAILS Б11.34: the answers of the server for the two screens of part 13/14: «Куда пойдут деньги» of the window «Внести оплату» and the pause closed by a leaving (`days_locked`).
// REAL answers of the server (`tests/fixtures/paytails/part14/`, taken from the tests of the server on its handles, step 8.14.7) stand for every state they cover; the states that
// the server's worlds do not have (a partial payment of one period, a single period paid, all paid, two packages left) are written by hand from the contract («по договору Б11.34», `part13/`).
const fs = require("node:fs");
const path = require("node:path");
const { toshmatovPreview, TOSHMATOV } = require("./stage-numbers.cjs");

const realDir = path.join(__dirname, "..", "fixtures", "paytails", "part14");
const contractDir = path.join(__dirname, "..", "fixtures", "paytails", "part13");
const readReal = (name) => JSON.parse(fs.readFileSync(path.join(realDir, `${name}.json`), "utf8"));
const read = (name) => JSON.parse(fs.readFileSync(path.join(contractDir, `${name}_по_договору_Б11.34.json`), "utf8"));
/** The state -> the real answer of the server (a preview as it came). */
const REAL = {
  owner_example_two_periods: "payment_probe_owner_550000",
  four_periods_fold_advance: "payment_probe_owner_1800000",
  closed_months_gap: "payment_probe_gap_1100000",
  within_term_part_due: "payment_probe_within_term_231000",
  debt_and_due: "payment_probe_debt_and_due_550000",
  packages: "payment_probe_packages_300000",
  packages_advance: "payment_probe_packages_700000",
  personal_periods_dates: "payment_probe_personal_500000",
  personal_month_dates: "payment_probe_personal_month_200000",
  year_and_long_labels: "payment_probe_other_year_1000000",
};
const HAND = ["partial_one_period", "single_closed", "all_paid", "packages_two_left"];
const STATES = [...Object.keys(REAL), ...HAND];
const isReal = (state) => state in REAL;

/** The facts of a state in one shape: `header` (the debt and the sum to pay BEFORE), `amount`, and the fields of `result` the block reads. */
function previewState(state) {
  if (isReal(state)) {
    const d = readReal(REAL[state]);
    return { header: { debt: d.due.debt_amount, due: d.due.due_amount }, amount: d.amount, mode: d.mode, ...d.result };
  }
  return read(`preview_${state}`);
}

const NBSP = "\u00a0";
const money = (value) => `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)}${NBSP}сум`;

/**
 * The preview of the window for a state.  A real state is the real answer as it came (`withResult` false: the same without the amount and the result - what the window asks first).  A hand-written one: the old
 * fields of the walk of 05.11 with the part of the contract laid over `result` AND the header of the window (`due`) rewritten from the numbers of the fixture, so that the header and the rows come from one world
 * (Б11.34 п.7: the debt and the sum to pay before = what the rows pay + what the answer leaves; the numbers of the fixture are checked in the test).
 */
function previewFor(state, withResult = true) {
  if (isReal(state)) {
    const d = readReal(REAL[state]);
    return withResult ? d : { ...d, amount: null, result: null };
  }
  const { header, amount, mode, ...result } = previewState(state);
  const base = toshmatovPreview(withResult ? amount : null);
  const due = {
    ...base.due, debt_amount: header.debt, due_amount: header.due, unpaid: header.debt + header.due,
    debt_text: header.debt > 0 ? `Долг ${money(header.debt)}` : null, debt_sub: header.debt > 0 ? "просрочено 20 дней" : null,
    due_text: header.due > 0 ? `К оплате ${money(header.due)}` : null, due_sub: header.due > 0 ? "до сегодня" : null,
  };
  const head = { ...base, mode: mode ?? base.mode, due, suggested_amount: header.debt + header.due };
  if (!withResult) return head;
  return { ...head, amount, result: { ...base.result, ...result, unpaid_after: result.debt_amount_after + result.due_after, summary_text: "Погасит долг 0 сум (старая фраза: окно её не показывает)" } };
}

const isDry = (request) => /dry_run=true/.test(request.query);
/** The server of the window for one state (`null`: the old answer without the new fields; `{ error }`: the preview fails). */
function paymentServer(state, extra = {}) {
  return async (request) => {
    if (request.method === "GET" && request.path === "/auth/org/memberships/m1/payments/preview") {
      if (extra.error) return { status: 500, json: { detail: "boom" } };
      if (state === null) return { json: toshmatovPreview(Number(/amount=(\d+)/.exec(request.query)?.[1]) || null) };
      return { json: /amount=\d+/.test(request.query) ? previewFor(state) : previewFor(state, false) };
    }
    return null;
  };
}

module.exports = { STATES, REAL, isReal, previewState, previewFor, paymentServer, read, readReal, TOSHMATOV, isDry, money };
