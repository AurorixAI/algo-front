// PAY-TAILS, screens part 1 (package Б, Б2.1-Б2.3, Б2.7): the rules of the screens in pure functions - the contract of the tab «Аванс», the action of a row by its STATE, the band of the closed memberships, the tab order,
// the words of the right of the administrator.  The server's answers are the CONTRACT of Б1.1 / Б1.2 (tests/helpers/paytails-fixture.cjs: the only stub).  LESSONS 143, 151.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
require("./helpers/money1-env.cjs");
const root = path.join(__dirname, "..");
const P = require(path.join(root, "src/lib/payments.ts"));
const S = require(path.join(root, "src/lib/pay-state.ts"));
const T = require(path.join(root, "src/lib/paytails.ts"));
const SUM = require(path.join(root, "src/lib/payments-summary.ts"));
const A = require(path.join(root, "src/lib/membership-actions.ts"));
const X = require("./helpers/paytails-fixture.cjs");
const OLD = require("./helpers/paydue-fixture.cjs");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const N = (s) => String(s).replace(/[  ]/g, " ");
const norm = (row) => ({ ...row, debt: row.unpaid ?? 0 });

test("the tabs: «Должники · К оплате · Заканчивается оплата · Без долга · Аванс · На паузе»; «Аванс» is always there, «На паузе» only with somebody", () => {
  assert.deepEqual(P.visibleBuckets({ students_paused: 0 }, "debtors").map((b) => b.label), ["Должники", "К оплате", "Заканчивается оплата", "Без долга", "Аванс"]);
  assert.deepEqual(P.visibleBuckets({ students_paused: 2 }, "debtors").map((b) => b.label), ["Должники", "К оплате", "Заканчивается оплата", "Без долга", "Аванс", "На паузе"]);
  assert.equal(P.parseBucket("advance"), "advance");
  assert.equal(P.parseBucket("balances"), "debtors", "an unknown key still opens the most urgent tab");
  assert.equal(P.bucketTabLabel("Аванс", 5), "Аванс 5");
  assert.equal(P.bucketCount({ advance: 5 }, "advance"), 5);
});

test("the address keeps «Ушедшие» of the tab «Аванс» (left=1) and writes it nowhere else", () => {
  const url = (state) => P.paymentsListQueryString({ groupId: "", teacherId: "", q: "", page: 0, age: "", leftOnly: false, ...state });
  assert.equal(url({ bucket: "advance", leftOnly: true }), "?bucket=advance&left=1");
  assert.equal(url({ bucket: "advance" }), "?bucket=advance");
  assert.equal(url({ bucket: "debtors", leftOnly: true }), "?bucket=debtors", "only the advance has the filter");
  const params = (q) => new URLSearchParams(q);
  assert.equal(P.parsePaymentsListQuery(params("bucket=advance&left=1")).leftOnly, true);
  assert.equal(P.parsePaymentsListQuery(params("bucket=debtors&left=1")).leftOnly, false);
  assert.equal(P.parsePaymentsListQuery(params("bucket=advance")).leftOnly, false);
});

test("the summary: the numbers of the card and the tab «Аванс» are the server's (`advance_text`, `advance_left_students`, `buckets.advance`); an older server says nothing", () => {
  const old = SUM.summaryToState(OLD.SUMMARY);
  assert.equal(old.advanceText, null, "an older summary has no sub-line: the screen invents none");
  assert.equal(old.advanceLeftStudents, null);
  assert.equal(old.tabs.advance, 4, "an older server: the tab counts the students with an advance");
  const nobody = SUM.summaryToState(X.SUMMARY_NOBODY);
  assert.deepEqual([nobody.advanceText, nobody.tabs.advance], ["", 0]);
  const full = SUM.summaryToState(X.SUMMARY);
  assert.deepEqual([full.advanceText, full.advanceLeftStudents, full.tabs.advance, full.advanceTotal], ["5 учеников · из них 4 ушли", 4, 5, 748000]);
  assert.deepEqual(T.advanceSummaryOf(null), { students: null, leftStudents: null, text: null });
});

test("the card «Аванс»: the sub-line is the server's `advance_text` as it is; without it the plain count; empty text at zero", () => {
  const card = (over) => P.positionCards({ advance_total: 748000, students_with_advance: 5, ...over }).find((c) => c.key === "advance");
  assert.equal(card({ advance_text: "5 учеников · из них 4 ушли" }).sub, "5 учеников · из них 4 ушли");
  assert.equal(card({ advance_text: "5 учеников" }).sub, "5 учеников");
  assert.equal(card({ advance_text: "", advance_total: 0, students_with_advance: 0 }).sub, "", "nobody: no sub-line");
  assert.equal(card({}).sub, "5 учеников", "an older server: what the screen showed before");
  assert.equal(N(card({}).amount), "748 000 сум");
});

test("the label of a row of the tab «Аванс»: the server's `state_text` and `state_sub` («ушёл 28.10» / «оплачено до 31.12»), the green of the paid", () => {
  const closed = S.payLabel(X.YAHYO, "advance");
  assert.deepEqual([N(closed.text), closed.sub, closed.tone], ["Аванс 37 000 сум", "ушёл 28.10", "ok"]);
  const open = S.payLabel(X.ANVAR_ADV, "advance");
  assert.deepEqual([N(open.text), open.sub], ["Аванс 600 000 сум", "оплачено до 31.12"], "an open one: `tab_text` / `tab_sub`, while `state_text` of the same row says «Оплачено до 31.12»");
  assert.equal(N(S.payLabel(X.ANVAR_ADV, "worst").text), "Оплачено до 31.12", "every other list says `state_text`");
  assert.equal(S.payLabel({ ...X.YAHYO, tab_sub: null, state_sub: "не это" }, "advance").sub, null, "the server said nothing in `tab_sub` - nothing is shown, `state_sub` is not borrowed");
  assert.equal(S.payLabel(X.FERUZA, "debtors").sub, "ушёл 20.11 · просрочено 14 дней", "a debt keeps its own sub-line");
});

test("the action of a row by its STATE (Б2.2): closed + advance «Вернуть»; closed + debt / «к оплате» «Внести оплату»; closed + nothing - the statement only; open - «Внести оплату» and the advance in «⋯»", () => {
  const acts = (row, archived) => T.rowActionsOf(norm(row), archived);
  assert.deepEqual(acts(X.YAHYO), { pay: false, refund: true, menuRefund: false });
  assert.deepEqual(acts(X.FERUZA), { pay: true, refund: false, menuRefund: false });
  assert.deepEqual(acts(X.DILSHOD), { pay: true, refund: false, menuRefund: false });
  assert.deepEqual(acts(X.KAMOLA), { pay: false, refund: true, menuRefund: false });
  assert.deepEqual(acts(X.SETTLED_NONE), { pay: false, refund: false, menuRefund: false });
  assert.deepEqual(acts(X.ANVAR_ADV), { pay: true, refund: false, menuRefund: true });
  assert.deepEqual(acts(X.LOLA), { pay: true, refund: false, menuRefund: false });
  // a student in the archive: the same as a closed membership
  assert.deepEqual(acts(X.ANVAR_ADV, true), { pay: false, refund: true, menuRefund: false });
  // both a debt and an advance on a closed row cannot be (an advance is money): the debt leads, nothing the server would refuse is drawn
  assert.deepEqual(acts({ ...X.YAHYO, unpaid: 1000 }), { pay: true, refund: false, menuRefund: false });
});

test("the «⋯» menu keeps «Вернуть аванс» for an OPEN membership only; the closed one has the button of the row (the same window)", () => {
  const keys = (row, archived = false) => A.membershipActionKeys(norm(row), { archived });
  assert.deepEqual(keys(X.ANVAR_ADV), ["refund", "price", "opening"]);
  assert.deepEqual(keys(X.YAHYO), [], "closed, an advance: nothing in the menu - the row has «Вернуть»");
  assert.deepEqual(keys(X.FERUZA), ["writeoff"], "closed, a debt: the debt can still be forgiven");
  assert.deepEqual(keys(X.ANVAR_ADV, true), []);
});

test("the closed memberships of a group (Б1.2): ONE request `bucket=left_open`, the number is `left_count` of the server, the order is the server's - the screen filters and sorts nothing", () => {
  const body = read("src/lib/paytails-read.ts");
  assert.equal((body.match(/getPaymentsStatus\(/g) || []).length, 1, "one request");
  assert.match(body, /bucket: "left_open"/);
  assert.doesNotMatch(body, /debtors|to_pay|"advance"|leftOnly/, "no request per kind of settlement");
  assert.match(body, /leftCountOf\(result\)/, "the number of the band is `left_count`");
  assert.equal(T.leftCountOf({ left_count: 3 }), 3);
  assert.equal(T.leftCountOf({}), null);
  assert.equal(T.settledRowsOf, undefined, "the screen's own picking of the rows is gone");
});

test("one place reads the contract: the screens do not read `left_students`, `advance_text`, `advance_left_students` themselves", () => {
  const owners = new Set(["src/lib/paytails.ts", "src/lib/payments.ts"]);
  const hits = [];
  const walk = (dir) => { for (const f of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) { const rel = `${dir}/${f.name}`; if (f.isDirectory()) walk(rel); else if (/\.tsx?$/.test(f.name) && !owners.has(rel) && /left_students|advance_left_students|\.advance_text|buckets\??\.advance/.test(read(rel))) hits.push(rel); } };
  walk("src");
  assert.deepEqual(hits, [], "the contract is read only in lib/paytails.ts (types in lib/payments.ts)");
});

test("the screens: the card «Аванс» leads to its tab, the closed row has «Вернуть», the band of the group, the right of the administrator in the words of the layout", () => {
  const page = read("src/components/payments/payments-page.tsx");
  assert.match(page, /bucket=advance#payments-list/);
  assert.doesNotMatch(page, /#advance/);
  assert.match(page, /rowActionsOf/);
  const tab = read("src/components/groups/group-payments-tab.tsx");
  assert.match(tab, /SETTLED_BAND_TITLE/);
  assert.match(tab, /fetchGroupSettled/);
  assert.match(tab, /useState\(false\)/, "the band is folded by default");
  const settings = read("src/app/owner/settings/page.tsx");
  assert.ok(settings.includes("Администратор работает с деньгами"));
  assert.ok(settings.includes("Принимает оплаты, исправляет и отменяет их, прощает суммы, возвращает деньги, меняет цены групп и остатки на начало. Зарплата остаётся скрытой."));
  assert.doesNotMatch(settings, /Администратор может вносить оплаты/);
});
