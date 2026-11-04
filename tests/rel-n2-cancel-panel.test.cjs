// REL-N2: the form of «Урока не было» (LessonCancelPanel) on the lesson panel - the minimum of the reason is a quiet grey line from the start, it turns red only after
// an attempt to send a short reason or after the field is left; the button stays pressable and a short reason is never sent.  The real component runs in the small renderer.
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
  const field = () => s.all((n) => n.tag === "textarea")[0];
  const type = async (text) => { await s.call(() => field().props.onChange({ target: { value: text } })); };
  return { s, sent, hint, field, type };
}

test("[RN2-1] at the start: a grey line with the minimum, no red, the button is pressable", () => {
  const { s, hint } = mount();
  assert.ok(hint(), "the hint found");
  assert.match(s.text(), /Укажите причину — не менее 3 символов/);
  assert.match(hint().props.className, /text-slate-500/);
  assert.doesNotMatch(hint().props.className, /rose/);
  assert.equal(hint().props.role, undefined, "a quiet line, not an alert");
  assert.equal(s.button(/^Урока не было$/).props.disabled, false, "the button is not switched off");
});

test("[RN2-2] typing a short reason does not turn the line red", async () => {
  const { hint, type } = mount();
  await type("ab");
  assert.match(hint().props.className, /text-slate-500/);
  assert.doesNotMatch(hint().props.className, /rose/);
});

test("[RN2-3] pressing with a short (or empty) reason shows the red error and sends nothing; a fixed reason goes", async () => {
  const { s, sent, hint, type } = mount();
  await s.click(/^Урока не было$/);
  assert.deepEqual(sent, [], "an empty reason is not sent");
  assert.match(hint().props.className, /rose-700/, "red after the attempt");
  assert.equal(hint().props.role, "alert");
  await type("ab");
  await s.click(/^Урока не было$/);
  assert.deepEqual(sent, [], "a short reason is not sent");
  await type("Заболел преподаватель");
  assert.equal(hint(), undefined, "a good reason: no line");
  await s.click(/^Урока не было$/);
  assert.deepEqual(sent, ["Заболел преподаватель"]);
});

test("[RN2-4] leaving the field with a short reason turns the line red (an empty field too); a good reason leaves no line", async () => {
  const { s, field, hint, type } = mount();
  await s.call(() => field().props.onBlur());
  assert.match(hint().props.className, /rose-700/);
  assert.equal(field().props["aria-invalid"], true);
  await type("Заболел");
  assert.equal(hint(), undefined);
  assert.equal(field().props["aria-invalid"], undefined);
});

test("[RN2-5] the same on the one-off cancellation; the limits stay 3..500", async () => {
  const { s, sent, field, hint } = mount({ oneOff: true });
  assert.equal(field().props.maxLength, 500);
  await s.click(/^Отменить урок$/);
  assert.deepEqual(sent, []);
  assert.match(hint().props.className, /rose-700/);
});

test("[RN2-6] a blocking exam still switches the button off (it is not about the reason)", () => {
  const { s } = mount({ binding: { loading: false, attached: true, canCancel: false, message: "Идёт экзамен" }, start: "Заболел" });
  assert.equal(s.button(/^Урока не было$/).props.disabled, true);
});

test("[RN2-7] the places of the panel: both uses on the lesson panel show it the same way (one component, no own copy of the rule)", () => {
  const fs = require("node:fs");
  const panel = fs.readFileSync(path.join(harness.root, "src/components/teacher/lesson-panel.tsx"), "utf8");
  assert.equal((panel.match(/<LessonCancelPanel/g) || []).length, 2, "the lesson panel and the dialog «Пропущенный урок»");
  for (const file of ["src/app/teacher/schedule/page.tsx", "src/app/teacher/dashboard/page.tsx"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(harness.root, file), "utf8"), /<LessonCancelPanel/, `${file}: the screens use the shared panel`);
  }
});

test("[RN2-8] cancelShownInCard: the card shows «Урока не было» exactly where its state card has the button; elsewhere the row stays in the menu", () => {
  const { cancelShownInCard } = require(path.join(harness.root, "src/lib/lesson-panel-view.ts"));
  const base = { banner: "overdue", overviewShown: true, attendanceSaved: false, missedUnknown: false, missedAction: false };
  const shown = (extra) => cancelShownInCard({ ...base, ...extra });
  assert.equal(shown({}), true, "overdue");
  assert.equal(shown({ attendanceSaved: true }), false, "overdue with the marks saved: the card has no buttons");
  assert.equal(shown({ banner: "past" }), true, "past, no task");
  assert.equal(shown({ banner: "past", missedAction: true }), false, "past with a task: «Разобрать»");
  assert.equal(shown({ banner: "past", missedUnknown: true }), false, "past, the list unread: «Повторить»");
  assert.equal(shown({ banner: "subsequent" }), true);
  for (const banner of ["ready", "upcoming", "future", "started", "saved", "dirty", "completed", "cancelled", "tooOld"]) assert.equal(shown({ banner }), false, banner);
  assert.equal(shown({ overviewShown: false }), false, "no state card (another teacher leads / loading / empty roster / marking)");
});
