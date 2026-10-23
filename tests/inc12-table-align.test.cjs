// inc12 (stage screenshots of the owner, 23.10): four desktop tables where a header did not stand over its cells.
// 1) «Незакрытые уроки»: the action cell of every row is the same (fixed primary button + an always reserved «⋯» slot);
// 2) group page «Оплаты»: «Цена в месяц» and «Оплата» have their own fixed columns, centred (header + cells);
// 3) «Оплаты» list: «Последняя оплата» centred (date / amount / the empty «—»);
// 4) «Поступления» → journal: «Группа» and «Способ» centred, «Сумма» its own fixed column to the left, right-aligned, tabular.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const const_ = (src, name) => {
  const m = src.match(new RegExp(`const ${name} = "([^"]*)"`));
  assert.ok(m, `${name} is defined`);
  return m[1];
};

test("inc12-1: every row of «Незакрытые уроки» has the same action cell: one button width, the «⋯» slot always reserved", () => {
  const src = read("src/components/attendance/open-lessons-view.tsx");
  const button = const_(src, "ACTION_BUTTON_CLASS");
  const slot = const_(src, "MENU_SLOT_CLASS");
  assert.match(button, /(^| )w-\[88px\]( |$)/, "one fixed width for «Открыть» and «Отметить»");
  assert.match(button, /\bshrink-0\b/);
  assert.match(button, /\bjustify-center\b/);
  assert.match(slot, /\bh-8 w-8\b/, "the slot is the size of the «⋯» button");
  // the label does not change the class: both words go through the same constant, in a single place
  assert.equal((src.match(/data-testid="open-lesson-action"/g) || []).length, 1);
  assert.match(src, /data-testid="open-lesson-action"[\s\S]{0,300}className=\{ACTION_BUTTON_CLASS\}/);
  // the menu is rendered when the row has actions, otherwise an invisible placeholder of the same size - inside the same slot
  assert.match(src, /<div className=\{MENU_SLOT_CLASS\} data-testid="open-lesson-menu-slot">\s*\{menuItemsOf\(item\)\.length > 0 \? \(\s*<RowMenu/);
  assert.match(src, /data-testid="open-lesson-menu-placeholder" className="invisible block h-8 w-8"/);
  assert.match(src, /aria-hidden="true" data-testid="open-lesson-menu-placeholder"/);
  // «in progress» is the row without actions: that is exactly the one that used to lose the «⋯»
  assert.match(src, /if \(item\.actionType === "in_progress"\) return \[\];/);
  // the label words fit the fixed width at 12px semibold (88px - 2*8px padding = 72px)
  const lib = read("src/lib/open-lessons.ts");
  const labels = [...lib.matchAll(/["'«](Открыть|Отметить)["'»]/g)].map((m) => m[1]);
  assert.ok(labels.includes("Открыть") && labels.includes("Отметить"));
});

test("inc12-2: group «Оплаты» - price and payment have their own fixed centred columns, student left, actions right", () => {
  const src = read("src/components/groups/group-payments-tab.tsx");
  const grid = const_(src, "GRID_COLS");
  assert.equal(grid, "lg:grid-cols-[minmax(12rem,22rem)_152px_168px_minmax(272px,1fr)]");
  const cols = grid.match(/\[(.*)\]/)[1].split("_");
  assert.equal(cols.length, 4);
  assert.match(cols[1], /^\d+px$/, "price: fixed");
  assert.match(cols[2], /^\d+px$/, "payment: fixed");
  assert.match(src, /<span>Ученик<\/span>\s*<span className="text-center">\{label\}<\/span>\s*<span className="text-center">Оплата<\/span>/);
  // the price cell: amount and the «индивидуальная» chip are a centred column on a desktop; the payment chip is centred
  assert.match(src, /lg:block lg:text-center">\s*<span[^>]*lg:hidden">\{label\}/);
  assert.match(src, /lg:flex-col lg:items-center lg:justify-center/);
  assert.equal((src.match(/<div className="min-w-0 lg:flex lg:justify-center"><ChipView view=\{view\} \/><\/div>/g) || []).length, 2, "payment chip centred in both row kinds");
  assert.match(src, /<span className="text-center text-sm text-slate-400 max-lg:hidden">—<\/span>/, "the left-student dash is centred too");
  // the actions stay right
  assert.match(src, /<div className="flex items-center gap-2 lg:justify-end">/);
});

test("inc12-3: «Оплаты» list - «Последняя оплата» header and cell content (date / amount / «—») are centred", () => {
  const src = read("src/components/payments/payments-page.tsx");
  assert.match(src, /<span className="text-center">Последняя оплата<\/span>/);
  assert.match(src, /xl:block xl:text-center">\s*<span className="shrink-0 text-xs text-slate-400 xl:hidden">Последняя оплата<\/span>/);
  assert.match(src, /<span className="text-right tabular-nums xl:block xl:text-center" title=\{lastPaymentLabel\(last\)\}>/);
  assert.match(src, /<span className="text-slate-400 xl:block xl:text-center" data-testid="last-payment-empty">—<\/span>/);
  // nothing else of the table moved
  assert.match(src, /xl:grid-cols-\[minmax\(0,1\.2fr\)_minmax\(0,1fr\)_136px_minmax\(0,1\.4fr\)_132px_196px\]/);
});

test("inc12-4: journal «Оплаты» - Группа and Способ centred, Сумма a narrower fixed column to the left, right-aligned and tabular", () => {
  const src = read("src/components/payments/income-journal.tsx");
  const grid = const_(src, "ROW_GRID");
  assert.equal(grid, "md:grid-cols-[6.5rem_minmax(0,1.5fr)_minmax(0,1fr)_8rem_11rem]");
  const cols = grid.match(/\[(.*)\]/)[1].split("_");
  assert.equal(cols.length, 5);
  assert.equal(cols[0], "6.5rem", "«Дата · время» unchanged");
  assert.equal(cols[1], "minmax(0,1.5fr)", "«Ученик» takes what Группа gave");
  assert.equal(cols[2], "minmax(0,1fr)", "«Группа» is narrower than before (was 1.2fr)");
  assert.match(cols[3], /^8rem$/, "«Сумма» is its own fixed column, narrower than the old 9rem so that it stands further left");
  assert.match(cols[4], /^11rem$/, "«Способ» is wider (was 8.5rem): the extra width stands between the amount and the method");
  assert.match(src, /<span className="text-center">Дата · время<\/span>\s*<span>Ученик<\/span>\s*<span className="text-center">Группа<\/span>\s*<span className="text-right">Сумма<\/span>\s*<span className="text-center">Способ<\/span>/);
  // cells
  assert.match(src, /md:col-start-3 md:row-start-1 md:text-center md:text-sm [^>]*>\{view\.group\}/);
  assert.match(src, /text-right text-sm font-medium tabular-nums tracking-tight md:col-start-4 [^>]*>\{view\.amount\}/);
  assert.match(src, /md:col-start-5 md:row-start-1 md:text-center md:text-sm [^>]*>\{view\.method\}/);
  // the phone card is unchanged: the method is still right-aligned under the amount below md
  assert.match(src, /col-start-2 row-start-2 text-right text-xs md:col-start-5/);
});
