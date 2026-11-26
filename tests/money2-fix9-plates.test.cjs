// Money-2 fix 9 (walk M12, замечания) in the form of the mock-up of 19.11: (4) the words of the server about a student who comes back as he was stand in HIS row of the special rows (the mock-up shows them before the action) and
// once more, once, in the message after it - no list of what was restored, no «Уход отменяется —»; (5) when ALL chosen come back the conditions are not drawn, when some - they stay; (6) an ORDINARY return
// (`leave_undo.undone=false`) is said in the drawer too: «зачисляется обычным порядком» and the sentence of the server under it.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain, mount, OWNER } = require("./helpers/money2-w2.cjs");
const H = require("./helpers/enrol-v2.cjs");
const X = require("./helpers/money2-fix7.cjs");
const { F } = X;

const ctx = setup(test);
const NAMES = ["Новый", "Второй", "Третий"];
const PEOPLE = [H.STUDENT("st9", "Новый", "Ученик"), H.STUDENT("st8", "Второй", "Ученик"), H.STUDENT("st7", "Третий", "Ученик")];
const pick = (page) => page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');

// the bulk probe: `st9`, `st7` come back the day of the leaving (`undone`), `st8` returns in the ordinary way when `ordinary` lists him
async function drawer(chosen, { undone = [], ordinary = [], money = true } = {}, width = 1280) {
  const run = await H.openDrawer(ctx, H.server({ people: PEOPLE, undone, ordinary }), { width, user: money ? H.OWNER : H.ADMIN_NO_MONEY, props: { money } });
  for (const first of chosen) await H.pick(run.page, first);
  return run;
}

// ---- 4
const settled = async (run) => {
  for (let i = 0; i < 60 && run.calls.filter((c) => c.method === "POST" && X.isDry(c)).length < 1; i += 1) await run.page.waitForTimeout(100);
  await run.page.waitForTimeout(600);
};
test("card of a student: the row with the server's sentence before the action, no «?» and no list of what was restored; after the action the sentence once in the message", async () => {
  for (const props of [{ mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"] }, { mode: "transfer", currentGroupId: null, currentGroupName: "", excludeGroupIds: [], sourceGroups: [] }]) {
    const run = await mount(ctx, X.modalServer({ undone: true }), "assign", OWNER, { moneyAvailable: true, groupsBasePath: "/owner/groups", ...props });
    await pick(run.page);
    await settled(run);
    assert.equal(await run.page.locator('[data-testid="leave-undo"]').count(), 0, "no plate of the old kind");
    assert.equal(await run.page.locator('[role="dialog"] [aria-label="Пояснение"]').count(), 0, "no «?»");
    const row = plain(await run.page.locator('[data-testid="enrol-note-undone"]').innerText());
    assert.ok(row.startsWith("Ученика убрали сегодня — возвращаем как было"), row);
    assert.ok(!/Уход отменяется|продолжается|восстановлена|сум возвращена/.test(row));
    assert.equal(await run.page.locator('[data-testid="enrol-terms"]').count(), 0, "nothing to set for a student who comes back as he was");
    await run.page.waitForSelector('[data-testid="assign-submit"]:not([disabled])');
    await run.page.click('[data-testid="assign-submit"]');
    await run.page.waitForSelector('[data-tone]');
    const text = plain(await run.page.locator('[data-tone]').textContent());
    assert.equal(text.split("Ученика убрали сегодня — возвращаем как было").length - 1, 1, "once");
    assert.ok(!/Уход отменяется|продолжается|восстановлена|сум возвращена/.test(text));
    await run.page.close();
  }
});
test("drawer, one returns: his row with the server's words, no «?», no common remark", async () => {
  const run = await drawer(["Новый"], { undone: ["st9"] });
  await settled(run);
  assert.equal(await run.page.locator('[data-testid="leave-undo"], [data-testid="leave-undo-many"], [data-testid="leave-shared-note"], [data-testid="enrol-note-shared"]').count(), 0);
  assert.equal(await run.page.locator('[role="dialog"] [aria-label="Пояснение"]').count(), 0);
  assert.equal(plain(await run.page.locator('[data-testid="enrol-note-undone"]').innerText()), plain(H.UNDO), "one student: his name is in the title");
  await run.page.close();
});
test("drawer, several return and something common is entered: each returning student's row says the common price and day do not apply to him; no «?»", async () => {
  const run = await drawer(NAMES, { undone: ["st9", "st7"] });
  await settled(run);
  assert.equal(await run.page.locator('[data-testid="enrol-note-shared"]').count(), 0, "nothing common entered: no remark");
  await run.page.click('[data-testid="enrol-terms-toggle"]');
  await run.page.fill("#add-student-pay-from", "17.11.2026");
  await run.page.keyboard.press("Tab");
  await run.page.waitForSelector('[data-testid="enrol-note-shared"]');
  const rows = run.page.locator('[data-testid="enrol-note-undone"]');
  assert.equal(await rows.count(), 2);
  for (const text of (await rows.allInnerTexts()).map(plain)) {
    assert.ok(text.includes(plain(H.UNDO)) && text.endsWith("Общие цена и дата на него не действуют — остаются прежние"), text);
    assert.ok(!/Уход отменяется|продолжается|восстановлена/.test(text), text);
  }
  assert.equal(await run.page.locator('[role="dialog"] [aria-label="Пояснение"]').count(), 0);
  await run.page.close();
});
test("drawer, ALL come back: the conditions are not drawn; SOME come back: they stay", async () => {
  const all = await drawer(["Новый", "Третий"], { undone: ["st9", "st7"] });
  await settled(all);
  assert.equal(await all.page.locator('[data-testid="enrol-terms"]').count(), 0);
  assert.ok(!/Оплата с|Изменить/.test(plain(await all.page.locator('[role="dialog"]').textContent())));
  await all.page.close();
  const some = await drawer(NAMES, { undone: ["st9", "st7"] });
  await settled(some);
  assert.match(plain(await some.page.locator('[data-testid="enrol-terms-line"]').textContent()), /^Оплата с \d+ [а-яё]+, по цене группы$/);
  await some.page.close();
  const none = await drawer(["Второй"], { undone: [] });
  await none.page.waitForSelector('[data-testid="enrol-terms"]');
  assert.match(plain(await none.page.locator('[data-testid="enrol-terms-line"]').textContent()), /по цене группы/);
  await none.page.close();
});

// ---- 6
test("drawer, ONE student returns in the ordinary way: «Зачисляется обычным порядком» and the sentence of the server under it", async () => {
  const run = await drawer(["Второй"], { ordinary: ["st8"] });
  await run.page.waitForSelector('[data-testid="enrol-note-rewrite"]');
  const note = run.page.locator('[data-testid="enrol-note-rewrite"]');
  assert.equal(plain(await note.locator('[data-testid="leave-undo-line"]').innerText()), "Зачисляется обычным порядком");
  assert.equal(plain(await note.locator('[data-testid="leave-undo-text"]').innerText()), plain(H.REWRITE), "the server's words only, no «can not be set» line - nothing is cancelled");
  await run.page.click('[data-testid="enrol-terms-toggle"]');
  assert.ok(await run.page.locator('[data-testid="pay-from"]').count() > 0, "an ordinary return keeps «Оплата с»");
  await run.page.close();
});
test("drawer, SEVERAL: one cancelling and two ordinary - «зачисляется обычным порядком» in the rows of the ordinary ones only", async () => {
  const run = await drawer(NAMES, { undone: ["st9"], ordinary: ["st8", "st7"] });
  await run.page.waitForSelector('[data-testid="enrol-note-rewrite"]');
  const notes = run.page.locator('[data-testid="enrol-note-rewrite"]');
  assert.equal(await notes.count(), 2);
  assert.equal(plain(await notes.first().locator('[data-testid="leave-undo-text"]').innerText()), plain(H.REWRITE));
  assert.equal(await run.page.locator('[data-testid="leave-undo-many"], [data-testid="leave-return-many"]').count(), 0, "the returning-as-was one has no plate");
  assert.equal(await run.page.locator('[data-testid="enrol-note-rewrite"]', { hasText: "Новый" }).count(), 0, "the one who comes back as he was has his own kind of row");
  assert.equal(await run.page.locator('[data-testid="enrol-note-undone"]', { hasText: "Новый" }).count(), 1);
  await run.page.close();
});
test("drawer, a role without the right to money: the sentence comes from the server as it is (no sums are built by the screen)", async () => {
  const run = await drawer(["Второй"], { ordinary: ["st8"], money: false });
  await run.page.waitForSelector('[data-testid="enrol-note-rewrite"]');
  assert.ok(!/\d{2,3}\s?\d{3}/.test(plain(await run.page.locator('[data-testid="enrol-exceptions"]').innerText()).replace(plain(H.REWRITE), "")), "no sum of the screen's own");
  assert.equal(plain(await run.page.locator('[data-testid="enrol-note-rewrite"] [data-testid="leave-undo-text"]').innerText()), plain(H.REWRITE), "the sentence of the server as it came");
  await run.page.close();
});
