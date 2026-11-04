// «Деньги-1», пакет А, R3 M1: the window inside a window inside a FORM, in a real DOM (headless Chromium, real React, the real `Modal` and `PauseDialog`).
// A `submit` of a portal climbs the React tree to the form that holds the portal: the inner window must never send the outer form.
const assert = require("node:assert/strict");
const test = require("node:test");
const { launch, openPage } = require("./helpers/dom-page.cjs");

let browser;
test.before(async () => { browser = await launch(); });
test.after(async () => { await browser.close(); });

test("M1: the submit of a window inside a form does not reach the form around it", async () => {
  const { page, errors } = await openPage(browser, "portal.entry.tsx");
  await page.evaluate(() => window.mount("nested"));
  await page.waitForSelector("#inner-submit");
  await page.click("#inner-submit");
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(() => window.__log), ["inner submit"], "the inner form is sent, the outer one is not");
  assert.deepEqual(errors, []);
  await page.close();
});

const MONTH_CLOSED = { code: "PAUSE_LOCKED", message: "Месяц октябрь 2026 у преподавателя Каримова К. закрыт: ведомость сохранена 03.11.2026. Чтобы исправить, владелец переоткрывает месяц.", month: "2026-10", teacherId: "t1", teacherName: "Каримова К.", closedOn: "2026-11-03" };

test("M1: «Переоткрыть месяц» inside the pause dialog reopens the month and does NOT put the pause on", async () => {
  const answer = (request) => {
    if (request.method === "GET" && request.path === "/auth/org/memberships/m1/pauses") return { json: [] };
    if (request.method === "POST" && request.path === "/auth/org/memberships/m1/pauses" && /dry_run=true/.test(request.query)) return { status: 422, json: { detail: MONTH_CLOSED } };
    if (request.method === "GET" && request.path === "/auth/org/payroll-periods") return { json: { month: "2026-10", items: [{ teacherId: "t1", teacherName: "Каримова К.", month: "2026-10", state: "closed", closedOn: "2026-11-03", sheetId: "s1", sheetRevision: 3, reopened: null }] } };
    if (request.method === "POST" && request.path === "/auth/org/payroll-periods/2026-10/reopen") return { json: { ok: true, changed: true, teacherId: "t1", month: "2026-10", state: "reopened", closedOn: "2026-11-03", sheetId: "s1", reopened: { at: "2026-11-05T09:00:00", by: "Арслан", reason: "ошибка" } } };
    return null;
  };
  const { page, calls, errors } = await openPage(browser, "portal.entry.tsx", answer);
  await page.evaluate(() => window.mount("pause"));
  await page.waitForSelector("#pause-last");
  const last = await page.evaluate(() => window.__helpers.plus(3));
  await page.fill("#pause-last", `${last.slice(8, 10)}${last.slice(5, 7)}${last.slice(0, 4)}`);
  await page.waitForSelector('[data-testid="period-closed-reopen"]');
  await page.click('[data-testid="period-closed-reopen"]');
  await page.waitForSelector("#reopen-month-reason");
  await page.fill("#reopen-month-reason", "ошибочно отметили");
  await page.waitForSelector('[data-testid="reopen-submit"]:not([disabled])');
  await page.click('[data-testid="reopen-submit"]');
  await page.waitForTimeout(400);
  const reopen = calls.filter((call) => call.path.endsWith("/reopen"));
  const live = calls.filter((call) => call.method === "POST" && call.path === "/auth/org/memberships/m1/pauses" && !/dry_run=true/.test(call.query));
  assert.equal(reopen.length, 1, "the month was reopened once");
  assert.deepEqual(reopen[0].body, { teacher_id: "t1", reason: "ошибочно отметили", sheet_revision: 3 });
  assert.equal(live.length, 0, "the pause itself was NOT sent: nobody pressed «Поставить на паузу»");
  assert.deepEqual(errors.filter((text) => !/404|Failed to load resource/.test(text)), []);
  await page.close();
});
