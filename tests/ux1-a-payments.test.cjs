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

test("the main button: «Внести оплату» when overdue or never paid, «Продлить» when running", () => {
  const paid = { id: "p1" };
  assert.equal(rules.payActionOf({ status: "expired", last_payment: paid }), "create");
  assert.equal(rules.payActionOf({ status: "none", last_payment: null }), "create");
  assert.equal(rules.payActionOf({ status: "active", last_payment: null }), "create"); // never paid (a free or carried-over membership)
  assert.equal(rules.payActionOf({ status: "active", last_payment: paid }), "extend");
  assert.equal(rules.payActionOf({ status: "expiring", last_payment: paid }), "extend");
  assert.equal(rules.payActionOf({ status: "ends_today", last_payment: paid }), "extend"); // still paid today
  assert.deepEqual(rules.PAY_ACTION_LABEL, { create: "Внести оплату", extend: "Продлить" });
  // the dialog repeats the verb of the button
  const modal = read("src/components/payments/payment-form-modal.tsx");
  assert.match(modal, /create: PAY_ACTION_LABEL\.create,/);
  assert.match(modal, /extend: `\$\{PAY_ACTION_LABEL\.extend\} оплату`,/);
});

test("tabs: «Без оплат», and a counter on every tab", () => {
  assert.equal(rules.PAYMENT_BUCKETS.find((bucket) => bucket.key === "none").label, "Без оплат");
  const summary = { due: 12, expiring: 3, none: 0, active: 48 };
  assert.deepEqual(rules.PAYMENT_BUCKETS.map((bucket) => rules.bucketTabLabel(bucket.label, rules.bucketCount(summary, bucket.key))), [
    "Требуют оплаты (12)", "Скоро заканчивается (3)", "Без оплат (0)", "Оплачено (48)",
  ]);
  assert.deepEqual(rules.PAYMENT_BUCKETS.map((bucket) => rules.bucketTabLabel(bucket.label, rules.bucketCount(null, bucket.key))), [
    "Требуют оплаты", "Скоро заканчивается", "Без оплат", "Оплачено",
  ]);
});

// ── the price line of the student card ───────────────────────────────────────

test("price line: «Цена 500 000 сум/мес · цена группы» / «Индивидуальная цена 400 000 сум/мес · причина» / not set", () => {
  const line = (price, label = "Оплата в месяц") => G.membershipPriceLine(price, label);
  const group = { amount: 500000, source: "group", valid_from: null, group_amount: 500000, reason: null };
  assert.equal(plain(line(group).text), "Цена 500 000 сум/мес · цена группы");
  assert.equal(plain(line(group, "Стоимость пакета").text), "Цена 500 000 сум за пакет · цена группы");
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
  const header = page.slice(page.indexOf("{bucket !== \"none\" && ("), page.indexOf("<ul className=\"space-y-2.5"));
  assert.doesNotMatch(header, /uppercase|tracking-wider/);
  assert.match(header, /text-\[13px\] font-semibold text-slate-500/);
  assert.match(page, /<ScrollHint focusable=\{false\} className="[^"]*overflow-x-auto[^"]*">\s*\{\/\*[^*]*\*\/\}\s*<div role="tablist" className="flex w-max min-w-full gap-1">/); // the role is not on the box ScrollHint manages
  assert.match(page, /shrink-0 whitespace-nowrap/); // a label is never squeezed
  assert.match(page, /bucketTabLabel\(label, bucketCount\(summaryForTabs, key\)\)/);
  assert.match(page, /kind: payActionOf\(row\)/);
  assert.equal((page.match(/<PayButton row=\{row\}/g) || []).length, 1);
});

test("payments screens carry no «дн.» abbreviation and no «Нет данных» tab name", () => {
  const files = [
    "src/lib/payments.ts", "src/lib/group-price.ts",
    ...walk(path.join(root, "src/components/payments")).map((file) => path.relative(root, file).replace(/\\/g, "/")),
    "src/components/students/student-payments-block.tsx",
  ];
  for (const file of files) {
    const code = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    assert.doesNotMatch(code, /\bдн\./, file);
    assert.doesNotMatch(code, /«Нет данных»|"Нет данных"/, file);
  }
  for (const spec of fs.readdirSync(path.join(root, "e2e/tests")).filter((name) => name.endsWith(".spec.ts"))) {
    assert.doesNotMatch(read(`e2e/tests/${spec}`), /name: \/Нет данных\//, spec);
  }
  assert.equal(rules.periodHint({ validFrom: "2026-10-05", validTo: "2026-11-04" }, "calendar"), "Период 31 день");
  assert.equal(rules.periodHint({ validFrom: "2026-10-05", validTo: "2026-10-06" }, "calendar"), "Период 2 дня");
});

test("student card: row 1 = group + status + main button + «⋯»; row 2 = the price; the rare actions are in the menu", () => {
  const block = read("src/components/payments/membership-payments.tsx");
  assert.match(block, /heading: ReactNode;/);
  assert.match(block, /<RowMenu items=\{menu\} label=\{`Действия по оплате: \$\{row\.group_name\}`\} width=\{300\} \/>/);
  assert.match(block, /\.\.\.price\.items,\s*\{ key: "payments-history", label: historyOpen \? "Скрыть историю оплат" : "История оплат"/);
  const row1 = block.indexOf("Row 1:");
  const row2 = block.indexOf("Row 2:");
  assert.ok(row1 > 0 && row2 > row1);
  assert.ok(block.indexOf("{price.line}") > row2); // the price line comes after the first row
  // those actions are no longer loose buttons on the card
  const price = read("src/components/payments/membership-price.tsx");
  assert.match(price, /label: historyOpen \? "Скрыть историю цены" : "История цены"/);
  assert.doesNotMatch(price + block, /ChevronDown/);
  assert.doesNotMatch(price, />\s*Назначить индивидуальную цену\s*</);
  // money rules are untouched: nothing for a teacher
  assert.match(read("src/components/students/student-payments-block.tsx"), /if \(!moneyEnabled\) return null;/);
});
