/**
 * INC-15 «Единый вид элементов форм»: nowhere on the platform a control looks like the browser's default.
 * The logic of the date / time / number fields (src/lib/form-fields.ts) and the source rules of the shared controls.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
};
const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const f = require(path.join(root, "src/lib/form-fields.ts"));

test("a date is shown as дд.мм.гггг and parsed back from the ways people type it", () => {
  assert.equal(f.isoToDmy("2026-10-22"), "22.10.2026");
  assert.equal(f.isoToDmy(""), "");
  assert.equal(f.isoToDmy("2026-02-30"), "");
  for (const typed of ["22.10.2026", "22102026", "22.10.26", "221026", "22/10/2026", "22-10-2026", " 22.10.2026 ", "2026-10-22"]) {
    assert.equal(f.parseDateText(typed), "2026-10-22", typed);
  }
  assert.equal(f.parseDateText("2.3.2026"), "2026-03-02");
  for (const bad of ["", "22.10", "22.10.", "31.02.2026", "32.01.2026", "22.13.2026", "22.10.202", "22.10.20266", "abc", "00.10.2026", "29.02.2026"]) {
    assert.equal(f.parseDateText(bad), null, bad);
  }
  assert.equal(f.parseDateText("29.02.2028"), "2028-02-29"); // a leap year
});

test("typing into the date mask puts the dots in and never fights Backspace", () => {
  const typeAll = (digits) => { let text = ""; for (const ch of digits) text = f.maskDateInput(text + ch, text); return text; };
  assert.equal(typeAll("22102026"), "22.10.2026");
  assert.equal(typeAll("221026"), "22.10.26");
  assert.equal(typeAll("22"), "22.");
  assert.equal(typeAll("4"), "04.");          // a first digit above 3 can only be a zero-led day
  assert.equal(typeAll("0510"), "05.10.");
  assert.equal(typeAll("2.3.2026"), "02.03.2026"); // a lone digit before a typed separator is padded
  assert.equal(f.maskDateInput("22102026"), "22.10.2026");  // a paste
  assert.equal(f.maskDateInput("2026-10-22"), "22.10.2026"); // an ISO paste
  assert.equal(f.maskDateInput("22.10.20269999"), "22.10.2026"); // the rest is dropped
  assert.equal(f.maskDateInput("22.10.", "22.10.2"), "22.10.");
  // Backspace on «22.» gives «22», which must stay «22» (no dot put back)
  assert.equal(f.maskDateInput("22", "22."), "22");
  assert.equal(f.maskDateInput("2", "22"), "2");
  assert.equal(f.maskDateInput("", "2"), "");
  assert.equal(f.maskDateInput("ab12", ""), "12.");
});

test("a time is 24 h «ЧЧ:ММ», typed with a mask, whatever the browser's locale", () => {
  for (const [typed, expected] of [["15:00", "15:00"], ["1500", "15:00"], ["930", "09:30"], ["9:30", "09:30"], ["09.30", "09:30"], ["0930", "09:30"], ["23:59", "23:59"], ["00:00", "00:00"]]) {
    assert.equal(f.parseTimeText(typed), expected, typed);
  }
  for (const bad of ["", "24:00", "12:60", "1", "15", "15:0", "1:5", "abc", "12345"]) assert.equal(f.parseTimeText(bad), null, bad);
  const typeAll = (digits) => { let text = ""; for (const ch of digits) text = f.maskTimeInput(text + ch, text); return text; };
  assert.equal(typeAll("1530"), "15:30");
  assert.equal(typeAll("15"), "15:");
  assert.equal(typeAll("9"), "09:");           // 3..9 can only be a zero-led hour
  assert.equal(typeAll("930"), "09:30");
  assert.equal(typeAll("9.30"), "09:30");
  assert.equal(f.maskTimeInput("15", "15:"), "15"); // Backspace removes the colon for good
  assert.equal(f.maskTimeInput("1:30", ""), "01:30");
  assert.equal(f.normalizeTimeValue("15:00:00"), "15:00");
  assert.equal(f.normalizeTimeValue("7:00"), "");
  assert.deepEqual(f.timeSteps(15, 8 * 60, 9 * 60), ["08:00", "08:15", "08:30", "08:45"]);
  assert.equal(f.timeSteps().length, 96);
});

test("the calendar grid of October 2026: Monday first, the month starts on a Thursday", () => {
  assert.deepEqual([...f.WEEKDAYS_RU], ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]);
  assert.equal(f.firstWeekday(2026, 10), 3); // Mon=0 … Thu=3
  const weeks = f.monthGrid(2026, 10);
  assert.equal(weeks.length, 5);
  assert.ok(weeks.every((week) => week.length === 7));
  assert.deepEqual(weeks[0].map((d) => d.iso), ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
  assert.deepEqual(weeks[0].map((d) => d.inMonth), [false, false, false, true, true, true, true]);
  assert.equal(weeks[4][6].iso, "2026-11-01");
  assert.equal(weeks.flat().filter((d) => d.inMonth).length, 31);
  assert.equal(f.MONTHS_RU[9], "Октябрь");
  // other months: February 2027 (starts on Monday, 28 days = 4 full weeks), a month that needs six weeks
  assert.equal(f.monthGrid(2027, 2).length, 4);
  assert.equal(f.monthGrid(2026, 8).length, 6); // 1 Aug 2026 is a Saturday, 31 days
  assert.equal(f.firstWeekday(2026, 8), 5);
});

test("min / max: the nearest allowed day, and a day outside is not allowed", () => {
  assert.equal(f.isWithin("2026-10-22", "2026-10-22", "2026-10-31"), true);
  assert.equal(f.isWithin("2026-10-21", "2026-10-22", null), false);
  assert.equal(f.isWithin("2026-11-01", undefined, "2026-10-31"), false);
  assert.equal(f.isWithin("2030-01-01"), true);
  assert.equal(f.clampIso("2026-10-01", "2026-10-22", "2026-10-31"), "2026-10-22");
  assert.equal(f.clampIso("2026-12-01", "2026-10-22", "2026-10-31"), "2026-10-31");
  assert.equal(f.clampIso("2026-10-25", "2026-10-22", "2026-10-31"), "2026-10-25");
});

test("the calendar keyboard: arrows ±1 day / ±1 week, Home/End the week, PageUp/PageDown the month (Shift: the year)", () => {
  const d = "2026-10-22"; // a Thursday
  assert.equal(f.moveCalendarFocus(d, "ArrowLeft"), "2026-10-21");
  assert.equal(f.moveCalendarFocus(d, "ArrowRight"), "2026-10-23");
  assert.equal(f.moveCalendarFocus(d, "ArrowUp"), "2026-10-15");
  assert.equal(f.moveCalendarFocus(d, "ArrowDown"), "2026-10-29");
  assert.equal(f.moveCalendarFocus(d, "Home"), "2026-10-19"); // Monday
  assert.equal(f.moveCalendarFocus(d, "End"), "2026-10-25");  // Sunday
  assert.equal(f.moveCalendarFocus(d, "PageDown"), "2026-11-22");
  assert.equal(f.moveCalendarFocus(d, "PageUp"), "2026-09-22");
  assert.equal(f.moveCalendarFocus(d, "PageDown", true), "2027-10-22");
  assert.equal(f.moveCalendarFocus("2026-10-31", "ArrowRight"), "2026-11-01");
  assert.equal(f.moveCalendarFocus("2026-12-31", "ArrowRight"), "2027-01-01");
  assert.equal(f.moveCalendarFocus("2026-01-31", "PageDown"), "2026-02-28"); // the short month keeps the last day
  assert.equal(f.addMonthsIso("2028-01-31", 1), "2028-02-29");
  assert.equal(f.addMonthsIso("2026-01-15", -2), "2025-11-15");
  assert.equal(f.longDateLabel("2026-10-22"), "22 октября 2026");
});

test("a whole-number field takes digits only and steps inside its bounds", () => {
  assert.equal(f.sanitizeWholeNumber("1a2 3"), "123");
  assert.equal(f.sanitizeWholeNumber("-5", true), "-5");
  assert.equal(f.sanitizeWholeNumber("-5"), "5");
  assert.equal(f.stepNumber("", 1, 0, 200), "1");
  assert.equal(f.stepNumber("4", 1, 0, 5), "5");
  assert.equal(f.stepNumber("5", 1, 0, 5), "5");
  assert.equal(f.stepNumber("0", -1, 0, 5), "0");
  assert.equal(f.stepNumber("x", 1), "1");
});

// ── the components, rendered on the server (no browser): markup and states ───────────────────────────────────────
function renderer() {
  require.extensions[".tsx"] = (mod, filename) => {
    mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, filename);
  };
  const Module = require("node:module");
  if (!Module.__inc15Alias) {
    const resolveFilename = Module._resolveFilename;
    Module._resolveFilename = function (request, ...rest) {
      return resolveFilename.call(this, request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request, ...rest);
    };
    Module.__inc15Alias = true;
  }
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  return { React, html: (element) => renderToStaticMarkup(element) };
}

test("Checkbox wraps the native input: checked, indeterminate (a dash), disabled, focus ring, rounded-md, the primary colour", () => {
  const { React, html } = renderer();
  const { Checkbox } = require(path.join(root, "src/components/ui/checkbox.tsx"));
  const on = html(React.createElement(Checkbox, { checked: true, onChange() {}, "aria-label": "Выбрать" }));
  assert.match(on, /<input[^>]*type="checkbox"[^>]*checked=""|<input[^>]*checked=""[^>]*type="checkbox"/); // the native input stays (keyboard, label click, screen reader)
  assert.match(on, /aria-label="Выбрать"/);
  assert.match(on, /rounded-md/);
  assert.match(on, /peer-checked:bg-primary-600/);
  assert.match(on, /peer-focus-visible:ring-2/);
  assert.match(on, /lucide-check/);
  assert.doesNotMatch(on, /lucide-minus/);
  const some = html(React.createElement(Checkbox, { checked: false, indeterminate: true, onChange() {} }));
  assert.match(some, /lucide-minus/);        // «выбрана часть группы»: a dash, not a tick
  assert.doesNotMatch(some, /lucide-check/);
  assert.match(some, /bg-primary-600/);
  const off = html(React.createElement(Checkbox, { checked: false, disabled: true, onChange() {} }));
  assert.match(off, /disabled=""/);
  assert.match(off, /peer-disabled:opacity-60/);
  assert.doesNotMatch(off, /checked=""/);
  // the wrapper takes the class (margins, print:hidden), the input does not
  const cls = html(React.createElement(Checkbox, { checked: false, onChange() {}, className: "mt-0.5 print:hidden" }));
  assert.match(cls, /<span class="[^"]*mt-0\.5 print:hidden/);
});

test("DateInput / TimeInput render a text field with the project's look: дд.мм.гггг, 24 h, a calendar button, numeric keypad", () => {
  const { React, html } = renderer();
  const { DateInput } = require(path.join(root, "src/components/ui/date-input.tsx"));
  const { TimeInput } = require(path.join(root, "src/components/ui/time-input.tsx"));
  const date = html(React.createElement(DateInput, { id: "d", value: "2026-10-22", onChange() {}, "data-testid": "the-date", "aria-label": "Дата" }));
  assert.match(date, /<input[^>]*type="text"/);
  assert.match(date, /value="22\.10\.2026"/);
  assert.match(date, /inputMode="numeric"/);
  assert.match(date, /placeholder="дд\.мм\.гггг"/);
  assert.match(date, /id="d"/);
  assert.match(date, /data-testid="the-date"/);
  assert.match(date, /aria-label="Открыть календарь"/);
  assert.doesNotMatch(date, /type="date"/);
  assert.match(html(React.createElement(DateInput, { value: "", onChange() {} })), /value=""/);
  const time = html(React.createElement(TimeInput, { id: "t", value: "15:00:00", onChange() {} }));
  assert.match(time, /<input[^>]*type="text"/);
  assert.match(time, /value="15:00"/);
  assert.match(time, /placeholder="15:00"/);
  assert.match(time, /maxLength="5"/);
});

test("radio keyboard: arrows move to the next ENABLED option and wrap, Home / End jump to the ends, nothing when all are off", () => {
  const none = [false, false, false, false];
  assert.equal(f.nextRadioIndex(none, 0, "ArrowRight"), 1);
  assert.equal(f.nextRadioIndex(none, 0, "ArrowDown"), 1);
  assert.equal(f.nextRadioIndex(none, 3, "ArrowRight"), 0);  // wraps
  assert.equal(f.nextRadioIndex(none, 0, "ArrowLeft"), 3);   // wraps back
  assert.equal(f.nextRadioIndex(none, 2, "ArrowUp"), 1);
  assert.equal(f.nextRadioIndex(none, 2, "Home"), 0);
  assert.equal(f.nextRadioIndex(none, 1, "End"), 3);
  const gap = [false, true, true, false];                     // the middle options are disabled
  assert.equal(f.nextRadioIndex(gap, 0, "ArrowRight"), 3);
  assert.equal(f.nextRadioIndex(gap, 3, "ArrowLeft"), 0);
  assert.equal(f.nextRadioIndex([true, false, true], 1, "ArrowRight"), 1); // the only enabled one stays
  assert.equal(f.nextRadioIndex([true, true], 0, "ArrowRight"), -1);
  assert.equal(f.nextRadioIndex([true, false, false, true], 0, "Home"), 1);
  assert.equal(f.nextRadioIndex([true, false, false, true], 0, "End"), 2);
  assert.equal(f.nextRadioIndex(none, -1, "ArrowRight"), 0);  // nothing chosen yet: the first
  assert.equal(f.nextRadioIndex(none, -1, "ArrowLeft"), 3);
  assert.equal(f.nextRadioIndex(none, 1, "Enter"), -1);       // not our key
  assert.equal(f.nextRadioIndex(none, 1, "a"), -1);
});

test("SegmentedControl is a radiogroup of role=radio buttons with one tab stop (the chosen one) and a disabled state", () => {
  const { React, html } = renderer();
  const { SegmentedControl, Radio } = require(path.join(root, "src/components/ui/radio.tsx"));
  const options = [{ value: "cash", label: "Наличные" }, { value: "card", label: "Карта" }, { value: "x", label: "Другое", disabled: true }];
  const on = html(React.createElement(SegmentedControl, { value: "card", onChange() {}, options, ariaLabel: "Способ оплаты", testId: "methods" }));
  assert.match(on, /role="radiogroup"/);
  assert.match(on, /aria-label="Способ оплаты"/);
  assert.match(on, /data-testid="methods"/);
  assert.equal((on.match(/role="radio"/g) || []).length, 3);
  assert.match(on, /role="radio"[^>]*aria-checked="true"[^>]*tabindex="0"[^>]*>Карта|aria-checked="true"[^>]*>Карта/);
  assert.equal((on.match(/aria-checked="true"/g) || []).length, 1);
  assert.equal((on.match(/tabindex="0"/g) || []).length, 1, "one tab stop in the group");
  assert.equal((on.match(/tabindex="-1"/g) || []).length, 2);
  assert.match(on, /disabled=""[^>]*>Другое|>Другое/);
  assert.match(on, /bg-primary-50/);
  // nothing chosen: Tab lands on the first enabled option
  const none = html(React.createElement(SegmentedControl, { value: "", onChange() {}, options }));
  assert.match(none, /tabindex="0"[^>]*>Наличные/);
  // the whole group disabled
  const off = html(React.createElement(SegmentedControl, { value: "cash", onChange() {}, options, disabled: true }));
  assert.equal((off.match(/disabled=""/g) || []).length, 3);
  // the single styled Radio keeps the native radio, the bare one is only visually hidden
  const dot = html(React.createElement(Radio, { name: "g", checked: true, onChange() {} }));
  assert.match(dot, /<input[^>]*type="radio"/);
  assert.match(dot, /rounded-full/);
  assert.match(dot, /peer-checked:bg-primary-600/);
  assert.match(html(React.createElement(Radio, { bare: true, name: "g", checked: false, onChange() {} })), /class="sr-only"/);
});

test("NumberInput: a text field with the numeric keypad (no browser spinner), our own stepper only where asked, red outside [min, max]", () => {
  const { React, html } = renderer();
  const { NumberInput } = require(path.join(root, "src/components/ui/number-input.tsx"));
  const plain = html(React.createElement(NumberInput, { id: "n", value: "12", onChange() {}, min: 1, max: 30 }));
  assert.match(plain, /<input[^>]*type="text"/);
  assert.match(plain, /inputMode="numeric"/);
  assert.doesNotMatch(plain, /type="number"/);
  assert.doesNotMatch(plain, /aria-label="Больше"/); // no stepper unless asked
  assert.doesNotMatch(plain, /aria-invalid/);
  const stepper = html(React.createElement(NumberInput, { value: "30", onChange() {}, min: 1, max: 30, stepper: true }));
  assert.match(stepper, /aria-label="Меньше"/);
  assert.match(stepper, /aria-label="Больше"[^>]*disabled=""|disabled=""[^>]*aria-label="Больше"/); // at the top: «+» is off
  assert.doesNotMatch(stepper, /aria-label="Меньше"[^>]*disabled=""/);
  assert.match(stepper, /tabindex="-1"/); // the buttons are not tab stops: the arrows of the field step
  const bad = html(React.createElement(NumberInput, { value: "31", onChange() {}, min: 1, max: 30 }));
  assert.match(bad, /aria-invalid="true"/);
  assert.match(bad, /border-red-400/);
  assert.match(html(React.createElement(NumberInput, { value: "", onChange() {}, placeholder: "уроков" })), /placeholder="уроков"/);
});
