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

test("status chip: «Просрочено на N …» and «Осталось N …» agree in number, never «дн.»", () => {
  const overdue = (n) => rules.statusLabel({ ...calendar, status: "expired", days_overdue: n });
  const soon = (n) => rules.statusLabel({ ...calendar, status: "expiring", days_left: n });
  assert.equal(overdue(31), "Просрочено на 31 день");
  assert.deepEqual([1, 2, 5, 11, 12, 21, 22, 25].map(overdue), [
    "Просрочено на 1 день", "Просрочено на 2 дня", "Просрочено на 5 дней", "Просрочено на 11 дней",
    "Просрочено на 12 дней", "Просрочено на 21 день", "Просрочено на 22 дня", "Просрочено на 25 дней",
  ]);
  assert.equal(soon(5), "Осталось 5 дней");
  // the verb agrees with the number: «Остался 1 день», «Остался 21 день», «Осталось 2 дня»
  assert.deepEqual([1, 2, 3, 4, 5, 11, 21, 22].map(soon), [
    "Остался 1 день", "Осталось 2 дня", "Осталось 3 дня", "Осталось 4 дня", "Осталось 5 дней", "Осталось 11 дней", "Остался 21 день", "Осталось 22 дня",
  ]);
  const lessonsLeft = (n) => rules.statusLabel({ ...calendar, period_mode: "lessons", lessons_total: 12, status: "expiring", lessons_left: n });
  assert.deepEqual([1, 2, 5, 21].map(lessonsLeft), ["Остался 1 урок из 12", "Осталось 2 урока из 12", "Осталось 5 уроков из 12", "Остался 21 урок из 12"]);
  for (const text of [overdue(1), overdue(31), soon(1), soon(5), rules.statusLabel({ ...calendar, status: "ends_today" })]) {
    assert.doesNotMatch(text, /дн\./);
  }
});

test("status: the chip says the state, the second line says «оплачено до 19.09.2026»", () => {
  const row = (status, extra = {}) => ({ ...calendar, status, ...extra });
  assert.equal(rules.statusLabel(row("active")), "Оплачено");
  assert.equal(rules.statusDetail(row("active")), "оплачено до 19.09.2026");
  assert.equal(rules.statusDetail(row("expired", { days_overdue: 31 })), "оплачено до 19.09.2026");
  assert.equal(rules.statusDetail(row("expiring", { days_left: 5 })), "оплачено до 19.09.2026");
  assert.equal(rules.statusLabel(row("none", { paid_until: null, period_mode: null })), "Без оплат");
  assert.equal(rules.statusDetail(row("none", { paid_until: null, period_mode: null })), "");
  // tone: red only for overdue, amber for «soon» and the last day, grey for paid
  assert.deepEqual(["expired", "expiring", "ends_today", "active", "none"].map((status) => rules.statusTone(status)), ["danger", "warning", "warning", "ok", "muted"]);
  assert.match(rules.STATUS_TONE_CLASS[rules.statusTone("expired")], /rose/);
  assert.match(rules.STATUS_TONE_CLASS[rules.statusTone("expiring")], /amber/);
  assert.match(rules.STATUS_TONE_CLASS[rules.statusTone("active")], /slate/);
});

test("tabs by money: «Должники», «Скоро платить», «Без долга» and a counter on every tab", () => {
  assert.equal(rules.PAYMENT_BUCKETS.find((bucket) => bucket.key === "none"), undefined);
  const summary = { debtors: 12, expiring: 3, active: 48 };
  assert.deepEqual(rules.PAYMENT_BUCKETS.map((bucket) => rules.bucketTabLabel(bucket.label, rules.bucketCount(summary, bucket.key))), [
    "Должники (12)", "Скоро платить (3)", "Без долга (48)",
  ]);
  assert.deepEqual(rules.PAYMENT_BUCKETS.map((bucket) => rules.bucketTabLabel(bucket.label, rules.bucketCount(null, bucket.key))), [
    "Должники", "Скоро платить", "Без долга",
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
  assert.equal(plain(line(own).title), "Цена группы 500 000 сум");
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
  const header = page.slice(page.indexOf("<div className={`hidden border-b border-slate-100 bg-slate-50"), page.indexOf("<ul className=\"space-y-2.5"));
  assert.doesNotMatch(header, /uppercase|tracking-wider/);
  assert.match(header, /text-\[13px\] font-semibold text-slate-500/);
  assert.match(page, /<ScrollHint focusable=\{false\} className="[^"]*overflow-x-auto[^"]*">\s*\{\/\*[^*]*\*\/\}\s*<div role="tablist" className="flex w-max min-w-full gap-1">/); // the role is not on the box ScrollHint manages
  assert.match(page, /shrink-0 whitespace-nowrap/); // a label is never squeezed
  assert.match(page, /bucketTabLabel\(label, bucketCount\(summaryForTabs, key\)\)/);
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

test("membershipChip: one line per state - «Оплачено до 30.11», «Долг …», «Ещё не платил», «На паузе до …»; the state logic is moneyChip's", () => {
  const base = { status: "active", period_mode: "calendar", paid_until: "2026-11-30", debt: 0, advance: 0, last_payment: { id: "p" }, days_left: 20 };
  const chip = (patch) => { const c = rules.membershipChip({ ...base, ...patch }); return { ...c, label: plain(c.label), title: c.title && plain(c.title) }; };
  // paid: green, the date in dd.mm, the full date is the tooltip; an advance is NOT said
  assert.deepEqual(chip({}), { label: "Оплачено до 30.11", tone: "ok", title: "оплачено до 30.11.2026" });
  assert.equal(chip({ advance: 450000 }).label, "Оплачено до 30.11");
  // overdue debt: red «Долг N сум», the tooltip says how overdue
  assert.deepEqual(chip({ status: "expired", debt: 592000, days_overdue: 12 }), { label: "Долг 592 000 сум", tone: "danger", title: "Просрочено на 12 дней" });
  assert.deepEqual(chip({ status: "active", debt: 592000, debt_reason: "overdue", days_overdue: 3 }).label, "Долг 592 000 сум");
  // a part is paid and the period still runs («Не доплачено») -> «Долг 92 000 сум», still amber (not overdue), the tooltip keeps the old word
  assert.deepEqual(chip({ status: "active", debt: 92000 }), { label: "Долг 92 000 сум", tone: "warning", title: "Не доплачено" });
  // never paid: stays «Ещё не платил» (amber), the debt is the tooltip
  assert.deepEqual(chip({ status: "none", paid_until: null, last_payment: null, debt: 450000, debt_reason: "never_paid" }), { label: "Ещё не платил", tone: "warning", title: "Долг 450 000 сум" });
  // never paid AND a period has already ended unpaid (past_debt > 0): red «Долг N сум», the tooltip is «Ещё не платил» (inc5 C02b)
  assert.deepEqual(chip({ status: "none", paid_until: null, last_payment: null, debt: 1500000, past_debt: 1000000, current_due: 500000, debt_reason: "never_paid" }), { label: "Долг 1 500 000 сум", tone: "danger", title: "Ещё не платил" });
  // never paid, past_debt 0 (only the running period): still amber
  assert.deepEqual(chip({ status: "none", paid_until: null, last_payment: null, debt: 500000, past_debt: 0, current_due: 500000, debt_reason: "never_paid" }), { label: "Ещё не платил", tone: "warning", title: "Долг 500 000 сум" });
  // pause stays «На паузе до 12.11»
  assert.equal(chip({ status: "paused", paused: { from: "2026-11-01", to: "2026-11-12" } }).label, "На паузе до 12.11");
  // the rest of the date states keep their words, the date joins the one line
  assert.equal(chip({ status: "expiring", days_left: 5 }).label, "Осталось 5 дней · до 30.11");
  assert.equal(chip({ status: "ends_today" }).label, "Сегодня последний день");
  assert.equal(chip({ status: "none", paid_until: null, last_payment: null }).label, "Без оплат");
  assert.equal(chip({ status: "free", paid_until: null }).label, "Бесплатно");
  assert.equal(chip({ period_mode: "lessons", lessons_total: 12, lessons_left: 9, paid_until: null }).label, "Оплачено · осталось 9 уроков из 12");
  // every label is one line: no line breaks
  for (const patch of [{}, { status: "expired", debt: 5, days_overdue: 2 }, { status: "paused" }]) assert.ok(!/\n/.test(chip(patch).label));
  // the shared moneyChip (the tabs of «Оплаты») is unchanged
  assert.equal(rules.moneyChip({ ...base, status: "active", debt: 92000 }).label, "Не доплачено");
});

test("the card of a membership: one chip, the actions in one row «Внести оплату» · «Выписка» · «⋯»; no «оплачено до» / «Аванс» / «Выписка» lines", () => {
  const src = read("src/components/payments/membership-payments.tsx");
  const head = src.slice(src.indexOf("{/* Row 1: the group"), src.indexOf("{/* A group the student has left"));
  assert.match(head, /membershipChip|chip\.label/);
  assert.match(head, /data-testid="membership-chip"/);
  assert.doesNotMatch(head, /statusDetail|BalanceNote|detail &&/, "no second line under the chip");
  assert.match(head, /\[grid-template-areas:'heading_heading'_'status_status'_'actions_actions'\]/, "phone: the chip on its own line, the actions under it");
  assert.match(head, /lg:\[grid-template-areas:'heading_status_actions'\]/);
  // the three actions live in one flex row
  const actions = head.slice(head.indexOf("[grid-area:actions]"));
  assert.ok(actions.indexOf("PAY_ACTION_LABEL") < actions.indexOf(">\n              Выписка") && actions.indexOf("Выписка") < actions.indexOf("{menu}"));
  assert.match(head, /data-testid="membership-statement"/);
  assert.doesNotMatch(src, /\bstatusDetail\b|moneyChip/, "the card does not use the old two-line pieces");
  // «Выписка» is never in «⋯»: it is a link of the row for every state (the menu keeps money, price and the opening balance only)
  assert.doesNotMatch(read("src/lib/membership-actions.ts"), /statement/i);
  // the rows of the «Оплаты» tabs keep their layout and their chip
  const page = read("src/components/payments/payments-page.tsx");
  assert.match(page, /const chip = moneyChip\(row\);/);
  assert.match(page, /\{detail && <p className="text-xs text-slate-500">\{detail\}<\/p>\}/);
});
