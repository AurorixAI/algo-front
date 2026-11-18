// Money-2 fix 9 (walk M12, замечания): (4) the plate of a cancelled leaving says it ONCE - the sentence of the server and one grey line «Дата начала оплаты, остаток и индивидуальная цена не меняются» (no list of what
// was restored, no «Уход отменяется —»), in the card of a student, the drawer of the group page (one / several) and the mass transfer; (5) when ALL chosen come back the block «Цена группы … Эту цену получат все
// добавляемые» is not drawn, when some - it stays; (6) an ORDINARY return (`leave_undo.undone=false`) is said in the drawer too: one student - a grey line, several - the disclosure by student.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain, mount, OWNER } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const X = require("./helpers/money2-fix7.cjs");
const { F } = X;

const ctx = setup(test);
const FIXED_TEXT = "Дата начала оплаты, остаток и индивидуальная цена не меняются";
const ORDINARY = "Возврат обычный, а не отмена ухода: ученик ушёл раньше. Цена и паузы не восстанавливаются";
const PEOPLE = [["st9", "Новый"], ["st8", "Второй"], ["st7", "Третий"]];
const pick = (page) => page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');

// the bulk probe: `st9`, `st7` come back the day of the leaving (`undone`), `st8` returns in the ordinary way when `ordinary` lists him
function server({ undone = [], ordinary = [], money = true } = {}) {
  const base = X.drawerServer(undone, (r) => (r.method === "GET" && r.path === "/auth/org/students" ? { json: { items: PEOPLE.map(([id, last]) => X.STUDENT(id, last)), total: 3 } } : null));
  return (request) => {
    if (request.method === "POST" && /\/students\/bulk$/.test(request.path) && X.isDry(request)) {
      const ids = request.body.student_ids;
      return { json: { group_id: "g2", added: ids.length, skipped: 0, skipped_details: [], warnings: [], dry_run: true, students: ids.map((id) => ({ student_id: id, group_id: "g2", status: "added", billing: null, past_balances: [],
        leave_undo: undone.includes(id) ? X.undoOf(true) : ordinary.includes(id) ? { undone: false, text: ORDINARY + (money ? "" : "."), restored: [] } : null })) } };
    }
    return base(request);
  };
}
async function drawer(chosen, opts, width = 1280) {
  const run = await openPage(ctx.browser, "money-b.entry.tsx", server(opts), { width, height: width === 375 ? 800 : 900 });
  await run.page.evaluate(() => window.mount("addDrawer", { role: "owner", org_role: "owner" }, { summary: { accountingStart: "2026-09-01" }, refresh: false, groupPrice: { amount: 380000, valid_from: "2026-09-01" } }));
  await run.page.fill('input[placeholder^="Поиск по имени"]', "ов");
  await run.page.fill('input[placeholder^="Поиск по имени"]', "Уч");
  for (const last of chosen) await run.page.click(`button:has-text("${last} Ученик")`);
  return run;
}

// ---- 4
test("card of a student: ONE plate - the sentence of the server once, the grey line without «Уход отменяется —», no list of what was restored", async () => {
  for (const props of [{ mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"] }, { mode: "transfer", currentGroupId: null, currentGroupName: "", excludeGroupIds: [], sourceGroups: [] }]) {
    const run = await mount(ctx, X.modalServer({ undone: true }), "assign", OWNER, { moneyAvailable: true, groupsBasePath: "/owner/groups", ...props });
    await pick(run.page);
    await run.page.waitForSelector('[data-testid="leave-undo"]');
    const text = plain(await run.page.locator('[data-testid="leave-undo"]').textContent());
    assert.equal(text, `${plain(X.UNDO_TEXT)}${FIXED_TEXT}`);
    assert.deepEqual((await run.page.locator('[data-testid="leave-undo"] > *').allTextContents()).map(plain), [plain(X.UNDO_TEXT), FIXED_TEXT], "two lines: the server's sentence, the grey line");
    assert.ok(!/Уход отменяется|продолжается|восстановлена|сум возвращена/.test(plain(await run.page.locator('[role="dialog"]').textContent())));
    await run.page.close();
  }
});
test("drawer, one returns: ONE plate - the sentence of the server once and the grey line", async () => {
  const run = await drawer(["Новый"], { undone: ["st9"] });
  await run.page.waitForSelector('[data-testid="leave-undo"]');
  assert.deepEqual((await run.page.locator('[data-testid="leave-undo"] > *').allTextContents()).map(plain), [plain(X.UNDO_TEXT), FIXED_TEXT]);
  assert.equal(await run.page.locator('[data-testid="leave-undo-many"]').count(), 0);
  await run.page.close();
});
test("drawer, several return: the disclosure holds the name and the sentence of the server, nothing twice", async () => {
  const run = await drawer(["Новый", "Второй", "Третий"], { undone: ["st9", "st7"] });
  await run.page.waitForSelector('[data-testid="leave-undo-many"]');
  await run.page.click('[data-testid="leave-undo-many"] summary');
  const items = (await run.page.locator('[data-testid="leave-undo-many"] li').allTextContents()).map(plain);
  assert.deepEqual(items, [`Новый Ученик: ${plain(X.UNDO_TEXT)}`, `Третий Ученик: ${plain(X.UNDO_TEXT)}`]);
  const all = plain(await run.page.locator('[data-testid="leave-undo-many"]').textContent());
  assert.ok(!/Уход отменяется|продолжается|восстановлена/.test(all), all);
  await run.page.close();
});

// ---- 5
const PRICE_BLOCK = '[data-testid="add-price-settings"]';
test("drawer, ALL come back: no «Цена группы … Эту цену получат все» block; SOME come back: the block stays", async () => {
  const all = await drawer(["Новый", "Третий"], { undone: ["st9", "st7"] });
  await all.page.waitForSelector('[data-testid="leave-undo-many"]');
  assert.equal(await all.page.locator(PRICE_BLOCK).count(), 0);
  assert.ok(!/Цена группы|Эту цену получат/.test(plain(await all.page.locator('[role="dialog"]').textContent())));
  await all.page.close();
  const some = await drawer(["Новый", "Второй", "Третий"], { undone: ["st9", "st7"] });
  await some.page.waitForSelector('[data-testid="leave-undo-many"]');
  const text = plain(await some.page.locator(PRICE_BLOCK).textContent());
  assert.ok(/Цена группы/.test(text) && /Эту цену получат все добавляемые ученики/.test(text), text);
  await some.page.close();
  const none = await drawer(["Второй"], { undone: [] });
  await none.page.waitForSelector(PRICE_BLOCK);
  assert.ok(/Цена группы/.test(plain(await none.page.locator(PRICE_BLOCK).textContent())));
  await none.page.close();
});

// ---- 6
test("drawer, ONE student returns in the ordinary way: the sentence of the server as a grey line (as in the card of the student)", async () => {
  const run = await drawer(["Второй"], { ordinary: ["st8"] });
  await run.page.waitForSelector('[data-testid="leave-undo"]');
  assert.equal(await run.page.locator('[data-testid="leave-undo"]').getAttribute("data-undone"), "no");
  assert.equal(plain(await run.page.locator('[data-testid="leave-undo"]').textContent()), plain(ORDINARY));
  assert.equal(await run.page.locator('[data-testid="leave-undo-fixed"]').count(), 0, "no «не меняются» line - nothing is cancelled");
  assert.ok(await run.page.locator('[data-testid="pay-from"]').count() > 0, "an ordinary return keeps «Оплата с»");
  await run.page.close();
});
test("drawer, SEVERAL: one ordinary and one cancelling - two plates, each in its place; the ordinary one by student in a disclosure", async () => {
  const run = await drawer(["Новый", "Второй", "Третий"], { undone: ["st9"], ordinary: ["st8", "st7"] });
  await run.page.waitForSelector('[data-testid="leave-undo-many"]');
  const ordinary = run.page.locator('[data-testid="leave-return-many"]');
  assert.equal(await ordinary.count(), 1);
  assert.match(plain(await ordinary.locator("summary").textContent()), /^2 ученика возвращаются в группу после ухода$/);
  await ordinary.locator("summary").click();
  assert.deepEqual((await ordinary.locator("li").allTextContents()).map(plain), [`Второй Ученик: ${plain(ORDINARY)}`, `Третий Ученик: ${plain(ORDINARY)}`]);
  assert.match(plain(await run.page.locator('[data-testid="leave-undo-many"] summary').textContent()), /^1 ученик возвращается в день ухода — уход отменяется$/);
  await run.page.close();
});
test("drawer, a role without the right to money: the sentence comes from the server as it is (no sums are built by the screen)", async () => {
  const run = await drawer(["Второй"], { ordinary: ["st8"], money: false });
  await run.page.waitForSelector('[data-testid="leave-undo"]');
  assert.ok(!/\d{2,3}\s?\d{3}/.test(plain(await run.page.locator('[data-testid="leave-undo"]').textContent())));
  await run.page.close();
});
