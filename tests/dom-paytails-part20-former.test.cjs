// PAY-TAILS Б11.50 Э7 (part 20), in a real browser: the card of the student -> «История зачислений и переводов» -> «Паузы» at a FORMER stay (left / transferred / archived) opens the window of the pauses with `active = false`.
// The pauses are the REAL objects of the server (tests/fixtures/paytails/part14/pause_closed_by_*.json, pause_without_cut.json); the page clock stands on 24.11.2026 (the world of the answers).
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const { readReal } = require("./helpers/paytails-part13.cjs");
const X = require("./helpers/paydue-fixture.cjs");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const plain = (text) => (text ?? "").replace(/[\s  ]+/g, " ").trim();
const OWNER = { role: "owner", org_role: "owner" };
const ADMIN_MONEY = { role: "admin", org_role: "admin", payments_access: true };
const ADMIN_NO_MONEY = { role: "admin", org_role: "admin", payments_access: false };
const TODAY = "2026-11-24";
const WIDTHS = [[1280, 900], [375, 812]];

const history = (over) => ({ group_id: "gx", group_name: "Алгебра 7", class_level: 7, is_active: false, joined_at: "2026-09-01T07:00:00", left_at: "2026-11-20T07:00:00", periods: [{ joined_at: "2026-09-01T07:00:00", left_at: "2026-11-20T07:00:00" }], membership_id: "mf1", ...over });
const profileOf = (rows) => ({
  student: { id: "st1", org_id: "o", first_name: "Анвар", last_name: "Каримов", full_name: "Анвар Каримов", class_level: 7, group_id: null, display_id: "AL-1", student_phone: null, comment: null, status: "active", created_at: "2026-09-01T08:00:00" },
  group: null, groups: [], group_history: rows, diagnostics: [], exams: [],
});
const serverOf = ({ rows, pauses = {}, void: voidAnswer }) => (request) => {
  if (request.path === "/auth/org/students/st1/profile") return { json: profileOf(rows) };
  if (request.path === "/auth/org/students/st1/memberships") return { json: [] };
  const list = /^\/auth\/org\/memberships\/([^/]+)\/pauses$/.exec(request.path);
  if (list && request.method === "GET") return { json: pauses[list[1]] ?? [] };
  if (request.method === "POST" && /\/void$/.test(request.path) && voidAnswer) return { json: voidAnswer(request) };
  if (request.path === "/auth/org/payments/summary") return { json: X.SUMMARY };
  if (request.path === "/auth/org/payments/status") return { json: X.statusPage(request.query) };
  if (request.path === "/auth/org/settings/payments") return { json: X.SETTINGS };
  return null;
};
async function openCard(answer, user = OWNER, width = 1280, height = 900) {
  const run = await openPage(browser, "paydue.entry.tsx", answer, { width, height, today: TODAY });
  await run.page.evaluate(([name, who, props]) => window.mount(name, who, props), ["student", user, { moneyAvailable: user.payments_access !== false }]);
  await run.page.waitForSelector("text=История зачислений и переводов", { timeout: 8000 });
  return run;
}
async function noOverflow(page, selector, label) {
  const result = await page.evaluate(layoutProbe, selector);
  assert.deepEqual(result.bad, [], `${label}: ${result.bad.join(" | ")}`);
  assert.ok(result.scroll <= 0, `${label}: sideways scroll ${result.scroll}`);
}
const real = (name, membership) => ({ ...readReal(name), membership_id: membership });

const CASES = [
  ["pause_closed_by_leave_today", /^Пауза закрыта уходом ученика\. Верните ученика в группу/, false],
  ["pause_closed_by_leave_later", /Можно снять паузу целиком\.?$/, true],
  ["pause_closed_by_transfer_today", /^Пауза закрыта переводом ученика\. Переведите ученика обратно/, false],
  ["pause_closed_by_transfer_later", /Можно снять паузу целиком\.?$/, true],
];
for (const width of [1280, 375]) {
  for (const [name, phrase, canVoid] of CASES) {
    test(`Э7 (${width}) ${name}: the former group has «Паузы»; the window has NO form of a new pause, says the server's sentence (${canVoid ? "«…Можно снять паузу целиком»" : "«Верните / Переведите…»"}) and offers «Снять паузу целиком»`, async () => {
      const pause = readReal(name);
      const id = pause.membership_id;
      const run = await openCard(serverOf({ rows: [history({ membership_id: id })], pauses: { [id]: [pause] } }), OWNER, width);
      const button = run.page.locator('[data-testid="former-pauses"]');
      await button.waitFor();
      assert.equal(plain(await button.innerText()), "Паузы");
      await noOverflow(run.page, "main, body", `${name} ${width} card`);
      await button.click();
      await run.page.waitForSelector('[role="dialog"]');
      await run.page.waitForSelector('[data-testid="pause-card"]');
      const dialog = run.page.locator('[role="dialog"]');
      assert.equal(await dialog.locator("#pause-first, #pause-form, [data-testid=pause-new]").count(), 0, "no form of a new pause for a former stay");
      assert.match(plain(await dialog.locator('[data-testid="pause-locked-text"]').innerText()), phrase);
      assert.equal(plain(await dialog.locator('[data-testid="pause-locked-text"]').innerText()), plain(pause.days_locked_text), "the sentence is the server's, as it came");
      assert.equal(await dialog.getByRole("button", { name: "Снять паузу целиком" }).count(), 1, "a pause with locked days can always be taken off whole");
      assert.equal(await dialog.getByRole("button", { name: /Закончить сегодня|Закончить паузу/ }).count(), 0);
      await noOverflow(run.page, '[role="dialog"]', `${name} ${width} window`);
      await run.page.close();
    });
  }
}

test("Э7 the right: the action is shown to the owner and an administrator WITH the money right; an administrator without it and a teacher see none; the request of the pauses is not even sent without the right", async () => {
  const pause = readReal("pause_closed_by_leave_later");
  const id = pause.membership_id;
  const answer = () => serverOf({ rows: [history({ membership_id: id })], pauses: { [id]: [pause] } });
  const admin = await openCard(answer(), ADMIN_MONEY);
  await admin.page.locator('[data-testid="former-pauses"]').waitFor();
  await admin.page.close();
  const none = await openCard(answer(), ADMIN_NO_MONEY);
  await none.page.waitForTimeout(500);
  assert.equal(await none.page.locator('[data-testid="former-pauses"]').count(), 0);
  assert.equal(none.calls.filter((call) => /\/pauses$/.test(call.path)).length, 0, "no money right - no request of the pauses");
  await none.page.close();
});

test("Э7 a former stay WITHOUT such pauses has no action: no pauses at all; a pause that is over and was not cut (its last day is before today, no locked days) - the real object read on 02.12", async () => {
  const none = await openCard(serverOf({ rows: [history({ membership_id: "mf1" })], pauses: { mf1: [] } }));
  await none.page.waitForTimeout(500);
  assert.equal(await none.page.locator('[data-testid="former-pauses"]').count(), 0);
  assert.ok(none.calls.some((call) => /memberships\/mf1\/pauses$/.test(call.path)), "the pauses were read");
  await none.page.close();

  const old = real("pause_without_cut", "mf2");   // 17.11-30.11, no cut
  const run = await openPage(browser, "paydue.entry.tsx", serverOf({ rows: [history({ membership_id: "mf2" })], pauses: { mf2: [old] } }), { today: "2026-12-02" });
  await run.page.evaluate(([name, who, props]) => window.mount(name, who, props), ["student", OWNER, { moneyAvailable: true }]);
  await run.page.waitForSelector("text=История зачислений и переводов", { timeout: 8000 });
  await run.page.waitForTimeout(500);
  assert.equal(await run.page.locator('[data-testid="former-pauses"]').count(), 0, "over and not cut: nothing to do");
  await run.page.close();
});

test("Э7 a pause of a former stay that is NOT over (last day not before today) shows the action; the active stay and a row without the id of the stay have none", async () => {
  const running = real("pause_without_cut", "mf3");   // 17.11-30.11, today 24.11
  const answer = serverOf({
    rows: [history({ membership_id: "mf3", group_name: "Физика 8" }), history({ membership_id: "mf4", is_active: true, left_at: null, group_name: "Активная" }), history({ membership_id: null, group_name: "Без id" })],
    pauses: { mf3: [running], mf4: [readReal("pause_closed_by_leave_later")] },
  });
  const run = await openCard(answer);
  await run.page.locator('[data-testid="former-pauses"]').first().waitFor();
  assert.equal(await run.page.locator('[data-testid="former-pauses"]').count(), 1, "only the former stay with an id and a pause");
  assert.equal(await run.page.locator('[data-testid="former-pauses"]').getAttribute("aria-label"), "Паузы: Физика 8");
  assert.ok(!run.calls.some((call) => /memberships\/mf4\/pauses$/.test(call.path)), "the active stay is not asked here");
  await run.page.close();
});

test("Э7 the pause is taken off whole from the former stay: the reason is asked, the write goes, the toast says it and the action goes away", async () => {
  const pause = readReal("pause_closed_by_leave_later");
  const id = pause.membership_id;
  let list = [pause];
  const base = serverOf({ rows: [history({ membership_id: id })], pauses: {}, void: (request) => ({ pause: { ...pause, voided_at: "2026-11-24T07:00:00" }, impact: null, row: null, dry_run: /dry_run=true/.test(request.query), other_groups_text: null }) });
  const answer = (request) => {
    if (request.method === "GET" && new RegExp(`memberships/${id}/pauses$`).test(request.path)) return { json: list };
    const out = base(request);
    if (out && request.method === "POST" && /\/void$/.test(request.path) && !/dry_run=true/.test(request.query)) list = [];
    return out;
  };
  const run = await openCard(answer);
  await run.page.locator('[data-testid="former-pauses"]').click();
  await run.page.getByRole("button", { name: "Снять паузу целиком" }).click();
  await run.page.waitForSelector("#pause-act-reason");
  await run.page.fill("#pause-act-reason", "ошибочная пауза");
  await run.page.locator('[data-testid="pause-act-confirm"]').click();
  await run.page.waitForSelector("text=Пауза снята");
  assert.equal(run.calls.filter((call) => call.method === "POST" && /\/void$/.test(call.path) && !/dry_run=true/.test(call.query)).at(-1).body.reason, "ошибочная пауза");
  await run.page.waitForSelector('[data-testid="former-pauses"]', { state: "detached" });
  await run.page.close();
});
