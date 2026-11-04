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
  { id: "f4", orgId: "o2", orgName: "Бета", invariant: "I-4", what: "в закрытом месяце остался неразобранный урок", subjectKey: "closed-open-lessons:t1:2026-10", subjectId: "t1", month: "2026-10", expected: 0, actual: 2, details: { lessons: ["2026-10-12|g1", "2026-10-14|g2"] }, isNew: false },
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
  assert.deepEqual(M.INVARIANTS.map((i) => i.label), ["Долг и оплаты", "«Оплачено до»", "Сохранённые ведомости", "Закрытые месяцы"]);
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
