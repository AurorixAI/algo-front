/**
 * UX-1 stream A «Оплаты»: the one Russian plural of the project, the human status words («Просрочено на 31 день»,
 * «Осталось 5 дней», «Оплачено» + «оплачено до …»), the context-aware main button, the counters of every tab, the price
 * line of the student card, and the source contracts of the screens (no ALL-CAPS headers, no «дн.», a tab bar that scrolls).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
};
const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
/** Normal spaces instead of the non-breaking ones: what the user reads. */
const plain = (text) => text.replace(/[  ]/g, " ");

const plural = require(path.join(root, "src/lib/plural.ts"));
const rules = require(path.join(root, "src/lib/payments.ts"));
const G = require(path.join(root, "src/lib/group-price.ts"));
const { pluralRu } = plural;

// ── pluralRu ──────────────────────────────────────────────────────────────────

test("pluralRu: one / few / many for days, in both call shapes", () => {
  const cases = [
    [0, "дней"], [1, "день"], [2, "дня"], [3, "дня"], [4, "дня"], [5, "дней"], [9, "дней"], [10, "дней"],
    [11, "дней"], [12, "дней"], [13, "дней"], [14, "дней"], [15, "дней"], [19, "дней"], [20, "дней"],
    [21, "день"], [22, "дня"], [24, "дня"], [25, "дней"], [31, "день"], [100, "дней"], [101, "день"], [111, "дней"], [112, "дней"], [121, "день"],
  ];
  for (const [n, word] of cases) {
    assert.equal(pluralRu(n, "день", "дня", "дней"), word, `${n} (separate forms)`);
    assert.equal(pluralRu(n, ["день", "дня", "дней"]), word, `${n} (a list of forms)`);
  }
  assert.equal(pluralRu(-1, "день", "дня", "дней"), "день"); // the sign is not a form
  assert.equal(pluralRu(-12, "день", "дня", "дней"), "дней");
  assert.equal(pluralRu(2.9, "день", "дня", "дней"), "дня"); // a fraction is read as the whole part
  for (const odd of [Number.NaN, Number.POSITIVE_INFINITY, undefined]) assert.equal(pluralRu(odd, "день", "дня", "дней"), "дней");
});

test("pluralRu is ONE helper: payments and the diagnostic report re-export it, nobody else defines a plural", () => {
  assert.equal(rules.pluralRu, pluralRu);
  assert.equal(require(path.join(root, "src/lib/diagnostic-report.ts")).pluralRu, pluralRu);
  const defining = walk(path.join(root, "src"))
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => /function pluralRu\b|const pluralRu\b/.test(fs.readFileSync(file, "utf8")))
    .map((file) => path.relative(root, file).replace(/\\/g, "/"));
  assert.deepEqual(defining, ["src/lib/plural.ts"]);
});

test("daysLabel: the number with the right word", () => {
  assert.deepEqual([1, 2, 5, 11, 21, 31].map(plural.daysLabel), ["1 день", "2 дня", "5 дней", "11 дней", "21 день", "31 день"]);
  assert.equal(plural.daysWord(3), "дня");
});

// ── status words ──────────────────────────────────────────────────────────────

const calendar = { period_mode: "calendar", paid_until: "2026-09-19", days_overdue: null, days_left: null, lessons_total: null, lessons_left: null };

test("status label: the days and the lessons agree in number in the SERVER's words; the screen forms none (PAY-DUE 143)", () => {
  assert.equal(rules.statusLabel, undefined);
  const PS = require(path.join(__dirname, "../src/lib/pay-state.ts"));
  // «просрочено N дней» / «Осталось N урока» are the server's (`debt_sub`, `state_text`): the screen shows them as they are and adds nothing
  for (const sub of ["просрочено 1 день", "просрочено 2 дня", "просрочено 5 дней", "просрочено 21 день"]) {
    const label = PS.payLabel({ state: "debt", debt_amount: 1, debt_text: "Долг 1 сум", debt_sub: sub, state_text: "Долг 1 сум" }, "debtors");
    assert.equal(label.sub, sub);
    assert.doesNotMatch(label.sub, /дн\./);
  }
  assert.equal(PS.payLabel({ state: "expiring", state_text: "Осталось 1 урок" }).text, "Осталось 1 урок");
});

test("status: the label says the state, the line under it the term - both the server's; the tones are one table", () => {
  const PS = require(path.join(__dirname, "../src/lib/pay-state.ts"));
  const label = PS.payLabel({ state: "paid", state_text: "Оплачено до 19.09" }, "active");
  assert.deepEqual([label.text, label.sub, label.tone], ["Оплачено до 19.09", null, "ok"], "the date is in the label: no second line repeats it");
  const debt = PS.payLabel({ state: "debt", debt_amount: 5, debt_text: "Долг 5 сум", debt_sub: "просрочено 31 день · оплачено до 19.09", state_text: "Долг 5 сум" }, "debtors");
  assert.deepEqual([debt.text, debt.sub, debt.tone], ["Долг 5 сум", "просрочено 31 день · оплачено до 19.09", "danger"]);
  assert.equal(PS.payLabel({ state: "none", state_text: null }, "active").text, null);
  // tone: red only for a debt, blue for «К оплате», amber for «ends soon», green for paid, grey for the rest
  assert.deepEqual(["debt", "to_pay", "expiring", "paid", "none"].map((state) => PS.payStateTone(state)), ["danger", "due", "warn", "ok", "neutral"]);
  assert.equal(rules.statusTone("expired"), "danger");     // the bar of a package keeps its own tone function
});

test("tabs by money: «Должники», «К оплате», «Заканчивается оплата», «Без долга» and a counter on every tab", () => {
  assert.equal(rules.PAYMENT_BUCKETS.find((bucket) => bucket.key === "none"), undefined);
  const counts = { debtors: 12, to_pay: 6, expiring: 3, active: 48 };
  assert.deepEqual(rules.PAYMENT_BUCKETS.map((bucket) => rules.bucketTabLabel(bucket.label, rules.bucketCount(counts, bucket.key))), [
    "Должники 12", "К оплате 6", "Заканчивается оплата 3", "Без долга 48",
  ]);
  assert.deepEqual(rules.PAYMENT_BUCKETS.map((bucket) => rules.bucketTabLabel(bucket.label, rules.bucketCount(null, bucket.key))), [
    "Должники", "К оплате", "Заканчивается оплата", "Без долга",
  ]);
});

// ── the price line of the student card ───────────────────────────────────────

test("price line: «Цена 500 000 сум/мес · цена группы» / «Индивидуальная цена 400 000 сум/мес · причина» / not set", () => {
  const line = (price, label = "Цена в месяц") => G.membershipPriceLine(price, label);
  const group = { amount: 500000, source: "group", valid_from: null, group_amount: 500000, reason: null };
  assert.equal(plain(line(group).text), "Цена 500 000 сум/мес · цена группы");
  assert.equal(plain(line(group, "Цена пакета").text), "Цена 500 000 сум за пакет · цена группы");
  const own = { amount: 400000, source: "override", valid_from: "2026-10-05", group_amount: 500000, reason: " Сестра ученика " };
  assert.equal(plain(line(own).text), "Индивидуальная цена 400 000 сум/мес · Сестра ученика");
  assert.equal(plain(line(own).title), "Причина: Сестра ученика\nС 05.10.2026\nЦена группы 500 000 сум"); // the card prints no reason: it is here
  assert.equal(plain(line({ ...own, reason: null }).text), "Индивидуальная цена 400 000 сум/мес"); // no empty dot
  assert.equal(line({ amount: null, source: "none", valid_from: null, group_amount: null, reason: null }).text, "Цена группы не задана");
  assert.equal(line(null).kind, "none");
  // a price of 0 is a price: free, never «0 сум/мес»
  assert.equal(line({ ...group, amount: 0, group_amount: 0 }).text, "Бесплатно · цена группы");
  assert.equal(line({ ...own, amount: 0 }).text, "Индивидуальная цена — бесплатно · Сестра ученика");
  assert.doesNotMatch(line({ ...group, amount: 0 }).text, /0 сум/);
});

// ── the screens ──────────────────────────────────────────────────────────────

test("the payments table: sentence-case headers, a tab bar that scrolls with a fade, one main button per row", () => {
  const page = read("src/components/payments/payments-page.tsx");
  // wave 3: the header is the DataTable's: sentence case, 12 px semibold (see ui/data-table.tsx, `.dt-head-cell`)
  const css = read("src/app/globals.css");
  const head = css.match(/\.dt-head-cell \{[^}]*\}/)[0];
  assert.doesNotMatch(head, /uppercase|letter-spacing/);
  assert.match(head, /font-size: 0\.75rem; font-weight: 600/);
  assert.match(page, /<ScrollHint focusable=\{false\} (?:data-allow-hscroll="" )?className="[^"]*overflow-x-auto[^"]*">\s*\{\/\*[^*]*\*\/\}\s*<div role="tablist" className="flex w-max min-w-full gap-1">/); // the role is not on the box ScrollHint manages
  assert.match(page, /shrink-0 whitespace-nowrap/); // a label is never squeezed
  assert.match(page, /bucketTabLabel\(label, bucketCount\(tabCounts, key\)\)/);
  assert.match(page, /kind: "create", row, payment: null/);
  assert.equal((page.match(/<PayButton row=\{row\}/g) || []).length, 1);
});

test("student card: row 1 = group + status + main button + «⋯»; row 2 = the price; the rare actions are in the menu", () => {
  const block = read("src/components/payments/membership-payments.tsx");
  assert.match(block, /heading: ReactNode;/);
  // IA audit F1: the «⋯» is the shared component (the same one the group's «Оплаты» tab renders); the two histories are gone from it
  assert.match(block, /<MembershipRowActions\b/);
  assert.doesNotMatch(block, /payments-history|История оплат/);
  const row1 = block.indexOf("Row 1:");
  const row2 = block.indexOf("Row 2:");
  assert.ok(row1 > 0 && row2 > row1);
  assert.ok(block.indexOf("<MembershipPriceLine") > row2); // the price line comes after the first row
  // those actions are no longer loose buttons on the card
  const price = read("src/components/payments/membership-price.tsx");
  assert.doesNotMatch(price, /Скрыть историю цены/);
  assert.doesNotMatch(price + block, /ChevronDown/);
  assert.doesNotMatch(price, />\s*Назначить индивидуальную цену\s*</);
  // money rules are untouched: nothing for a teacher
  assert.match(read("src/components/students/student-payments-block.tsx"), /if \(!moneyEnabled\) return null;/);
});

// ── the money chip of a membership on the student's card: ONE chip, one line (owner 22.10) ──────

test("the label of a membership: one line per state in the server's words; one function for the card, the group tab and the list", () => {
  assert.equal(rules.membershipChip, undefined);
  assert.equal(rules.moneyChip, undefined);
  const PS = require(path.join(__dirname, "../src/lib/pay-state.ts"));
  const row = (state, text, extra = {}) => ({ state, state_text: text, ...extra });
  // paid: green, the date is in the server's label; an advance is NOT said here
  assert.deepEqual([PS.payLabel(row("paid", "Оплачено до 30.11")).text, PS.payLabel(row("paid", "Оплачено до 30.11")).tone], ["Оплачено до 30.11", "ok"]);
  // a debt: red, with the days in the line under it; a sum within its term: blue, with the term
  const debt = PS.payLabel(row("debt", "Долг 592 000 сум", { debt_amount: 592000, debt_text: "Долг 592 000 сум", debt_sub: "просрочено 12 дней" }), "debtors");
  assert.deepEqual([debt.text, debt.tone, debt.sub], ["Долг 592 000 сум", "danger", "просрочено 12 дней"]);
  const due = PS.payLabel(row("to_pay", "К оплате 92 000 сум", { due_amount: 92000, due_text: "К оплате 92 000 сум", due_sub: "до 04.12" }), "to_pay");
  assert.deepEqual([due.text, due.tone, due.sub], ["К оплате 92 000 сум", "due", "до 04.12"]);
  // pause / ends soon / free / no price: the server's words, their tones
  assert.deepEqual(["paused", "expiring", "free", "none"].map((state) => PS.payLabel(row(state, state)).tone), ["neutral", "warn", "neutral", "neutral"]);
  // every label is one line: no line breaks
  for (const label of [debt, due, PS.payLabel(row("paused", "Пауза до 12.11"))]) assert.ok(!/\n/.test(label.text));
});

test("the card of a membership: one chip, the actions in one row «Внести оплату» · «Выписка» · «⋯»; no «оплачено до» / «Аванс» / «Выписка» lines", () => {
  const src = read("src/components/payments/membership-payments.tsx");
  const head = src.slice(src.indexOf("{/* Row 1: the group"), src.indexOf("{/* A group the student has left"));
  assert.match(head, /payLabel\(row, "debtors"\)|chip\.text/);
  assert.match(head, /testId="membership-chip"/); // <Chip> (IA audit F14)
  assert.doesNotMatch(head, /statusDetail|BalanceNote|detail &&/, "no second line under the chip");
  assert.match(head, /\[grid-template-areas:'heading_heading'_'status_status'_'actions_actions'\]/, "phone: the chip on its own line, the actions under it");
  assert.match(head, /lg:\[grid-template-areas:'heading_status_actions'\]/);
  // the three actions live in one flex row
  const actions = head.slice(head.indexOf("[grid-area:actions]"));
  assert.ok(actions.indexOf("PAY_ACTION_LABEL") < actions.indexOf(">\n              Выписка") && actions.indexOf("Выписка") < actions.indexOf("{menu}"));
  assert.match(head, /data-testid="membership-statement"/);
  assert.doesNotMatch(src, /\bstatusDetail\b|\bmoneyChip\(/, "the card does not use the old two-line pieces"); // `moneyChipTone` is the palette mapping
  // «Выписка» is never in «⋯»: it is a link of the row for every state (the menu keeps money, price and the opening balance only)
  assert.doesNotMatch(read("src/lib/membership-actions.ts"), /statement/i);
  // the rows of the «Оплаты» tabs keep their layout and their chip
  const page = read("src/components/payments/payments-page.tsx");
  assert.match(page, /const label = payLabel\(row, bucket\);/);
  assert.match(page, /label\.sub && <p className="w-full text-xs text-slate-600" data-testid="pay-sub">/);
  assert.match(page, /label\.second && <p/);
  assert.doesNotMatch(page, /BalanceNote|statusDetail|moneyChip/);
});
