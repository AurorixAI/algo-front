// Money-1 / Г front (server branch money-g, MONEY1_G_FRONT.md): every item is a behaviour of a real window in a real browser, the server answered by the test.
// Ф-1: the kind of a cancellation is chosen only with the money right; without it the window says the consequence in the words of the server and sends no kind.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const plain = (text) => text.replace(/\s+/g, " ").trim();
const OWNER = { role: "owner", org_role: "owner" };
const ADMIN_NO_RIGHT = { role: "admin", org_role: "admin", payments_access: false };
const ADMIN_WITH_RIGHT = { role: "admin", org_role: "admin", payments_access: true };
const TEACHER = { role: "teacher", org_role: "teacher" };
const SUM_PHRASE = "Ученикам зачтётся по 46 000 сум";

/** `consequence`: the answer of GET …/lessons/cancel-consequence (a string, or a function for a held / failing answer). */
function serverOf({ consequence = SUM_PHRASE, gate = null, status = 200 } = {}) {
  return async (request) => {
    if (request.method === "GET" && /\/groups\/g1\/lessons\/cancel-consequence$/.test(request.path)) {
      if (gate) await gate;
      return status === 200 ? { json: { consequence } } : { status, json: { detail: { code: "SERVER_ERROR", message: "boom" } } };
    }
    if (request.method === "GET" && /lesson-exam-binding$/.test(request.path)) return { json: { state: "none" } };
    if (request.method === "POST" && request.path === "/auth/org/groups/g1/attendance") return { json: { ok: true, cancelled: true, version: 3, warnings: [] } };
    if (request.method === "POST" && request.path === "/auth/org/groups/g1/attendance/reconcile/cancel") {
      if (/dry_run=true/.test(request.query)) {
        if (gate) await gate;
        return { json: { ok: true, cancelled: true, version: 3, warnings: [], dryRun: true, consequence, moneyEffects: { students: [], payroll: [], text: "", dryRun: true } } };
      }
      return { json: { ok: true, cancelled: true, version: 3, warnings: [] } };
    }
    if (request.method === "GET" && /\/substitutions\/r\d\/candidates$/.test(request.path)) return { json: { requesterId: "t1", candidates: [] } };
    if (request.method === "GET" && /\/substitutions\/r\d$/.test(request.path)) return { json: { examBinding: { state: "none" } } };
    if (request.method === "POST" && request.path === "/auth/org/substitutions/r1/decide") return { json: { item: { id: "r1" }, result: {} } };
    if (request.method === "POST" && request.path === "/auth/org/substitutions/decide-bulk") return { json: { updated: 1, skipped: [] } };
    return null;
  };
}
const defer = () => { let release; const gate = new Promise((resolve) => { release = resolve; }); return { gate, release }; };
const consequenceCalls = (calls) => calls.filter((call) => /cancel-consequence$/.test(call.path));

async function openSheet(user, width = 1280, server = serverOf()) {
  const run = await openPage(browser, "money-g.entry.tsx", server, { width, height: 900 });
  await run.page.evaluate((who) => window.mount("sheetCancel", who), user);
  await run.page.waitForSelector('[role="dialog"]');
  return run;
}
const reasonIn = (page) => page.fill("#sheet-reason", "заболел преподаватель");

// ── Ф-1: the menu of a lesson ────────────────────────────────────────────────────────────────────

test("Ф-1 menu: «Замена» and «Перенести» stand before «Отменить урок»", async () => {
  const { page } = await openSheet(ADMIN_NO_RIGHT);
  const labels = (await page.locator('[role="group"][aria-label="Действия с уроком"] button').allTextContents()).map(plain);
  assert.deepEqual(labels.slice(0, 3), ["Назначить замену", "Перенести урок", "Отменить урок"]);
  await page.close();
});

test("Ф-1 menu: an administrator without the money right has no choice of the kind - the sentence of the server stands there, and no kind is sent", async () => {
  const run = await openSheet(ADMIN_NO_RIGHT);
  await run.page.click("text=Отменить урок");
  await run.page.waitForSelector('[data-testid="cancel-consequence"]');
  assert.equal(await run.page.locator('[data-testid="cancellation-kind"]').count(), 0);
  assert.equal(await run.page.textContent('[data-testid="cancel-consequence"]'), SUM_PHRASE, "the phrase as the server wrote it");
  assert.equal(consequenceCalls(run.calls).length, 1);
  assert.match(consequenceCalls(run.calls)[0].query, /lessonDate=2099-11-20/);
  assert.match(consequenceCalls(run.calls)[0].query, /lessonId=l1/);
  await reasonIn(run.page);
  await run.page.click('[data-testid="confirm-cancel"], button:has-text("Отменить урок") >> nth=-1');
  await run.page.waitForFunction(() => window.__log.includes("changed:Урок отменён"));
  const sent = run.calls.find((call) => call.method === "POST" && call.path === "/auth/org/groups/g1/attendance");
  assert.equal("cancellationKind" in sent.body, false, JSON.stringify(sent.body));
  await run.page.close();
});

test("Ф-1 menu: while the sentence loads a skeleton holds its place; «На оплату не влияет» is shown as it is", async () => {
  const held = defer();
  const run = await openSheet(ADMIN_NO_RIGHT, 1280, serverOf({ consequence: "На оплату не влияет", gate: held.gate }));
  await run.page.click("text=Отменить урок");
  await run.page.waitForSelector('[data-testid="cancel-consequence-skeleton"]');
  assert.equal(await run.page.locator('[data-testid="cancel-consequence"]').count(), 0);
  held.release();
  await run.page.waitForSelector('[data-testid="cancel-consequence"]');
  assert.equal(await run.page.locator('[data-testid="cancel-consequence-skeleton"]').count(), 0);
  assert.equal(plain(await run.page.textContent('[data-testid="cancel-consequence"]')), "На оплату не влияет");
  await run.page.close();
});

test("Ф-1 menu: a refusal to load the sentence neither shows an error nor blocks the cancellation", async () => {
  const run = await openSheet(ADMIN_NO_RIGHT, 1280, serverOf({ status: 500 }));
  await run.page.click("text=Отменить урок");
  await run.page.waitForFunction(() => !document.querySelector('[data-testid="cancel-consequence-skeleton"]'));
  assert.equal(await run.page.locator('[data-testid="cancel-consequence"]').count(), 0);
  await reasonIn(run.page);
  await run.page.click('button:has-text("Отменить урок") >> nth=-1');
  await run.page.waitForFunction(() => window.__log.includes("changed:Урок отменён"));
  await run.page.close();
});

for (const [who, user] of [["the owner", OWNER], ["an administrator with the right", ADMIN_WITH_RIGHT]]) {
  test(`Ф-1 menu: ${who} chooses the kind as before - no sentence asked, the kind is sent`, async () => {
    const run = await openSheet(user);
    await run.page.click("text=Отменить урок");
    await run.page.waitForSelector('[data-testid="cancellation-kind"]');
    await run.page.click('[data-testid="cancellation-kind-holiday"]');
    await reasonIn(run.page);
    await run.page.click('button:has-text("Отменить урок") >> nth=-1');
    await run.page.waitForFunction(() => window.__log.includes("changed:Урок отменён"));
    assert.equal(consequenceCalls(run.calls).length, 0);
    assert.equal(run.calls.find((call) => call.method === "POST" && call.path === "/auth/org/groups/g1/attendance").body.cancellationKind, "holiday");
    await run.page.close();
  });
}

// ── Ф-1: «Урока не было» ─────────────────────────────────────────────────────────────────────────

async function openMissed(user, width = 1280, server = serverOf()) {
  const run = await openPage(browser, "money-g.entry.tsx", server, { width, height: 900 });
  await run.page.evaluate((who) => window.mount("cancelMissed", who), user);
  await run.page.waitForSelector('[role="dialog"]');
  return run;
}

test("Ф-1 «Урока не было»: without the right - no kind, the `consequence` of the preview stands in «Что изменится», nothing but the reason is sent", async () => {
  const held = defer();
  const run = await openMissed(ADMIN_NO_RIGHT, 1280, serverOf({ gate: held.gate }));
  await run.page.waitForSelector('[data-testid="cancel-consequence-skeleton"]');
  held.release();
  await run.page.waitForSelector('[data-testid="cancel-effects-students"]');
  assert.equal(await run.page.locator('[data-testid="cancellation-kind"]').count(), 0);
  assert.equal(await run.page.textContent('[data-testid="cancel-effects-students"]'), SUM_PHRASE);
  await run.page.fill("#cancel-missed-reason", "заболел");
  await run.page.click('[data-testid="cancel-missed-submit"]');
  await run.page.waitForFunction(() => window.__log.some((line) => String(line).startsWith("cancelled:")));
  for (const call of run.calls.filter((entry) => entry.path.endsWith("/attendance/reconcile/cancel"))) assert.equal("cancellationKind" in call.body, false, `${call.query} ${JSON.stringify(call.body)}`);
  await run.page.close();
});

test("Ф-1 «Урока не было»: an owner keeps the choice of the kind and his own line of sums", async () => {
  const run = await openMissed(OWNER);
  await run.page.waitForSelector('[data-testid="cancellation-kind"]');
  assert.equal(await run.page.locator('[data-testid="cancel-consequence-skeleton"]').count(), 0);
  await run.page.close();
});

// ── Ф-1: «Замены» ────────────────────────────────────────────────────────────────────────────────

async function openDecision(user, width = 1280, server = serverOf()) {
  const run = await openPage(browser, "money-g.entry.tsx", server, { width, height: 900 });
  await run.page.evaluate((who) => window.mount("decision", who, { role: who.org_role }), user);
  await run.page.waitForSelector('[role="dialog"]');
  await run.page.click('label:has(input[value="cancel"])');
  return run;
}

test("Ф-1 «Замены», one request: without the right no kind, the sentence of the server, no kind in the decision", async () => {
  const run = await openDecision(ADMIN_NO_RIGHT);
  await run.page.waitForSelector('[data-testid="cancel-consequence"]');
  assert.equal(await run.page.locator('[data-testid="cancellation-kind"]').count(), 0);
  assert.equal(await run.page.textContent('[data-testid="cancel-consequence"]'), SUM_PHRASE);
  assert.match(consequenceCalls(run.calls)[0].query, /lessonId=l-r1/);
  await run.page.fill("#substitution-cancel-reason", "заболел преподаватель");
  await run.page.click('button:has-text("Отменить урок") >> nth=-1');
  await run.page.waitForFunction(() => window.__log.includes("decided"));
  const sent = run.calls.find((call) => call.path === "/auth/org/substitutions/r1/decide");
  assert.equal(sent.body.decision, "cancel");
  assert.equal("cancellationKind" in sent.body, false, JSON.stringify(sent.body));
  await run.page.close();
});

test("Ф-1 «Замены», one request: the owner chooses the kind and no sentence is asked", async () => {
  const run = await openDecision(OWNER);
  await run.page.waitForSelector('[data-testid="cancellation-kind"]');
  await run.page.click('[data-testid="cancellation-kind-holiday"]');
  await run.page.fill("#substitution-cancel-reason", "праздник");
  await run.page.click('button:has-text("Отменить урок") >> nth=-1');
  await run.page.waitForFunction(() => window.__log.includes("decided"));
  assert.equal(consequenceCalls(run.calls).length, 0);
  assert.equal(run.calls.find((call) => call.path === "/auth/org/substitutions/r1/decide").body.cancellationKind, "holiday");
  await run.page.close();
});

async function openBulk(user, dates, server = serverOf()) {
  const run = await openPage(browser, "money-g.entry.tsx", server, { width: 1280, height: 900 });
  await run.page.evaluate(([who, days]) => window.mount("bulk", who, { dates: days }), [user, dates]);
  await run.page.waitForSelector('[role="dialog"]');
  return run;
}

test("Ф-1 «Замены», pack: without the right no kind and none sent; the sentence only when one lesson is chosen (several lessons have no single sum)", async () => {
  const one = await openBulk(ADMIN_NO_RIGHT, ["2099-11-20"]);
  await one.page.waitForSelector('[data-testid="cancel-consequence"]');
  assert.equal(await one.page.locator('[data-testid="cancellation-kind"]').count(), 0);
  await one.page.fill("#substitution-bulk-reason", "праздничный день центра");
  await one.page.click('button:has-text("Отменить уроки") >> nth=-1');
  await one.page.waitForFunction(() => window.__log.includes("done"));
  assert.equal("cancellationKind" in one.calls.find((call) => call.path === "/auth/org/substitutions/decide-bulk").body, false);
  await one.page.close();
  const many = await openBulk(ADMIN_NO_RIGHT, ["2099-11-20", "2099-11-27"]);
  await many.page.waitForSelector("#substitution-bulk-reason");
  assert.equal(consequenceCalls(many.calls).length, 0);
  assert.equal(await many.page.locator('[data-testid="cancel-consequence"], [data-testid="cancel-consequence-skeleton"]').count(), 0);
  await many.page.close();
  const owner = await openBulk(OWNER, ["2099-11-20", "2099-11-27"]);
  await owner.page.waitForSelector('[data-testid="cancellation-kind"]');
  await owner.page.close();
});

// ── Ф-1: widths ──────────────────────────────────────────────────────────────────────────────────

for (const width of [1280, 1024, 375]) {
  test(`Ф-1 ${width}: the three windows without the right - nothing leaves its box, the sentence is whole`, async () => {
    for (const open of [() => openSheet(ADMIN_NO_RIGHT, width), () => openMissed(ADMIN_NO_RIGHT, width), () => openDecision(ADMIN_NO_RIGHT, width)]) {
      const { page } = await open();
      if (await page.locator('text=Отменить урок').count() && !(await page.locator("#sheet-reason, #cancel-missed-reason, #substitution-cancel-reason").count())) await page.click("text=Отменить урок");
      await page.waitForSelector('[data-testid="cancel-consequence"], [data-testid="cancel-effects-students"]');
      const sentence = plain(await page.locator('[data-testid="cancel-consequence"], [data-testid="cancel-effects-students"]').first().textContent());
      assert.equal(sentence, "Ученикам зачтётся по 46 000 сум", `${width}: ${sentence}`);
      await page.waitForTimeout(450);
      const facts = await page.evaluate(layoutProbe, '[role="dialog"]');
      assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
      assert.equal(facts.scroll, 0);
      await page.close();
    }
  });
}
