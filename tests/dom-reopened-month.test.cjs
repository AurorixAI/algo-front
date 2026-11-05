// «Деньги-1», повторный обход stage 05.11, round 3: a REOPENED month whose sheet did not change since the saving (the lessons were put back as they were) is closed again by a save -
// the sheet page has its button then too, and after the save the month says «Месяц закрыт».  The REAL page and hooks in a real DOM; the server answers through `route` in its own shapes
// (the sheet, `GET diff`, `GET payroll-periods`, `PATCH sheet`).  The server was read: `PATCH … recalculate: true` without changes is taken (`patch_sheet`: only a request with NO change and NO
// recalculation is `NOTHING_TO_CHANGE`) and sets `updated_at` after the reopening, which is what closes the month (`closed_period.state_of_sheet`).
const assert = require("node:assert/strict");
const test = require("node:test");
const { launch, openPage } = require("./helpers/dom-page.cjs");

let browser;
test.before(async () => { browser = await launch(); });
test.after(async () => { await browser.close(); });

const PAYOUT = (extra = {}) => ({ saved_total: 475000, fresh_total: 475000, target: 475000, paid: 0, balance: 475000, state: "unpaid", basis: "saved", changed_by: 0, change_text: null, text: "Не выплачено", items: [], carry_in: 0, carry_used: 0, advance_out: 0, ...extra });
const SHEET = (revision) => ({ id: "s1", saved: true, month: "2026-10", period_start: "2026-10-01", period_end: "2026-10-31", month_open: false, teacher_id: "t1", teacher_name: "Каримова К.", revision,
  percents: { group: "50" }, divisor_default: 12, lines: [], groups: [], total_amount: 475000, counted_total: 38, unpaid_total: 0, pending_excused_total: 0, undecided_total: 0,
  warnings: { open_lessons: null, pending_excused: 0, no_fee: 0, unpaid: 0 }, written_off_total: 0, payout: PAYOUT(), source_fingerprint: "fp-1", stale: false, note: null,
  created_by_name: "Арслан", created_at: "2026-11-03T05:00:00", updated_by_name: "Арслан", updated_at: "2026-11-03T05:00:00" });
const DIFF = { sheet_id: "s1", revision: 2, stale: false, source_fingerprint: "fp-1", saved_total: 475000, fresh_total: 475000, delta_amount: 0, reasons: [], rate_changes: [], lines: [] };
const PERIOD = (state) => ({ month: "2026-10", items: [{ teacherId: "t1", teacherName: "Каримова К.", month: "2026-10", state, closedOn: "2026-11-03", sheetId: "s1", sheetRevision: 2,
  reopened: state === "reopened" ? { at: "2026-11-05T09:00:00", by: "Арслан", reason: "ошибочно отметили урок" } : null }] });

function server(state) {
  return (request) => {
    const { method, path } = request;
    if (method === "GET" && path === "/auth/org/payroll/sheets/s1") return { json: { ...SHEET(state.revision), ...(state.sheet ?? {}) } };
    if (method === "GET" && path === "/auth/org/payroll/sheets/s1/diff") return { json: { ...DIFF, revision: state.revision } };
    if (method === "GET" && path === "/auth/org/payroll-periods") return { json: PERIOD(state.period) };
    if (method === "GET" && path === "/auth/org/payroll/months/2026-10") return { json: { month: "2026-10", period_start: "2026-10-01", period_end: "2026-10-31", month_open: false, divisor: 12, lessons_without_teacher: 0, teachers: [{ teacher_id: "t1", teacher_name: "Каримова К.", lessons_count: 12, lesson_types: [], rates: { group: "50" }, missing_rates: [], sheet: null, warnings: { open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 0 } }] } };
    if (method === "GET" && path === "/auth/org/payroll/rates") return { json: { month: "2026-10", items: [{ teacher_id: "t1", rates: { group: { percent: "50", valid_from: "2026-01" } } }] } };
    if (method === "PATCH" && path === "/auth/org/payroll/sheets/s1") {
      state.saved.push(request.body);
      if (state.refuse) return { status: 422, json: { detail: { code: "NOTHING_TO_CHANGE", message: "Нечего менять" } } };
      state.revision += 1;
      state.period = "closed";                      // the save after the reopening is what closes the month (server: updated_at > the reopening)
      return { json: SHEET(state.revision) };
    }
    return null;
  };
}

async function open(state) {
  const run = await openPage(browser, "money.entry.tsx", server(state));
  await run.page.evaluate(() => window.mount("sheetPage", { role: "owner", org_role: "owner" }));
  await run.page.waitForSelector('[aria-label="Итог ведомости"]');   // the chip of a month that is still going is not drawn (UX pack №23: the page says «месяц ещё идёт» once)
  return run;
}
const flat = async (page, selector) => (await page.textContent(selector)).replace(/\s+/g, " ").replace(/ /g, " ");

test("a reopened month, nothing changed (stale=false): the button «Сохранить и закрыть месяц» is there; after the save the month says «Месяц закрыт» and the button is gone", async () => {
  const state = { revision: 2, period: "reopened", saved: [], refuse: false };
  const { page, errors } = await open(state);
  const card = '[aria-label="Итог ведомости"]';
  await page.waitForSelector(`${card} button:has-text("Сохранить и закрыть месяц")`);
  assert.match(await flat(page, '[data-testid="sheet-period"]'), /Месяц переоткрыт/);
  assert.equal(await page.locator('[aria-label="Итог ведомости"] span.bg-emerald-500').count(), 0, "UX pack №23: a reopened month is not «saved and done» - no green dot");
  assert.match(await flat(page, card), /Исправьте уроки и нажмите «Сохранить и закрыть месяц» — месяц закроется снова/);
  assert.equal(await page.locator(`${card} button:has-text("Пересохранить")`).count(), 0, "the word of a changed sheet is not here");
  assert.equal(await page.locator('[data-testid="reopen-month"]').count(), 0, "a month that is open is not reopened again");
  // the diff is read (the save needs the fingerprint of the data the owner looked at): the button is not blocked on it
  await page.click(`${card} button:has-text("Сохранить и закрыть месяц")`);
  await page.waitForSelector('[data-testid="sheet-period"]:has-text("Месяц закрыт")');
  assert.equal(await page.locator('[aria-label="Итог ведомости"] span.bg-emerald-500').count(), 1, "closed again: the green dot is back");
  assert.match(await flat(page, "body"), /Зарплата сохранена, месяц закрыт · версия 3/, "the toast says that the month is closed");
  assert.equal(state.saved.length, 1, "one save");
  assert.equal(state.saved[0].recalculate, true, "the save without changes is a recalculation request: the server takes it (NOTHING_TO_CHANGE is for an empty change)");
  assert.equal(state.saved[0].expected_fingerprint, "fp-1", "the fingerprint of the data the owner looked at");
  assert.equal(state.saved[0].revision, 2);
  assert.equal(await page.locator(`${card} button:has-text("Сохранить и закрыть месяц")`).count(), 0, "closed again: no button");
  assert.match(await flat(page, card), /Переоткрыть месяц/, "and the way to reopen it is there again");
  assert.deepEqual(errors.filter((text) => !/404|Failed to load resource|409|422|500/.test(text)), []);
  await page.close();
});

test("a closed month has no such button; a month that was never closed too (the buttons of a sheet are as before)", async () => {
  const closed = await open({ revision: 2, period: "closed", saved: [], refuse: false });
  assert.equal(await closed.page.locator('[aria-label="Итог ведомости"] button:has-text("Сохранить и закрыть месяц")').count(), 0);
  assert.equal(await closed.page.locator('[aria-label="Итог ведомости"] button:has-text("Пересохранить")').count(), 0);
  assert.match(await flat(closed.page, '[data-testid="sheet-period"]'), /Месяц закрыт/);
  await closed.page.close();
});

test("a refusal of the server is told in its words, the month stays open and the button stays", async () => {
  const state = { revision: 2, period: "reopened", saved: [], refuse: true };
  const { page } = await open(state);
  await page.click('[aria-label="Итог ведомости"] button:has-text("Сохранить и закрыть месяц")');
  await page.waitForSelector('[role="alert"]');
  assert.match(await flat(page, "body"), /Нечего менять/);
  assert.equal(await page.locator('[aria-label="Итог ведомости"] button:has-text("Сохранить и закрыть месяц")').count(), 1);
  assert.match(await flat(page, '[data-testid="sheet-period"]'), /Месяц переоткрыт/);
  await page.close();
});

// ── R2-2а (re-walk of 05.11): the table names itself when it is not the number of the card ─────────────────────────────

// the data moved after the saving: saved 120 834, accrued now 75 834 (the lesson was taken back); the month is open
const MOVED = { month_open: true, stale: true, total_amount: 120834, payout: PAYOUT({ saved_total: 120834, fresh_total: 75834, target: 75834, balance: 75834, basis: "fresh", changed_by: -45000, text: "Месяц открыт: начислено сейчас 75 834, выплат нет, к выплате 75 834" }) };

test("R2-2а: a sheet whose total moved after the saving - above the table «Строки сохранённой ведомости 03.11 — итог 120 834 сум; после «Сохранить новую сумму» таблица покажет текущий расчёт»; the card says the number of now", async () => {
  const { page } = await open({ revision: 2, period: "open", saved: [], refuse: false, sheet: MOVED });
  await page.waitForSelector('[data-testid="saved-table-note"]');
  assert.equal(await flat(page, '[data-testid="saved-table-note"]'), "Показана сохранённая версия — 120 834 сум");
  assert.equal(await page.locator('[data-testid="sheet-period"]').count(), 0, "UX pack №23: «Месяц открыт» is not a chip when the page says «месяц ещё идёт»");
  const card = await flat(page, '[aria-label="Итог ведомости"]');
  assert.match(card, /Начислено на сегодня\s*75 834 сум/);
  assert.match(card, /Сохранено 3 ноября: 120 834 сум \(−45 000\)/);
  await page.close();
});

test("R2-2а: in a reopened month the note names the button that renews the table; with nothing changed there is no note", async () => {
  const reopened = await open({ revision: 2, period: "reopened", saved: [], refuse: false, sheet: MOVED });
  await reopened.page.waitForSelector('[data-testid="saved-table-note"]');
  assert.equal(await flat(reopened.page, '[data-testid="saved-table-note"]'), "Показана сохранённая версия — 120 834 сум", "the caption says what the table is; the button that renews it is in the block «Что нужно сделать»");
  await reopened.page.close();
  const same = await open({ revision: 2, period: "reopened", saved: [], refuse: false });
  await same.page.waitForSelector('[aria-label="Итог ведомости"]');
  assert.equal(await same.page.locator('[data-testid="saved-table-note"]').count(), 0, "the fresh total is the saved one: the table needs no explanation");
  await same.page.close();
});

