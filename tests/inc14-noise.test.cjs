/**
 * INC-14 (owner feedback, noise removal): the statement loses its «По состоянию на …» line, the «Поступления» page loses
 * its group / teacher filter, and no native <select> is left in the owner / admin / teacher UI (the project's own Select).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
  const rel = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(rel) : /\.(tsx|ts)$/.test(entry.name) ? [rel] : [];
});

test("the statement does not print «По состоянию на …, учёт ведётся с …, суммы в сумах» (the Excel keeps it)", () => {
  const view = read("src/components/payments/statement-view.tsx");
  assert.doesNotMatch(view, /По состоянию на|учёт ведётся|суммы в сумах/);
  assert.doesNotMatch(view, /statement\.as_of|statement\.accounting_start/);
  // the one real fact of that line is kept: a student who left the group
  assert.match(view, /!m\.is_active && <p[^>]*>Ученик больше не в этой группе<\/p>/);
  // the «Сходится» hint never mentioned those dates
  assert.doesNotMatch(read("src/lib/payments-ledger.ts").match(/export const STATEMENT_HINTS = \{[\s\S]*?\n\};/)[0], /по состоянию|учёт ведётся/i);
});

test("no native <select> is left: every dropdown is the project's Select (combobox + listbox, keyboard, chevron)", () => {
  const offenders = walk("src").filter((file) => /<select[\s>]/.test(read(file)));
  assert.deepEqual(offenders, [], "native <select> in: " + offenders.join(", "));
  const select = read("src/components/ui/select.tsx");
  assert.match(select, /role="combobox"/);
  assert.match(select, /role="listbox"/);
  assert.match(select, /ChevronDown/);
  assert.match(select, /aria-label=\{!label \? ariaLabel : undefined\}/);
});

test("the journal toolbar: «Кто внёс» is the same height / radius / border as «Скачать Excel», full width on a phone", () => {
  const journal = read("src/components/payments/income-journal.tsx");
  const button = /<button\s+type="button"\s+onClick=\{props\.onExport\}[\s\S]*?className="([^"]+)"/.exec(journal)[1];
  for (const token of ["h-10", "rounded-xl", "border-slate-200", "text-sm", "hover:bg-slate-50", "w-full", "sm:w-auto"]) assert.ok(button.includes(token), `Excel button: ${token}`);
  const field = /<Select\s+ariaLabel="Кто внёс оплату"[\s\S]*?\/>/.exec(journal)[0];
  for (const token of ["h-10", "hover:bg-slate-50", "w-full sm:w-auto"]) assert.ok(field.includes(token), `author select: ${token}`);
  assert.doesNotMatch(field, /rounded-(?!xl)/);
});

test("«Поступления»: only the month navigator and «Свой период» on top; no group / teacher filter anywhere on the page", () => {
  const page = read("src/components/payments/income-page.tsx");
  assert.match(page, /<PeriodBar /);
  assert.doesNotMatch(page, /FiltersBar|CascadingFilter|Все группы|filters\.groupId|filters\.teacherId/);
  assert.equal(fs.existsSync(path.join(root, "src/lib/use-payments-directory.ts")), false, "the directory hook only fed that filter");
  const lib = read("src/lib/payments-income-v2.ts");
  assert.match(lib, /export interface IncomeFilters \{ method: string \}/);
  assert.doesNotMatch(lib.match(/export interface JournalQuery \{[\s\S]*?\n\}/)[0], /group_id|teacher_id/);
});
