// Money-2 fix 10 (дополнение А-Г): the explanations live under a «?» (one Hint component): mouse, keyboard, a tap at 375, Esc, a press elsewhere; the long sentences of the server are not on the screen; the block of the past
// balances is compact + a «?» only for the right to money; «К оплате сразу».
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain, mount, OWNER } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const X = require("./helpers/money2-fix7.cjs");
const { F } = X;

const ctx = setup(test);
const NO_MONEY = { role: "admin", org_role: "admin", payments_access: false };
const ORDINARY = "Ученика убрали сегодня, но после этого ему простили долг 15 000 сум — поэтому он записывается заново: прежние индивидуальная цена и паузы не вернутся";
const SAME = { group_id: "g2", group_name: "7-Б Геометрия", membership_id: "m-same", left_on: "2026-11-17", kind: "debt", amount: 38000, same_group: true, text: "Уже был в этой группе, ушёл 17.11.2026 — остался долг 38 000 сум" };

async function drawer(chosen, { undone = [], ordinary = [], balances = {}, who = OWNER, width = 1280 } = {}) {
  const base = X.drawerServer(undone, (r) => (r.method === "GET" && r.path === "/auth/org/students" ? { json: { items: [X.STUDENT("st9", "Новый"), X.STUDENT("st8", "Второй"), X.STUDENT("st7", "Третий")], total: 3 } } : null), false, balances);
  const server = (r) => {
    if (r.method === "POST" && /\/students\/bulk$/.test(r.path) && X.isDry(r)) {
      const res = base(r);
      res.json.students.forEach((s) => { if (ordinary.includes(s.student_id)) s.leave_undo = { undone: false, text: ORDINARY, restored: [] }; });
      return res;
    }
    return base(r);
  };
  const run = await openPage(ctx.browser, "money-b.entry.tsx", server, { width, height: width === 375 ? 812 : 900 });
  await run.page.evaluate(([w, m]) => window.mount("addDrawer", w, m ? { summary: { accountingStart: "2026-09-01" }, refresh: false, groupPrice: { amount: 380000, valid_from: "2026-09-01" } } : { refresh: false }), [who, who === OWNER]);
  await run.page.fill('input[placeholder^="Поиск по имени"]', "Уч");
  for (const last of chosen) await run.page.click(`button:has-text("${last} Ученик")`);
  return run;
}
const bubble = (page) => page.locator('[role="tooltip"]');

test("«?» of a plate: opens on click, Esc and a press elsewhere close it; the keyboard opens it; the bubble stays inside the window at 375", async () => {
  for (const width of [1280, 375]) {
    const run = await drawer(["Новый"], { undone: ["st9"], width });
    const help = run.page.locator('[data-testid="leave-undo-help"] [role="button"]');
    await help.waitFor();
    assert.equal(await help.getAttribute("aria-label"), "Пояснение");
    await help.click();
    await bubble(run.page).waitFor();
    assert.ok(plain(await bubble(run.page).textContent()).startsWith(plain(X.UNDO_TEXT)), "the sentence of the server inside");
    const box = await bubble(run.page).boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width + 0.5, `bubble inside the screen ${JSON.stringify(box)}`);
    await run.page.keyboard.press("Escape");
    assert.equal(await bubble(run.page).count(), 0, "Esc closes");
    await help.focus();
    await run.page.keyboard.press("Enter");
    assert.equal(await bubble(run.page).count(), 1, "Enter opens");
    await run.page.mouse.click(width / 2, 4);
    await run.page.waitForTimeout(150);
    assert.equal(await bubble(run.page).count(), 0, "a press elsewhere closes");
    await run.page.close();
  }
});

test("plates: the screen holds ONE short line, no full sentence of the server, no disclosure; ordinary / several / two kinds", async () => {
  const run = await drawer(["Новый", "Второй", "Третий"], { undone: ["st9"], ordinary: ["st8", "st7"] });
  await run.page.waitForSelector('[data-testid="leave-undo-many"]');
  const text = await X.shown(run.page.locator('[role="dialog"]'));
  assert.ok(text.includes("1 ученика убрали сегодня — вернутся как были") && text.includes("2 ученика записываются заново"), text);
  assert.ok(!text.includes("простили долг") && !text.includes("Ученика убрали сегодня —  возвращаем") && !text.includes(plain(X.UNDO_TEXT)), "no server sentence on the screen");
  assert.equal(await run.page.locator('[role="dialog"] details').count(), 0);
  assert.ok(!/уход отмен|Возврат обычный|возвращаются в день/i.test(text));
  await run.page.close();
});

test("past balances: compact rows, title with a «?» only for the right to money; without it - no sums, no link, no «?»", async () => {
  const run = await drawer(["Новый"], { balances: { st9: [SAME] } });
  const box = run.page.locator('[data-testid="past-balances"]');
  await box.waitFor();
  assert.equal(await X.shown(box.locator("h3")), "Долги и авансы с прошлого раза");
  assert.equal((await X.shown(box.locator('[data-testid="past-balance"]'))).replace(/\s/g, ""), "Долг·вэтойжегруппе·ушёл17.1138000сумВыписка");
  assert.deepEqual(await X.hintsOf(box), ["Принять оплату, простить долг или вернуть аванс можно в выписке"]);
  assert.ok(!/остался долг/.test(await X.shown(box)), "the server's text is not put into the rows");
  await run.page.close();
  const bare = { ...SAME }; delete bare.amount; bare.text = "Уже был в этой группе, ушёл 17.11.2026 — остался долг";
  const poor = await drawer(["Новый"], { balances: { st9: [bare] }, who: NO_MONEY });
  const pbox = poor.page.locator('[data-testid="past-balances"]');
  await pbox.waitFor();
  assert.equal(await pbox.locator('[data-testid="past-balances-help"], [data-testid="past-balance-link"]').count(), 0);
  assert.ok(!/\d{2,3} \d{3}/.test(await X.shown(pbox)));
  await poor.page.close();
});

test("an old answer without `text` in the rows still draws (the compact row is built from the structure)", async () => {
  const old = { ...SAME }; delete old.text;
  const run = await drawer(["Новый"], { balances: { st9: [old] }, undone: [] });
  await run.page.locator('[data-testid="past-balance"]').waitFor();
  assert.match(await X.shown(run.page.locator('[data-testid="past-balance"]')), /^Долг · в этой же группе/);
  await run.page.close();
});
