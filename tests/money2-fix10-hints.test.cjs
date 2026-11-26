// Money-2 fix 10 (дополнение А-Г) in the form of the mock-up of 19.11: there is NO «?» in the windows of enrolment - what a student's row has to say is a row with his name and the words of the server UNDER it (they wrap inside the
// window at 375, they are not cut and not hidden); the balances of the last time are rows with «Выписка» only for the right to money.  The component of the «?» itself is tested where it still stands (the statement: money2-fix10-statement).
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain } = require("./helpers/money2-w2.cjs");
const H = require("./helpers/enrol-v2.cjs");

const ctx = setup(test);
const NO_MONEY = { role: "admin", org_role: "admin", payments_access: false };
const ORDINARY = "Ученика убрали сегодня, но после этого ему простили долг 15 000 сум — поэтому уход не отменяется, ученик зачисляется обычным порядком: прежние индивидуальная цена и паузы не вернутся";
const UNDO_TEXT = "Ученика убрали сегодня — возвращаем как было: индивидуальная цена 300 000 сум. Долг снова за учеником";
const SAME = { group_id: "g2", group_name: "7-Б Геометрия", membership_id: "m-same", left_on: "2026-11-17", kind: "debt", amount: 38000, same_group: true, text: "Уже был в этой группе, ушёл 17.11.2026 — остался долг 38 000 сум" };
const PEOPLE = [H.STUDENT("st9", "Новый", "Ученик"), H.STUDENT("st8", "Второй", "Ученик"), H.STUDENT("st7", "Третий", "Ученик")];

async function drawer(chosen, { undone = [], ordinary = [], balances = {}, who = H.OWNER, width = 1280 } = {}) {
  const inner = H.server({ people: PEOPLE, past: balances, undone: [], ordinary: [] });
  const handler = (r) => {
    const res = inner(r);
    if (r.method === "POST" && /\/students\/bulk$/.test(r.path) && /dry_run=true/.test(r.query) && res) {
      res.json.students.forEach((s) => { s.leave_undo = undone.includes(s.student_id) ? { undone: true, text: UNDO_TEXT, restored: [] } : ordinary.includes(s.student_id) ? { undone: false, text: ORDINARY, restored: [] } : null; });
    }
    return res;
  };
  const run = await H.openDrawer(ctx, handler, { width, user: who, props: { money: who === H.OWNER } });
  for (const first of chosen) await H.pick(run.page, first);
  return run;
}
const hintsIn = (page) => page.locator('[role="dialog"] [aria-label="Пояснение"], [role="tooltip"]').count();

test("«зачисляется обычным порядком»: the line in the row of the student and the server's sentence under it, whole - no «?», no bubble; it stays inside the window at 375", async () => {
  for (const width of [1280, 375]) {
    const run = await drawer(["Второй"], { ordinary: ["st8"], width });
    const p = run.page;
    await p.locator('[data-testid="enrol-note-rewrite"]').waitFor();
    assert.equal(await hintsIn(p), 0, "no «?»");
    assert.equal(plain(await p.locator('[data-testid="enrol-note-rewrite"] [data-testid="leave-undo-line"]').innerText()), "Зачисляется обычным порядком", "one student: his name is in the title, not in the row");
    assert.equal(plain(await p.locator('[data-testid="enrol-note-rewrite"] [data-testid="leave-undo-text"]').innerText()), plain(ORDINARY), "the sentence of the server as it is");
    const box = await p.locator('[data-testid="enrol-note-rewrite"]').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width + 0.5, `the row is inside the screen ${JSON.stringify(box)}`);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
    await p.close();
  }
});

test("rows: «зачисляется обычным порядком» and «вернётся как был» are rows with the NAME of their student and the words of the server; a student with nothing special has no row; no disclosure, no «?»", async () => {
  const run = await drawer(["Новый", "Второй", "Третий"], { undone: ["st9"], ordinary: ["st8", "st7"] });
  const p = run.page;
  await p.waitForSelector('[data-testid="enrol-note-rewrite"]');
  assert.equal(await p.locator('[data-testid="enrol-note-rewrite"]').count(), 2);
  assert.equal(await p.locator('[data-testid="enrol-note-undone"]').count(), 1);
  assert.match(plain(await p.locator('[data-testid="enrol-note-undone"]').innerText()), new RegExp(`^Новый Ученик ${plain(UNDO_TEXT).slice(0, 30)}`));
  assert.match(plain(await p.locator('[data-testid="enrol-note-rewrite"]', { hasText: "Второй" }).innerText()), /^Второй Ученик — зачисляется обычным порядком Ученика убрали сегодня, но после этого/);
  assert.equal(await p.locator('[role="dialog"] details').count(), 0);
  assert.equal(await p.locator('[data-testid="enrol-note-rewrite"]', { hasText: "Новый" }).count(), 0, "a student who comes back as he was is not «зачисляется обычным порядком»");
  assert.equal(await hintsIn(p), 0);
  assert.ok(!/уход отмен|Возврат обычный|возвращаются в день/i.test(plain(await p.getByRole("dialog").innerText())), "none of the old plates' sentences");
  await p.close();
});

test("past balances: a row of the student with the sum and «Выписка»; without the right to money - no sums, no link", async () => {
  const run = await drawer(["Новый"], { balances: { st9: [SAME] } });
  const row = run.page.locator('[data-testid="enrol-note-past"]');
  await row.waitFor();
  assert.equal(plain(await row.innerText()).replace(/\s/g, ""), "Долгспрошлогораза38000сум·вэтойжегруппе,ушёл17.11Выписка");
  assert.equal(await row.getByRole("link", { name: "Выписка" }).count(), 1);
  assert.ok(!/остался долг/.test(plain(await row.innerText())), "the server's text is not put into the row: the row is built from the fields");
  assert.equal(await hintsIn(run.page), 0);
  await run.page.close();
  const bare = { ...SAME }; delete bare.amount; bare.text = "Уже был в этой группе, ушёл 17.11.2026 — остался долг";
  const poor = await drawer(["Новый"], { balances: { st9: [bare] }, who: NO_MONEY });
  const prow = poor.page.locator('[data-testid="enrol-note-past"]');
  await prow.waitFor();
  assert.equal(await poor.page.getByRole("link", { name: "Выписка" }).count(), 0);
  assert.ok(!/\d{2,3} \d{3}/.test(plain(await poor.page.getByRole("dialog").innerText())), "no sum on the screen");
  await poor.page.close();
});

test("an old answer without `text` in the rows still draws (the compact row is built from the structure)", async () => {
  const old = { ...SAME }; delete old.text;
  const run = await drawer(["Новый"], { balances: { st9: [old] }, undone: [] });
  await run.page.locator('[data-testid="enrol-note-past"]').waitFor();
  assert.match(plain(await run.page.locator('[data-testid="enrol-note-past"]').innerText()), /^Долг с прошлого раза 38 000 сум · в этой же группе/);
  await run.page.close();
});
