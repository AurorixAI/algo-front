// REL-N2: the form of «Урока не было» (LessonCancelPanel) on the lesson panel - the minimum of the reason is a quiet grey line from the start, it turns red only after
// an attempt to send a short reason or after the field is left; the button stays pressable and a short reason is never sent.
// R3 round: the error is read from a live region that is in the page from the start, the focus returns to the field, a field left empty is not an error.  The real component runs in the small renderer.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const harness = require("./helpers/page-harness.cjs");
const React = require("react");

const { LessonCancelPanel } = require(path.join(harness.root, "src/components/substitutions/lesson-cancel-panel.tsx"));
const GOOD = { loading: false, attached: false, canCancel: true };

/** The panel with a reason held by a parent, as on the lesson panel; `sent` collects what reaches the server. */
function mount({ binding = GOOD, oneOff = false, start = "" } = {}) {
  const sent = [];
  function Host() {
    const [reason, setReason] = React.useState(start);
    return React.createElement(LessonCancelPanel, { date: "2026-11-04", binding, oneOff, reason, onReason: setReason, busy: false, onConfirm: () => sent.push(reason), onBack() {} });
  }
  const s = harness.screen(Host, {});
  const hint = () => s.all((n) => n.props["data-testid"] === "reason-hint")[0];
  const live = () => s.all((n) => n.props["data-testid"] === "reason-error")[0];
  const field = () => s.all((n) => n.tag === "textarea")[0];
  const type = async (text) => { await s.call(() => field().props.onChange({ target: { value: text } })); };
  const press = () => s.click(/^(Урока не было|Отменить урок)$/);
  const red = () => (live().children.length > 0 ? live().props.className : "");
  return { s, sent, hint, live, field, type, press, red };
}

test("[RN2-1] at the start: a grey line with the minimum (contrast), no red, the button is pressable", () => {
  const { s, hint, live, red } = mount();
  assert.ok(hint(), "the hint found");
  assert.match(s.text(), /Укажите причину — не менее 3 символов/);
  assert.match(hint().props.className, /text-slate-600/);
  assert.doesNotMatch(hint().props.className, /rose/);
  assert.equal(hint().props.role, undefined, "a quiet line, not an alert");
  assert.ok(live(), "the live region is in the page from the start");
  assert.equal(live().props["aria-live"], "polite");
  assert.equal(red(), "", "and it is empty");
  assert.equal(s.button(/^Урока не было$/).props.disabled, false, "the button is not switched off");
});

test("[RN2-2] typing a short reason does not turn the line red", async () => {
  const { hint, red, type } = mount();
  await type("ab");
  assert.match(hint().props.className, /text-slate-600/);
  assert.equal(red(), "");
});

test("[RN2-3] pressing with a short (or empty) reason shows the error in the live region and sends nothing; a fixed reason goes", async () => {
  const { s, sent, hint, live, field, type, press } = mount();
  await press();
  assert.deepEqual(sent, [], "an empty reason is not sent");
  assert.match(live().props.className, /rose-700/, "red after the attempt");
  assert.match(s.text(), /Укажите причину — не менее 3 символов/);
  assert.equal(s.all((n) => /Укажите причину/.test(n.children.join?.("") ?? "") && n.tag === "p").length, 1, "the sentence is said once (LESSONS 87): the grey hint gives way to the error");
  assert.equal(hint(), undefined);
  assert.equal(field().props["aria-describedby"], live().props.id, "the field points at the error");
  await type("ab");
  await press();
  assert.deepEqual(sent, [], "a short reason is not sent");
  await type("Заболел преподаватель");
  assert.equal(hint(), undefined, "a good reason: no line");
  assert.equal(live().children.length, 0);
  await press();
  assert.deepEqual(sent, ["Заболел преподаватель"]);
});

test("[RN2-4] after a failed press the focus goes to the field; after a good one it does not move", async () => {
  // the renderer attaches no refs: the ref of the field is filled by hand (the only useRef of the component)
  let focused = 0;
  const realUseRef = React.useRef;
  React.useRef = (initial) => { const ref = realUseRef(initial); ref.current = { focus() { focused += 1; } }; return ref; };
  try {
    const { type, press } = mount();
    await press();
    assert.equal(focused, 1, "the field gets the focus");
    await type("Заболел");
    await press();
    assert.equal(focused, 1, "a good reason is sent, the focus stays");
  } finally { React.useRef = realUseRef; }
});

test("[RN2-5] leaving the field after typing a short reason turns the line red; an untouched empty field does not (alt-tab, a tap aside)", async () => {
  const { field, hint, live, red, type, s } = mount();
  await s.call(() => field().props.onBlur());
  assert.equal(red(), "", "nothing was typed: no error");
  assert.ok(hint(), "the grey hint stays");
  await type("ab");
  await s.call(() => field().props.onBlur());
  assert.match(live().props.className, /rose-700/);
  assert.equal(field().props["aria-invalid"], true);
  await type("Заболел");
  assert.equal(field().props["aria-invalid"], undefined);
  assert.equal(live().children.length, 0);
});

test("[RN2-5b] typed and erased, then left: that is an error", async () => {
  const { field, live, type, s } = mount();
  await type("a");
  await type("");
  await s.call(() => field().props.onBlur());
  assert.match(live().props.className, /rose-700/);
});

test("[RN2-6] the edges of the reason: exactly 3 goes, 2 and only blanks do not, 500 goes, the field holds 500", async () => {
  const { s, sent, field, type, press } = mount();
  assert.equal(field().props.maxLength, 500, "the limit of the field is the server's");
  await type("   "); await press();
  assert.deepEqual(sent, [], "only blanks");
  await type("  ab  "); await press();
  assert.deepEqual(sent, [], "2 characters between blanks");
  await type("abc"); await press();
  assert.deepEqual(sent, ["abc"], "exactly 3");
  await type("x".repeat(500)); await press();
  assert.equal(sent.length, 2);
  assert.equal(sent[1].length, 500, "exactly 500");
  await type("x".repeat(501)); await press();
  assert.equal(sent.length, 2, "501 is not sent (the server refuses it, the field cuts it)");
  assert.match(s.text(), /не более 500 символов/);
});

test("[RN2-7] the same on the one-off cancellation; the limits stay 3..500", async () => {
  const { sent, field, live, press } = mount({ oneOff: true });
  assert.equal(field().props.maxLength, 500);
  await press();
  assert.deepEqual(sent, []);
  assert.match(live().props.className, /rose-700/);
});

test("[RN2-8] a blocking exam still switches the button off (it is not about the reason)", () => {
  const { s } = mount({ binding: { loading: false, attached: true, canCancel: false, message: "Идёт экзамен" }, start: "Заболел" });
  assert.equal(s.button(/^Урока не было$/).props.disabled, true);
});

test("[RN2-9] the ids of the hint and of the error are not shared between two forms on the screen (useId)", () => {
  const a = mount(); const b = mount();
  assert.notEqual(a.live().props.id, b.live().props.id);
  assert.notEqual(a.hint().props.id, b.hint().props.id);
  assert.notEqual(a.hint().props.id, a.live().props.id);
});

test("[RN2-10] the places of the panel: both uses on the lesson panel show it the same way (one component, no own copy of the rule)", () => {
  const fs = require("node:fs");
  const panel = fs.readFileSync(path.join(harness.root, "src/components/teacher/lesson-panel.tsx"), "utf8");
  assert.equal((panel.match(/<LessonCancelPanel/g) || []).length, 2, "the lesson panel and the dialog «Пропущенный урок»");
  for (const file of ["src/app/teacher/schedule/page.tsx", "src/app/teacher/dashboard/page.tsx"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(harness.root, file), "utf8"), /<LessonCancelPanel/, `${file}: the screens use the shared panel`);
  }
});

test("[RN2-11] cancelEntryPoint: ONE road to the cancellation - the card, the dialog «Разобрать», the menu; «Повторить» waits", () => {
  const { cancelEntryPoint } = require(path.join(harness.root, "src/lib/lesson-panel-view.ts"));
  const base = { banner: "overdue", overviewShown: true, attendanceSaved: false, missedUnknown: false, missedAction: false };
  const entry = (extra) => cancelEntryPoint({ ...base, ...extra });
  assert.equal(entry({}), "card", "overdue");
  assert.equal(entry({ attendanceSaved: true }), "menu", "overdue with the marks saved: the card has no buttons");
  assert.equal(entry({ banner: "past" }), "card", "past, no task");
  assert.equal(entry({ banner: "past", missedAction: true }), "dialog", "past with a task: «Разобрать» opens the dialog with both outcomes");
  assert.equal(entry({ banner: "past", missedUnknown: true }), "wait", "past, the list unread: «Повторить»");
  assert.equal(entry({ banner: "subsequent" }), "card");
  for (const banner of ["ready", "upcoming", "future", "started", "saved", "dirty"]) assert.equal(entry({ banner }), "menu", banner);
  for (const extra of [{}, { banner: "past" }, { banner: "past", missedAction: true }, { banner: "past", missedUnknown: true }]) assert.equal(entry({ ...extra, overviewShown: false }), "menu", "no state card on the screen: the row stays in the menu");
});

test("[RN2-12] focusEntryAgain: the focus returns to the first mark that exists (the card button, then the «⋯»)", () => {
  const { focusEntryAgain } = require(path.join(harness.root, "src/lib/focus-entry.ts"));
  const seen = [];
  const root = (marks) => ({ querySelector: (sel) => (marks.includes(sel) ? { focus: () => seen.push(sel) } : null) });
  const saved = global.requestAnimationFrame;
  global.requestAnimationFrame = (fn) => fn();
  try {
    focusEntryAgain(root(["[data-cancel-entry]", "[data-lesson-menu-button]"]), ["[data-cancel-entry]", "[data-lesson-menu-button]"]);
    focusEntryAgain(root(["[data-lesson-menu-button]"]), ["[data-cancel-entry]", "[data-lesson-menu-button]"]);
    focusEntryAgain(null, ["[data-cancel-entry]"]);
  } finally { global.requestAnimationFrame = saved; }
  assert.deepEqual(seen, ["[data-cancel-entry]", "[data-lesson-menu-button]"]);
});

test("[RN2-13] «Назад» of both forms hands the focus back to the button that opened them; the marks are on the buttons", () => {
  const fs = require("node:fs");
  const panel = fs.readFileSync(path.join(harness.root, "src/components/teacher/lesson-panel.tsx"), "utf8");
  assert.match(panel, /setLessonExamBinding\(null\); focusEntryAgain\(panelRef\.current, \["\[data-cancel-entry\]", "\[data-lesson-menu-button\]"\]\)/);
  assert.match(panel, /setMissedLessonError\(null\); focusEntryAgain\(missedRef\.current, \["\[data-cancel-entry\]"\]\)/);
  assert.equal((panel.match(/data-cancel-entry\n/g) || []).length, 2, "the card button and the choice of the dialog");
  assert.match(fs.readFileSync(path.join(harness.root, "src/components/substitutions/teacher-lesson-controls.tsx"), "utf8"), /data-lesson-menu-button/);
});
