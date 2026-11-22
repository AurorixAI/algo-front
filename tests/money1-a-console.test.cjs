// «Деньги-1», пакет А (front), part 4 - the console (item 11): the section «Сверка денег» (right `audit.view`): the last runs, the divergences of the newest one (centre, invariant, sums, month),
// no name of a person.  Contract: GET /api/v1/platform/money-reconcile of MONEY1_A_SERVER_REPORT.md.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const env = require("./helpers/money1-env.cjs");
const { React, html, textOf, read, root, plain } = env;
const C = (name) => require(path.join(root, "console/src/lib", name));
const M = C("money-reconcile.ts");
const perms = C("permissions.ts");
const { createConsoleApi } = C("api.ts");
const { MoneyReconcileView, FindingDetail } = require(path.join(root, "console/src/components/money-reconcile.tsx"));

const ME = (over = {}) => ({ user: { id: "u1", email: "o@algolab.me", first_name: "А", last_name: "Д", name: "А Д" }, role: { id: "r1", name: "Роль" }, is_owner: false, permissions: [], must_change_password: false, totp_enabled: false, session: { expires_at: "2026-11-06T01:00:00Z" }, ...over });

const RUN = (over = {}) => ({ id: "r1", startedAt: "2026-11-05T21:10:00", finishedAt: "2026-11-05T21:12:00", status: "findings", centresChecked: 12, findings: 4, newFindings: 2, mail: "sent", error: null, ...over });
const FINDINGS = [
  { id: "f1", orgId: "o1", orgName: "Центр «Альфа»", invariant: "I-1", what: "долг, начислено и оплачено не сходятся", subjectKey: "membership:m1", subjectId: "m1", month: null, expected: 300000, actual: 250000, details: { what: "identity", charged: 500000, paid: 200000 }, isNew: true },
  { id: "f2", orgId: "o1", orgName: "Центр «Альфа»", invariant: "I-2", what: "«оплачено до» изменилось без записи в журнале", subjectKey: "membership:m2", subjectId: "m2", month: null, expected: null, actual: null,
    details: { covered_through: ["2026-10-31", "2026-11-15"], lessons_covered: [8, 12], paid: [800000, 800000] }, isNew: false },
  { id: "f3", orgId: "o2", orgName: "Бета", invariant: "I-3", what: "в сохранённой ведомости зарплата не сходится с уроками", subjectKey: "sheet-total:s1", subjectId: "s1", month: "2026-10", expected: 475000, actual: 500000, details: { what: "total" }, isNew: true },
  { id: "f4", orgId: "o2", orgName: "Бета", invariant: "I-4", what: "в закрытом месяце остался урок без отметки", subjectKey: "closed-open-lessons:t1:2026-10", subjectId: "t1", month: "2026-10", expected: 0, actual: 2, details: { lessons: ["2026-10-12|g1", "2026-10-14|g2"] }, isNew: false },
];
const DATA = { runs: [RUN(), RUN({ id: "r0", status: "clean", findings: 0, newFindings: 0, mail: "skipped", startedAt: "2026-11-04T21:10:00" }), RUN({ id: "rx", status: "failed", findings: 0, newFindings: 0, mail: "failed", error: "не удалось проверить центров: 2" })], latest: RUN(), findings: FINDINGS };

test("the section is in the menu for «audit.view» only, after «Журнал»", () => {
  assert.deepEqual(perms.visibleNav(ME({ is_owner: true })).map((i) => i.label), ["Заявки", "Обращения", "Центры", "Пользователи", "Команда", "Роли", "Журнал", "Сверка денег"]);
  const auditor = ME({ permissions: ["audit.view"] });
  assert.deepEqual(perms.visibleNav(auditor).map((i) => i.key), ["audit", "money"]);
  assert.equal(perms.visibleNav(auditor).find((i) => i.key === "money").href, "/money-reconcile/");
  assert.deepEqual(perms.visibleNav(ME({ permissions: ["requests.view", "orgs.view"] })).map((i) => i.key), ["requests", "centres"], "no section without the right");
  assert.equal(perms.activeNav("/money-reconcile/"), "money");
  assert.equal(perms.activeNav("/money-reconcile"), "money");
  assert.match(read("console/src/components/shell.tsx"), /money: Scale,/);
});

test("the client: GET /api/v1/platform/money-reconcile?limit=30 with the cookie of the session, nothing else", async () => {
  const calls = [];
  const api = createConsoleApi({ fetchImpl: async (url, init = {}) => { calls.push({ url: String(url), method: init.method || "GET", credentials: init.credentials }); return new Response(JSON.stringify(DATA), { status: 200, headers: { "Content-Type": "application/json" } }); } });
  const out = await api.moneyReconcile.get();
  assert.equal(out.findings.length, 4);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/v1\/platform\/money-reconcile\?limit=30$/);
  assert.deepEqual([calls[0].method, calls[0].credentials], ["GET", "include"]);
});

test("the words: the status of a run, the letter, the invariants", () => {
  assert.deepEqual(M.runStatus("clean"), { label: "Всё сошлось", tone: "green" });
  assert.deepEqual(M.runStatus("findings"), { label: "Есть расхождения", tone: "amber" });
  assert.deepEqual(M.runStatus("failed"), { label: "Сбой проверки", tone: "red" });
  assert.deepEqual(M.runStatus("running"), { label: "Идёт", tone: "blue" });
  assert.equal(M.runStatus("weird").label, "weird");
  assert.equal(M.mailLabel("sent").label, "Письмо команде отправлено");
  assert.equal(M.mailLabel("skipped").label, "Письмо не нужно: нового нет");
  assert.deepEqual(M.mailLabel("failed"), { label: "Письмо не ушло", tone: "red" });
  assert.equal(M.mailLabel(null).label, "—");
  assert.deepEqual(M.INVARIANTS.map((i) => i.label), ["Долг и оплаты", "«Оплачено до»", "Сохранённые ведомости", "Закрытые месяцы", "Записи мимо журнала", "Пробные записи"]);
  assert.equal(M.invariantLabel("I-3"), "Сохранённые ведомости");
  assert.equal(M.invariantLabel("I-9"), "I-9");
});

test("how much: every invariant says what does not add up in its own words (sums, dates, counts)", () => {
  const by = (id) => FINDINGS.find((f) => f.id === id);
  assert.equal(plain(M.findingAmount(by("f1"))), "По начислениям и оплатам 300 000 сум · по долгу и авансу 250 000 сум");
  assert.equal(M.findingAmount(by("f2")), "Оплачено до 31.10.2026 → 15.11.2026");
  assert.equal(plain(M.findingAmount(by("f3"))), "Строки 475 000 сум · итог 500 000 сум");
  assert.equal(M.findingAmount(by("f4")), "Неразобранных уроков: 2");
  assert.equal(M.findingAmount({ invariant: "I-3", expected: 0, actual: 3, details: { what: "not_held" } }), "Оплачено уроков, которых не было: 3");
  assert.equal(M.findingAmount({ invariant: "I-2", expected: null, actual: null, details: { covered_through: ["2026-10-31", "2026-10-31"], lessons_covered: [8, 12], paid: [1, 1] } }), "Оплаченных уроков 8 → 12");
  assert.equal(plain(M.findingAmount({ invariant: "I-2", expected: null, actual: null, details: { covered_through: ["2026-10-31", "2026-10-31"], lessons_covered: [8, 8], paid: [800000, 1000000] } })), "Оплаты 800 000 сум → 1 000 000 сум");
  assert.equal(M.findingAmount({ invariant: "I-2", expected: null, actual: null, details: null }), "—");
  assert.equal(M.findingMonth(by("f3")), "Октябрь 2026");
  assert.equal(M.findingMonth(by("f1")), "—");
  assert.match(M.runSummary(RUN()), /^06\.11\.2026 02:10 · /, "the clock of Tashkent, not of UTC");
  assert.match(M.runSummary(RUN()), /проверено центров: 12 · расхождений: 4, новых: 2$/);
  assert.match(M.runSummary(RUN({ findings: 0, newFindings: 0 })), /расхождений нет$/);
});

test("the list of divergences: new ones first, then by centre; the filter by the invariant; the facts of the server's details, in words", () => {
  const all = M.visibleFindings(FINDINGS, "");
  assert.deepEqual(all.map((f) => f.id), ["f3", "f1", "f4", "f2"], "new first, then the earlier ones; each group by the name of the centre");
  assert.deepEqual(M.visibleFindings(FINDINGS, "I-3").map((f) => f.id), ["f3"]);
  assert.deepEqual(M.visibleFindings(FINDINGS, "I-9"), []);
  assert.deepEqual(FINDINGS.map((f) => f.id), ["f1", "f2", "f3", "f4"], "the answer of the server is not reordered in place");
  const facts = (id) => M.findingFacts(FINDINGS.find((f) => f.id === id)).map((row) => `${row.label}: ${plain(row.value)}`);
  assert.deepEqual(facts("f2"), ["Оплаченных уроков: 8 → 12"], "«Сколько» says «оплачено до»; the facts add only what else moved (not what stood still)");
  assert.deepEqual(M.findingFacts({ invariant: "I-2", details: { covered_through: ["2026-10-31", "2026-10-31"], lessons_covered: [8, 12], paid: [800000, 1000000] } }).map((row) => `${row.label}: ${plain(row.value)}`), ["Сумма оплат: 800 000 сум → 1 000 000 сум"]);
  assert.deepEqual(facts("f1"), ["Начислено: 500 000 сум", "Оплачено: 200 000 сум"]);
  assert.deepEqual(facts("f4"), ["Уроки (дата и группа): 2026-10-12|g1; 2026-10-14|g2"]);
});

test("the page: the newest run in one line (status, letter, centres, divergences), the table of divergences, the table of the last runs - and the way into the centre", () => {
  const draw = (props = {}) => html(React.createElement(MoneyReconcileView, { data: DATA, loading: false, refreshing: false, error: null, onReload() {}, ...props }));
  const markup = draw();
  const text = textOf(markup);
  for (const part of ["Сверка денег", "Центры расхождений не видят, имена людей сюда не попадают", "Последняя проверка", "Есть расхождения", "Письмо команде отправлено", "проверено центров: 12 · расхождений: 4, новых: 2",
    "Расхождения последней проверки", "Центр «Альфа»", "Долг и оплаты", "долг, начислено и оплачено не сходятся", "По начислениям и оплатам 300 000 сум · по долгу и авансу 250 000 сум", "Октябрь 2026", "Новое", "Было и раньше",
    "Последние проверки", "Всё сошлось", "Сбой проверки", "не удалось проверить центров: 2", "Письмо не ушло", "Обновить"]) assert.ok(text.includes(part), part);
  assert.match(markup, /data-testid="money-latest-summary"/);
  assert.equal((markup.match(/<tr[^>]*aria-selected|<table/g) || []).filter((x) => x.startsWith("<table")).length, 2, "two tables");
  // a clean newest run: «Расхождений нет», no filter
  const clean = textOf(draw({ data: { runs: [RUN({ status: "clean", findings: 0, newFindings: 0, mail: "skipped" })], latest: RUN({ status: "clean", findings: 0, newFindings: 0, mail: "skipped" }), findings: [] } }));
  assert.ok(clean.includes("Расхождений нет") && clean.includes("Последняя проверка: всё сошлось"), clean);
  assert.doesNotMatch(draw({ data: { runs: [RUN({ status: "clean", findings: 0, newFindings: 0 })], latest: RUN({ status: "clean", findings: 0, newFindings: 0 }), findings: [] } }), /aria-label="Что не сошлось"/, "no filter over an empty list");
  assert.match(markup, /aria-label="Что не сошлось"/, "the filter over a list that has divergences");
  // never run: the empty state
  assert.ok(textOf(draw({ data: { runs: [], latest: null, findings: [] } })).includes("Проверок ещё не было"));
  assert.ok(textOf(draw({ data: null, loading: true })).includes("Загрузка…"));
  const failed = draw({ data: null, error: "Сервис недоступен" });
  assert.ok(textOf(failed).includes("Сервис недоступен"));
  assert.match(failed, /Повторить/);
  // a run that failed: the error in red
  assert.match(draw({ data: { ...DATA, latest: RUN({ status: "failed", findings: 0, newFindings: 0, error: "не удалось проверить центров: 2" }) } }), /role="alert"[^>]*>[^<]*не удалось проверить центров: 2/);
});

test("the open divergence: the centre is a link to its card, the object is an id (no name of a person), the state says new / earlier, the facts follow", () => {
  const markup = html(React.createElement(FindingDetail, { finding: FINDINGS[0] }));
  const text = textOf(markup);
  assert.match(markup, /<a[^>]*href="\/centres\/?\?id=o1"[^>]*>Центр «Альфа»</);
  for (const part of ["Долг и оплаты (I-1)", "По начислениям и оплатам 300 000 сум · по долгу и авансу 250 000 сум", "m1", "Новое: в прошлой проверке этого центра не было", "Начислено", "500 000 сум"]) assert.ok(text.includes(part), part);
  assert.ok(textOf(html(React.createElement(FindingDetail, { finding: FINDINGS[1] }))).includes("Было и в прошлой проверке"));
  const withMonth = textOf(html(React.createElement(FindingDetail, { finding: FINDINGS[2] })));
  assert.ok(withMonth.includes("Октябрь 2026") && withMonth.includes("Строки 475 000 сум · итог 500 000 сум"));
});

test("the screen asks nothing without the right; the section is a static page of the console like the others", () => {
  const screen = read("console/src/components/money-reconcile.tsx");
  assert.match(screen, /const allowed = can\(me, "audit\.view"\);/);
  assert.match(screen, /useResource\(allowed \? \(signal\) => consoleApi\.moneyReconcile\.get\(30, signal\) : null, \[allowed\]\)/);
  assert.match(screen, /if \(!allowed\) return <Panel><EmptyState title="Нет доступа"/);
  assert.match(read("console/src/app/(panel)/money-reconcile/page.tsx"), /MoneyReconcileScreen/);
  assert.match(read("console/src/lib/api.ts"), /moneyReconcile: \{\s*get: \(limit = 30, signal\?: AbortSignal\) => get<MoneyReconcile>\("\/money-reconcile", \{ limit \}, signal\),/);
  // personal data: the screen reads ids, months and sums - it names no field of a person
  assert.doesNotMatch(screen, /\.(email|phone|first_name|last_name|full_name|student_name|teacher_name)\b/);
});

// ── R3 M3: every kind of divergence says its OWN pair of facts, in its own units ────────────────────────
// `tests/fixtures/money-reconcile/findings.json` is made by the REAL pure checks of the server (`money_reconcile.py`, scratchpad/gen_reconcile_fixtures.py), not by hand.
const KINDS = require(path.join(root, "tests/fixtures/money-reconcile/findings.json")).findings;
const kindOf = (finding) => `${finding.invariant}/${finding.details.what ?? "-"}`;
const FIXTURE_LABELS = {
  "I-1/identity": "По начислениям и оплатам 300 000 сум · по долгу и авансу 250 000 сум",
  "I-1/statement": "По долгу и авансу -250 000 сум · итог выписки -300 000 сум",
  "I-1/paid_rows": "Оплаты по записям 250 000 сум · в расчёте 200 000 сум",
  "I-1/refund_rows": "Возвраты по записям 40 000 сум · в расчёте 0 сум",
  "I-1/outflow_exceeds_inflow": "Пришло 100 000 сум · ушло 450 000 сум",
  "I-1/writeoff_exceeds_charged": "Начислено 300 000 сум · прощено 350 000 сум",
  "I-2/-": "Оплачено до 31.10.2026 → 15.11.2026",
  "I-3/total": "Строки 475 000 сум · итог 600 000 сум",
  "I-3/not_held": "Оплачено уроков, которых не было: 1",
  "I-3/line_without_marks": "Строк без оплаченных отметок: 1",
  "I-3/drift": "Сохранено 475 000 сум · сейчас считается 600 000 сум (изменилось на +125 000 сум)",
  "I-4/-": "Неразобранных уроков: 2",
};

test("R3 M3: the fixture holds every kind the server has (6 of I-1, I-2, 4 of I-3, I-4) - the count is checked, a missing kind cannot pass unseen", () => {
  assert.equal(KINDS.length, 12);
  assert.deepEqual(KINDS.map(kindOf).sort(), Object.keys(FIXTURE_LABELS).sort());
  assert.deepEqual(M.KNOWN_KINDS.sort(), ["drift", "identity", "line_without_marks", "not_held", "outflow_exceeds_inflow", "paid_rows", "refund_rows", "statement", "total", "writeoff_exceeds_charged"], "the ten kinds of I-1 and I-3");
});

for (const kind of Object.keys(FIXTURE_LABELS)) {
  test(`R3 M3: «${kind}» is worded by its own facts`, () => {
    const finding = KINDS.find((item) => kindOf(item) === kind);
    assert.ok(finding, `the fixture has ${kind}`);
    assert.equal(plain(M.findingAmount(finding)).replace(/−/g, "-"), FIXTURE_LABELS[kind]);
  });
}

test("R3 M3: no sum is named a number of lessons and no count is named a sum; a kind of the future is shown by its numbers, never by a wrong unit", () => {
  const sums = KINDS.filter((item) => ["I-1/identity", "I-1/statement", "I-1/paid_rows", "I-1/refund_rows", "I-1/outflow_exceeds_inflow", "I-1/writeoff_exceeds_charged", "I-3/total", "I-3/drift"].includes(kindOf(item)));
  const counts = KINDS.filter((item) => ["I-3/not_held", "I-3/line_without_marks", "I-4/-"].includes(kindOf(item)));
  assert.equal(sums.length, 8);
  assert.equal(counts.length, 3);
  for (const item of sums) assert.match(plain(M.findingAmount(item)), /сум/, kindOf(item));
  for (const item of sums) assert.doesNotMatch(M.findingAmount(item), /уроков|Уроков/, `${kindOf(item)}: a sum is not a number of lessons`);
  for (const item of counts) assert.doesNotMatch(plain(M.findingAmount(item)), /сум/, `${kindOf(item)}: a count is not a sum`);
  assert.equal(M.findingAmount({ invariant: "I-3", expected: 5, actual: 7, details: { what: "some_new_kind" } }), "Ожидалось 5 · найдено 7");
  assert.equal(M.findingAmount({ invariant: "I-1", expected: null, actual: 7, details: {} }), "Ожидалось — · найдено 7");
  // the drift of an earlier server (no `changedBy`) still reads
  assert.equal(plain(M.findingAmount({ invariant: "I-3", expected: 600000, actual: 475000, details: { what: "drift" } })), "Сохранено 475 000 сум · сейчас считается 600 000 сум");
});

test("R3 M3: the stable key of a divergence is the centre, the invariant and the subject (not the id of a run)", () => {
  assert.equal(M.findingKey({ orgId: "o1", invariant: "I-3", subjectKey: "sheet-drift:s1" }), "o1|I-3|sheet-drift:s1");
});

// ── PAY-TAILS Б9.8 / Б10: the kind I-6 «пробная запись меняет счёт неверно» - the sentence of the server instead of a pair of sums ───────────
const SENTENCE = "Проба оплаты 1 000 сум сегодня увеличила долг: было 500 000 сум, стало 599 000 сум";
const draw = (props = {}) => html(React.createElement(MoneyReconcileView, { data: DATA, loading: false, refreshing: false, error: null, onReload() {}, ...props }));
const I6 = (over = {}) => ({ id: "f6", orgId: "o3", orgName: "Центр «Гамма»", invariant: "I-6", what: "пробная запись меняет счёт не так, как должна", subjectKey: "membership:m6:pay_today:debt_grows", subjectId: "m6", month: null, expected: 500000, actual: 599000, text: SENTENCE, details: { probe: "pay_today", rule: "debt_grows", text: SENTENCE }, isNew: true, ...over });

test("I-6: the kind is in the list of kinds, with a label in the tone of the others; the filter keeps only it", () => {
  assert.deepEqual(M.INVARIANTS.map((item) => item.value), ["I-1", "I-2", "I-3", "I-4", "I-5", "I-6"]);
  assert.equal(M.invariantLabel("I-6"), "Пробные записи", "a noun, as «Долг и оплаты»: the grey line under it is the sentence of the server");
  assert.equal(M.invariantLabel("I-5"), "Записи мимо журнала");
  assert.deepEqual(M.visibleFindings([...FINDINGS, I6()], "I-6").map((item) => item.id), ["f6"]);
  assert.equal(M.visibleFindings([...FINDINGS, I6()], "").length, 5);
  const markup = draw({ data: { ...DATA, findings: [...FINDINGS, I6()] } });
  assert.ok(textOf(markup).includes("Пробные записи"), "the option / the row names the kind");
});

test("I-6: the row and the card show the ready sentence of the server (top-level `text`, else `details.text`), not a pair of sums; no sentence - the pair as before", () => {
  assert.equal(plain(M.findingAmount(I6())), SENTENCE);
  assert.equal(plain(M.findingAmount(I6({ text: undefined }))), SENTENCE, "details.text when the top level has none");
  assert.equal(plain(M.findingAmount(I6({ text: "  ", details: { probe: "x" } }))), "500 000 сум → 599 000 сум", "no sentence: the fallback of the pair");
  assert.equal(M.findingAmount(I6({ text: null, expected: null, actual: null, details: null })), "—");
  const row = textOf(draw({ data: { ...DATA, findings: [I6()] } }));
  assert.ok(plain(row).includes(SENTENCE), row);
  assert.doesNotMatch(plain(row), /500 000 сум → 599 000 сум/, "no pair next to the sentence");
  const card = textOf(html(React.createElement(FindingDetail, { finding: I6() })));
  assert.ok(plain(card).includes(SENTENCE) && card.includes("Пробные записи (I-6)") && card.includes("Новое: в прошлой проверке этого центра не было"), card);
  // the sentence wraps (a long one does not push the page wide): the RENDERED cell «Сколько» of I-6 and I-5 holds the sentence / the label in a wrapping box, never `whitespace-nowrap`;
  // since PAY-TAILS Б11.21 п.9 every kind wraps in this cell (the status column is no longer cut), so the pair of sums of another kind stands in the same wrapping box
  const cells = (rows) => [...draw({ data: { ...DATA, findings: rows } }).matchAll(/<span class="([^"]*)" data-testid="money-amount">(.*?)<\/span>/g)].map((m) => ({ cls: m[1], text: plain(textOf(m[2])) }));
  const [i6] = cells([I6()]);
  assert.equal(i6.text, SENTENCE);
  assert.match(i6.cls, /\bbreak-words\b/);
  assert.doesNotMatch(i6.cls, /whitespace-nowrap/);
  const [i5] = cells([I5[0]]);
  assert.equal(i5.text, I5_LABELS[I5[0].details.code]);
  assert.match(i5.cls, /\bbreak-words\b/);
  assert.doesNotMatch(i5.cls, /whitespace-nowrap/);
  const pair = cells([I6({ text: "  ", details: { probe: "x" } })]);
  assert.equal(pair[0].text, "500 000 сум → 599 000 сум", "no sentence: the pair stands in the same cell");
  assert.match(pair[0].cls, /\bbreak-words\b/);
});

// ── PAY-TAILS Б9.9: the kind I-5 «запись денег изменена, удалена или отменена мимо журнала» - the fixture is in the form of the server (Found -> the router: was / now = expected / actual, `details.what` = the words of the code) ───
const I5 = require(path.join(root, "tests/fixtures/money-reconcile/findings-i5.json")).findings;
const I5_LABELS = {
  changed: "Запись изменена на месте · было 300 000 сум → стало 250 000 сум",
  deleted: "Запись удалена · было 40 000 сум → стало —",
  no_journal: "Запись отменена без строки в журнале · было — → стало 300 000 сум",
  foreign: "Запись не своего участия",
};

test("I-5: the label is in the list and in the filter, the filter keeps only I-5 (and I-6 stays apart)", () => {
  assert.equal(M.INVARIANTS.find((item) => item.value === "I-5").label, "Записи мимо журнала");
  assert.deepEqual(M.visibleFindings([...FINDINGS, ...I5, I6()], "I-5").map((item) => item.id).sort(), ["f51", "f52", "f53", "f54"]);
  assert.deepEqual(M.visibleFindings([...FINDINGS, ...I5, I6()], "I-6").map((item) => item.id), ["f6"]);
  const markup = draw({ data: { ...DATA, findings: [...FINDINGS, ...I5, I6()] } });
  assert.ok(textOf(markup).includes("Записи мимо журнала") && textOf(markup).includes("Пробные записи"));
});

for (const row of I5) {
  test(`I-5 (${row.details.code}): the row says what happened to the record and its sums; the card says it too`, () => {
    assert.equal(plain(M.findingAmount(row)), I5_LABELS[row.details.code]);
    const list = plain(textOf(draw({ data: { ...DATA, findings: [row] } })));
    assert.ok(list.includes("Записи мимо журнала") && list.includes(I5_LABELS[row.details.code]), list);
    const card = plain(textOf(html(React.createElement(FindingDetail, { finding: row }))));
    assert.ok(card.includes("Записи мимо журнала (I-5)") && card.includes(I5_LABELS[row.details.code]) && card.includes(row.subjectId), card);
  });
}

test("I-5: the card says the kind of the record in the words of the app next to its number; an unknown kind has no word (never English); other invariants have none", () => {
  const WORDS = { payment: "Оплата", refund: "Возврат", writeoff: "Прощение долга", opening: "Остаток на начало", transfer: "Перевод ученика", payout: "Выплата преподавателю", rate: "Ставка преподавателя" };
  for (const [kind, word] of Object.entries(WORDS)) assert.deepEqual(M.findingObject({ invariant: "I-5", details: { kind }, subjectId: "id1", subjectKey: "k" }), { word, id: "id1" });
  assert.deepEqual(M.findingObject({ invariant: "I-5", details: { kind: "something_new" }, subjectId: null, subjectKey: "k" }), { word: null, id: "k" });
  assert.deepEqual(M.findingObject({ invariant: "I-5", details: null, subjectId: "id1", subjectKey: "k" }), { word: null, id: "id1" });
  assert.equal(M.findingObject({ invariant: "I-2", details: { kind: "payment" }, subjectId: "id1", subjectKey: "k" }).word, null);
  const card = plain(textOf(html(React.createElement(FindingDetail, { finding: I5[0] }))));
  assert.ok(card.includes(`Оплата · ${I5[0].subjectId}`), card);
  const refund = plain(textOf(html(React.createElement(FindingDetail, { finding: I5[1] }))));
  assert.ok(refund.includes(`Возврат · ${I5[1].subjectId}`), refund);
});

test("the subtitle of the page: one sentence of what is done and who sees it, no list of the kinds", () => {
  assert.equal(M.MONEY_PAGE_SUBTITLE, "Каждую ночь сервер сверяет деньги всех центров. Центры расхождений не видят, имена людей сюда не попадают.");
});

test("I-5: a finding with no words and no sums reads as a dash, never as «undefined»", () => {
  assert.equal(M.findingAmount({ invariant: "I-5", expected: null, actual: null, details: null }), "—");
});
