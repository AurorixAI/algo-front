// Re-audit В1 (06.11): the windows of money look ONE way.  A guard on the source (like `money-vocabulary.test.cjs`): in a window of money
//  - no gradient and no coloured glow (`bg-gradient-*`, `shadow-[…]`, `shadow-primary-*` …): the decision of the owner 05.11, «без градиентов и стекла»;
//  - the buttons of the footer are only from `ConfirmFooter` (the main one is a flat blue / red fill, «Отмена» a plain text button, one line each);
//  - the footer of a window that is not the shared one is a bug of the next window.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "src");
const files = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(name)) files.push(full);
  }
})(root);

const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const read = (file) => stripComments(fs.readFileSync(file, "utf8"));
const rel = (file) => path.relative(root, file);

/** Every window of money: the files that use the shared footer (or its widths) + the ones that are money windows by what they are. */
const EXPLICIT = ["components/ui/confirm-host.tsx", "components/groups/assign-group-modal.tsx", "components/groups/add-student-drawer.tsx", "components/money/dialog-footer.tsx"];
const MONEY = files.filter((file) => EXPLICIT.includes(rel(file)) || /ConfirmFooter|MONEY_WINDOW_/.test(fs.readFileSync(file, "utf8")));

const GLOW = /bg-gradient|\bfrom-[a-z]+-\d|\bto-[a-z]+-\d|shadow-\[[^\]]*\]|shadow-(primary|blue|indigo|emerald|teal|red|amber|rose)-\d|backdrop-blur|bg-white\/\d/;

test("the list of money windows is not empty and holds the windows of the audit (18, 21, 15, 05, 09, 13, 20, 22, 40)", () => {
  const names = MONEY.map(rel);
  for (const name of ["components/ui/confirm-host.tsx", "components/groups/assign-group-modal.tsx", "components/payments/payment-dialog.tsx", "components/payments/refund-dialog.tsx", "components/payroll/payout-dialog.tsx", "components/attendance/cancel-missed-lesson-modal.tsx", "components/groups/lesson-return-dialogs.tsx"]) {
    assert.ok(names.includes(name), `${name} is a window of money: ${names.join(", ")}`);
  }
  assert.ok(MONEY.length >= 20, `${MONEY.length} windows`);
});

test("no gradient, no glow, no frosted glass in a window of money", () => {
  const bad = [];
  for (const file of MONEY) {
    const text = read(file);
    for (const line of text.split("\n")) if (GLOW.test(line) && !/data-print|print:/.test(line)) bad.push(`${rel(file)}: ${line.trim().slice(0, 140)}`);
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

/** The expression after `footer={`: up to the matching brace. */
function footerExpressions(text) {
  const out = [];
  for (let at = text.indexOf("footer={"); at !== -1; at = text.indexOf("footer={", at + 1)) {
    if (/[A-Za-z]footer=\{/.test(text.slice(at - 1, at + 8)) && !/[\s(,]footer=\{/.test(text.slice(at - 1, at + 8))) continue;   // `modalFooter={…}` is not the footer of a Modal
    let depth = 0;
    let end = at + "footer=".length;
    for (; end < text.length; end += 1) {
      if (text[end] === "{") depth += 1;
      else if (text[end] === "}") { depth -= 1; if (depth === 0) break; }
    }
    out.push(text.slice(at, end + 1));
  }
  return out;
}

test("the buttons of the footer of a window of money are only from ConfirmFooter (a flat main button, «Отмена» as text)", () => {
  const bad = [];
  for (const file of MONEY) {
    if (rel(file) === "components/money/dialog-footer.tsx") continue;
    for (const footer of footerExpressions(read(file))) {
      const shared = /ConfirmFooter|CONFIRM_PRIMARY_CLASS/.test(footer);
      // a segmented choice inside the footer (`role="radio"`) is a choice, not an action button
      const raw = (footer.replace(/CONFIRM_PRIMARY_CLASS[^>]*>/g, "").match(/<(Button|button)\b/g) ?? []).length > (footer.match(/role="radio"/g) ?? []).length;
      if (!shared || (/<Button\b/.test(footer))) bad.push(`${rel(file)}: ${footer.replace(/\s+/g, " ").slice(0, 120)}`);
      else if (raw && !/CONFIRM_PRIMARY_CLASS/.test(footer)) bad.push(`${rel(file)} (raw button): ${footer.replace(/\s+/g, " ").slice(0, 120)}`);
    }
    assert.ok(!/from "@\/components\/ui\/button"/.test(read(file)), `${rel(file)} imports the gradient Button`);
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("the shared footer itself: a FLAT blue (or red) main button in one line, «Отмена» a plain text button, the keyboard's focus ring only", () => {
  const text = read(path.join(root, "components/money/dialog-footer.tsx"));
  assert.match(text, /CONFIRM_PRIMARY_BLUE = "bg-primary-600 hover:bg-primary-700"/);
  assert.match(text, /CONFIRM_PRIMARY_DANGER = "bg-red-600 hover:bg-red-700"/);
  assert.match(text, /whitespace-nowrap/);
  assert.match(text, /focus-visible:ring-2/);
  assert.doesNotMatch(text, /border border-slate|shadow/, "no frame and no shadow on the buttons of the footer");
  assert.doesNotMatch(text.match(/CONFIRM_CANCEL_CLASS = [^;]*;/)[0].replace("hover:bg-slate-100", ""), /\bborder\b|\bbg-/, "«Отмена» is text");
});

// re-audit В6 / №24: text of the screens of money is not slate-400 (2.5:1 on white); slate-500 (4.76:1) is the lightest
const MONEY_SCREENS = files.filter((file) => /components\/(payments|payroll|money)\//.test(file) || MONEY.includes(file) || /group-archive-dialog|lesson-return-dialogs|student-groups-block|day-off|one-off-decisions|open-lessons-view/.test(file));
test("no text-slate-400 on the screens of money (contrast 4.5:1); placeholders and dark-mode pairs are not text on white", () => {
  const bad = [];
  for (const file of MONEY_SCREENS) {
    read(file).split("\n").forEach((line, index) => { if (/(^|[\s"'`{])text-slate-400/.test(line.replace(/placeholder:text-slate-400|dark:text-slate-400/g, ""))) bad.push(`${rel(file)}:${index + 1}`); });
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});
