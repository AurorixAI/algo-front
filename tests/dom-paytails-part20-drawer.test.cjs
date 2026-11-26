// PAY-TAILS Б11.54 (stage walk, day 2): the window «Зачислить учеников» of a group says, in the row of a student who comes BACK inside a period that is already in the account, the sentence of the server about it
// (`students[].billing.text` of the dry run of the bulk add).  The answer is the REAL one (tests/fixtures/paytails/part20/bulk_return_same_period.json, a byte copy of `paytails-r7/answers/`, head of the server 8136cf6): a student
// back after a forgiveness (`students[0]`) and a student added for the first time (`students[1]`).  The words on the screen are compared with the FIELDS of the answer - none is written into the test by hand.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { setup, plain } = require("./helpers/money2-w2.cjs");
const H = require("./helpers/enrol-v2.cjs");

const ctx = setup(test);
const answer = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "paytails", "part20", "bulk_return_same_period.json"), "utf8"));
const [BACK, FIRST] = answer.students;
const SNAPS = path.join(__dirname, "..", "..", "artifacts", "analysis", "paytails_front", "part20");
const RETURN_PREFIX = "Возврат в том же периоде";
assert.ok(BACK.billing.text.startsWith(RETURN_PREFIX) && !FIRST.billing.text.startsWith(RETURN_PREFIX) && BACK.leave_undo.undone === false && FIRST.leave_undo === null, "the fixture is the world of the test");

// a second student who comes back: the real entry of the first one with another id and the period of ANOTHER month in his own sentence (so that each row can be told from the other by its own field)
const SECOND_ID = "00000000-0000-4000-8000-000000000002";
const SECOND = { ...BACK, student_id: SECOND_ID, billing: { ...BACK.billing, text: BACK.billing.text.replace("ноябрь", "октябрь") }, past_balances: [] };
assert.notEqual(SECOND.billing.text, BACK.billing.text);

const NAMES = { [BACK.student_id]: ["Тимур", "Возвратов"], [FIRST.student_id]: ["Олег", "Новичков"], [SECOND_ID]: ["Азиза", "Повторова"] };
const LONG = { [BACK.student_id]: ["Мухаммадаминхужа", "Новоиспечённый-Подкрепляющийся"], [FIRST.student_id]: ["Лола", "Юсупова-Рахмонбердиева"], [SECOND_ID]: ["Дильноза", "Ахмедова-Каримова"] };

async function open(students, { width = 1280, names = NAMES } = {}) {
  const people = Object.entries(names).map(([id, [first, last]]) => H.STUDENT(id, first, last));
  const inner = H.server({ people });
  const handler = (r) => {
    const res = inner(r);
    if (r.method === "POST" && /\/students\/bulk$/.test(r.path) && /dry_run=true/.test(r.query)) {
      const chosen = students.filter((s) => r.body.student_ids.includes(s.student_id));
      return { json: { ...answer, students: chosen, added: chosen.length } };
    }
    return res;
  };
  const run = await H.openDrawer(ctx, handler, { width });
  const surname = (id) => names[id][1];
  return { run, pick: async (...ids) => { for (const id of ids) await H.pick(run.page, surname(id)); await run.page.waitForSelector('[data-testid="enrol-exceptions"]', { timeout: 5000 }).catch(() => null); await run.page.waitForTimeout(700); } };
}
const rowOf = (page, name) => page.locator('[data-testid="enrol-student-row"]', { hasText: name });
const sentences = (page) => page.locator('[data-testid="enrol-return-sentence"]');

for (const width of [1280, 375]) {
  test(`(${width}) a student who comes back in the same period: the sentence of the server is in HIS row, whole; the title is «зачисляется обычным порядком»; the student added for the first time has no such line`, async () => {
    const { run, pick } = await open([BACK, FIRST], { width });
    await pick(BACK.student_id, FIRST.student_id);
    const row = rowOf(run.page, "Возвратов");
    assert.equal(await row.count(), 1, "one row of the student");
    const text = plain(await row.innerText());
    assert.ok(text.includes(BACK.billing.text), `the sentence of the field billing.text is in the row: ${text}`);
    assert.ok(text.includes(BACK.leave_undo.text.replace(/ /g, " ")) || text.includes(plain(BACK.leave_undo.text)), "the refusal of the undoing (leave_undo.text) stays in the row");
    assert.match(text, /^Тимур Возвратов — Долг с прошлого раза 450 000 сум · в этой же группе, ушёл 25\.11 Выписка Зачисляется обычным порядком /, "the name once, the debt, then «Зачисляется обычным порядком» as a line of its own");
    assert.equal(await sentences(run.page).count(), 1, "one sentence in the window: the new student has none");
    assert.equal(plain(await rowOf(run.page, "Возвратов").locator('[data-testid="enrol-return-sentence"]').innerText()), BACK.billing.text);
    assert.equal(await rowOf(run.page, "Новичков").count(), 0, "a student added for the first time has no row of special things");
    const all = plain(await run.page.locator('[role="dialog"]').innerText());
    assert.ok(!/записывается\s+заново/i.test(all), "the old title is nowhere");
    assert.equal(all.split(RETURN_PREFIX).length - 1, 1, "the phrase of a return is said once");
    assert.equal(await run.page.locator('[role="dialog"] [aria-label="Пояснение"]').count(), 0, "no «?»");
    assert.ok(!/\d+\s+урок\S*\s+из/.test(all), `0 lessons of the answer are not written next to the sum: ${all}`);
    assert.match(all, /Тимур Возвратов — 100[\s\u00a0\u202f]000/);
    fs.mkdirSync(SNAPS, { recursive: true });
    await run.page.screenshot({ path: path.join(SNAPS, `bulk_return_same_period-${width}.png`) });
    await run.page.close();
  });
}

test("one student chosen, a first-time one: no sentence of a return anywhere", async () => {
  const { run, pick } = await open([BACK, FIRST]);
  await pick(FIRST.student_id);
  assert.equal(await sentences(run.page).count(), 0);
  assert.ok(!plain(await run.page.locator('[role="dialog"]').innerText()).includes(RETURN_PREFIX));
  await run.page.close();
});

test("one student chosen, who comes back: the sentence stands in the line of the only row, the title with a capital", async () => {
  const { run, pick } = await open([BACK, FIRST]);
  await pick(BACK.student_id);
  assert.equal(plain(await sentences(run.page).first().innerText()), BACK.billing.text);
  assert.ok(plain(await run.page.locator('[data-testid="enrol-note-rewrite"]').innerText()).startsWith("Зачисляется обычным порядком"));
  await run.page.close();
});

test("SEVERAL come back: each has his OWN sentence (read from his own field), in his own row", async () => {
  const { run, pick } = await open([BACK, FIRST, SECOND]);
  await pick(BACK.student_id, SECOND_ID, FIRST.student_id);
  assert.equal(await sentences(run.page).count(), 2);
  for (const [student, name] of [[BACK, "Возвратов"], [SECOND, "Повторова"]]) {
    const own = plain(await rowOf(run.page, name).locator('[data-testid="enrol-return-sentence"]').innerText());
    assert.equal(own, student.billing.text, name);
  }
  assert.notEqual(BACK.billing.text, SECOND.billing.text);
  assert.equal(await rowOf(run.page, "Новичков").count(), 0);
  await run.page.close();
});

test("long names at 375: the sentence wraps inside the window, nothing is cut or goes out", async () => {
  const { layoutProbe } = require("./helpers/layout-probe.cjs");
  const { run, pick } = await open([BACK, FIRST, SECOND], { width: 375, names: LONG });
  await pick(BACK.student_id, SECOND_ID, FIRST.student_id);
  assert.equal(await sentences(run.page).count(), 2);
  assert.deepEqual((await run.page.evaluate(layoutProbe, '[role="dialog"]')).bad, []);
  fs.mkdirSync(SNAPS, { recursive: true });
  await run.page.screenshot({ path: path.join(SNAPS, "bulk_return_same_period-375-long.png") });
  await run.page.close();
});
