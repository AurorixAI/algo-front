// inc12 (stage screenshots of the owner, 23.10): four desktop tables where a header did not stand over its cells.
// 1) «Уроки без отметки»: the action cell of every row is the same (fixed primary button + an always reserved «⋯» slot);
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

test("inc12-1: every row of «Уроки без отметки» has the same action cell: one button width, the «⋯» slot always reserved", () => {
  const src = read("src/components/attendance/open-lessons-view.tsx");
  const button = const_(src, "ACTION_BUTTON_CLASS");
  const slot = const_(src, "MENU_SLOT_CLASS");
  assert.match(button, /(^| )w-\[96px\]( |$)/, "one fixed width for «Открыть» and «Отметить» (a phone: 40 px high, 96 wide)");
  assert.match(button, /\blg:w-\[88px\]/);
  assert.match(button, /\bshrink-0\b/);
  assert.match(button, /\bjustify-center\b/);
  assert.match(slot, /\bh-10 w-10\b[\s\S]*\blg:h-8 lg:w-8\b/, "the slot is the size of the «⋯» button: 40 px on a phone, 32 from lg");
  // the label does not change the class: both words go through the same constant, in a single place
  assert.equal((src.match(/data-testid="open-lesson-action"/g) || []).length, 1);
  assert.match(src, /data-testid="open-lesson-action"[\s\S]{0,300}className=\{ACTION_BUTTON_CLASS\}/);
  // the menu is rendered when the row has actions, otherwise an invisible placeholder of the same size - inside the same slot
  assert.match(src, /<div className=\{MENU_SLOT_CLASS\} data-testid="open-lesson-menu-slot">\s*\{menuItemsOf\(item\)\.length > 0 \? \(\s*<RowMenu/);
  assert.match(src, /data-testid="open-lesson-menu-placeholder" className="invisible block h-10 w-10 lg:h-8 lg:w-8"/);
  assert.match(src, /aria-hidden="true" data-testid="open-lesson-menu-placeholder"/);
  // «in progress» is the row without actions: that is exactly the one that used to lose the «⋯»
  assert.match(src, /if \(item\.actionType === "in_progress"\) return \[\];/);
  // the label words fit the fixed width at 12px semibold (88px - 2*8px padding = 72px)
  const lib = read("src/lib/open-lessons.ts");
  const labels = [...lib.matchAll(/["'«](Открыть|Отметить)["'»]/g)].map((m) => m[1]);
  assert.ok(labels.includes("Открыть") && labels.includes("Отметить"));
});

test("inc12-2 (26.10, 14А.4): group «Оплаты» - NO column of the price (PAY-DUE 14А.4); the payment column is CENTRED (header, chip, bar on one axis); student left, actions right", () => {
  const src = read("src/components/groups/group-payments-tab.tsx");
  const grid = const_(src, "GRID_COLS");
  assert.equal(grid, "lg:grid-cols-[minmax(12rem,1fr)_minmax(15rem,22rem)_minmax(272px,1fr)]");
  const cols = grid.match(/\[(.*)\]/)[1].split("_");
  assert.equal(cols.length, 3, "student · payment · actions - the price column is gone");
  assert.match(cols[1], /^minmax\(15rem,/, "payment: room for «просрочено 45 дней · оплачено до 30.09» on ONE line (the price column is gone, its room went here)");
  assert.match(src, /<span>Ученик<\/span>\s*<span className="text-center">Оплата<\/span>/);
  assert.doesNotMatch(src, /<span>\{label\}<\/span>|lg:hidden">\{label\}/, "no header of the price, no phone label of it");
  assert.doesNotMatch(src, /Цена в месяц|Цена пакета/);
  assert.equal((src.match(/<div className="min-w-0 lg:flex lg:justify-center"><ChipView view=\{view\} \/><\/div>/g) || []).length, 2, "payment chip centred in both row kinds");
  assert.match(src, /flex-col items-start gap-1\.5 lg:items-center/, "the chip and the bar on one axis");
  assert.doesNotMatch(src, /<span className="text-sm text-slate-500 max-lg:hidden">—<\/span>/, "no placeholder cell of the price in the left row");
  assert.match(src, /lg:gap-x-6/, "the columns breathe: 24px between them");
  // the actions stay right
  assert.match(src, /<div className="flex items-center gap-2 lg:justify-end">/);
});

test("inc12-3 (wave 3) → PAY-DUE 9.7: «Оплаты» list - no money column left (no price, no last payment); the status is text on the left, the actions on the right", () => {
  const src = read("src/components/payments/payments-page.tsx");
  assert.doesNotMatch(src, /key: "last"|key: "price"|last-payment-empty|DataEmpty/);
  assert.match(src, /\{ key: "status", header: "Статус", width: "max-content" \}/);
  assert.match(src, /\{ key: "actions", header: "", align: "end", width: "max-content", actions: true \}/);
  assert.doesNotMatch(src, /xl:text-center/, "no accidental centring in the list");
  // the names and the groups are wide, not cut (they wrap)
  assert.match(src, /\{ key: "student", header: "Ученик", width: "minmax\(8rem,3fr\)" \}/);
  assert.match(src, /\{ key: "group", header: "Группа", width: "minmax\(5\.5rem,2fr\)"/);
  assert.doesNotMatch(src, /xl:truncate/);
});

test("inc12-4 (wave 3): journal «Оплаты» - text columns LEFT, «Сумма» money RIGHT in its own fixed column", () => {
  const src = read("src/components/payments/income-journal.tsx");
  const cols = src.match(/const JOURNAL_COLUMNS: DataColumn\[\] = \[([\s\S]*?)\];/)[1];
  assert.match(cols, /key: "when", header: "Дата · время", width: "max-content"/);
  assert.match(cols, /key: "student", header: "Ученик", width: "minmax\(8rem,1\.5fr\)"/);
  assert.match(cols, /key: "group", header: "Группа", width: "minmax\(7rem,1fr\)"/);
  assert.match(cols, /key: "amount", header: "Сумма", align: "end", width: "max-content"/);
  assert.match(cols, /key: "method", header: "Способ", width: "max-content"/);
  assert.doesNotMatch(cols, /center/, "nothing is centred");
  assert.match(src, /<DataCell col="amount"><span className=\{`whitespace-nowrap text-sm font-medium tracking-tight/);
});
