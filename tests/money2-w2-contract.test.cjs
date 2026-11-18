// Money-2 wave 2, after the review of the server: (1) a transfer ALWAYS names its source (`from_group_id`), also for a student with ONE group - in the dry run and in the write; (2) coming back the day of the
// leaving (`leave_undo.undone`) - «Оплата с» and the opening balance are not offered (the server refuses them), the note of the server says why.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain, isDry, mount, F, OWNER } = require("./helpers/money2-w2.cjs");

const ctx = setup(test);
const posts = (run) => run.calls.filter((call) => call.method === "POST" && /\/groups\/gt\/students\/st1/.test(call.path));
const pick = (page) => page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');

test("a transfer of a student with ONE group sends `from_group_id` in the dry run and in the write", async () => {
  const run = await mount(ctx, F.baseServer((request) => (request.path === "/auth/org/groups/gt/students/st1" ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: isDry(request), effects: F.transferEffects({ names: F.SHORT }) } } : null), F.SHORT), "assign", OWNER, { moneyAvailable: true, sourceGroups: [F.SOURCES[0]], excludeGroupIds: ["ga"] });
  await pick(run.page);
  await run.page.waitForSelector('[data-testid="transfer-effects"]');
  await run.page.click('[data-testid="assign-submit"]');
  await run.page.waitForSelector('[data-testid="assign-done"]');
  const sent = posts(run);
  assert.ok(sent.length >= 2);
  assert.ok(sent.every((call) => call.body.from_group_id === "ga"), JSON.stringify(sent.map((call) => call.body)));
  assert.equal(await run.page.locator('[data-testid="assign-source"]').count(), 0, "nothing to choose with one group");
  await run.page.close();
});

const OLD = /Оплата с|Оплачено до|Остаток на начало|долг на дату/i;
const addServer = (undone) => F.baseServer((request) => (request.path === "/auth/org/groups/gt/students/st1" ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: true, leave_undo: undone ? { undone: true, text: "Ученика убрали сегодня — возвращаем как было", restored: [] } : null } } : (request.path.endsWith("/pay-from-default") || /pay-from|billing/.test(request.path) ? { json: { default_pay_from: "2026-11-16", today: "2026-11-16", min: "2026-11-01" } } : null)), F.SHORT);

test("coming back the day of the leaving: «Оплата с» and the opening balance are not offered; an ordinary return offers them", async () => {
  const props = { moneyAvailable: true, mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"] };
  const ordinary = await mount(ctx, addServer(false), "assign", OWNER, props);
  await pick(ordinary.page);
  await ordinary.page.waitForSelector('[data-testid="assign-price"]');
  assert.match(plain(await ordinary.page.locator('[role="dialog"]').evaluate((el) => el.innerText)), OLD, "baseline: the fields are there");
  await ordinary.page.close();
  const undone = await mount(ctx, addServer(true), "assign", OWNER, props);
  await pick(undone.page);
  await undone.page.waitForSelector('[data-testid="leave-undo"]');
  const text = plain(await undone.page.locator('[role="dialog"]').evaluate((el) => el.innerText));
  const withoutNote = text.replace(/Ученик вернулся[^]*?задать нельзя/, "");
  assert.doesNotMatch(withoutNote, OLD);
  await undone.page.close();
});
