/**
 * UX-1 R3 round: the five hand-made dialogs on the shared Modal, scroll lock on iOS and the exact restore of inline styles,
 * the one «left» phrase, names of actions, the bottom bar, viewport and safe areas, the order of pending excuses,
 * and the last nits.
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
require.extensions[".tsx"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
};
const Module = require("node:module");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request.startsWith("@/") ? path.join(__dirname, "..", "src", request.slice(2)) : request, ...rest);
};

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const lib = (name) => require(path.join(root, "src/lib", name));

// ── scroll lock: exact restore (with !important) and the iOS variant ─────────────────────────────────

/** A CSSStyleDeclaration stand-in that keeps the priority of every property, like a real inline style. */
function styleOf(initial = {}) {
  const props = new Map(Object.entries(initial).map(([name, [value, priority = ""]]) => [name, { value, priority }]));
  const SHORTHAND = { overflow: ["overflow-x", "overflow-y"] };
  return {
    props,
    getPropertyValue: (name) => props.get(name)?.value ?? "",
    getPropertyPriority: (name) => props.get(name)?.priority ?? "",
    setProperty(name, value, priority = "") {
      for (const longhand of SHORTHAND[name] ?? []) props.delete(longhand);
      props.set(name, { value, priority });
    },
    removeProperty(name) {
      for (const longhand of SHORTHAND[name] ?? []) props.delete(longhand);
      const old = props.get(name)?.value ?? "";
      props.delete(name);
      return old;
    },
  };
}
const snapshot = (style) => JSON.stringify([...style.props.entries()].sort());

function pageEnv({ htmlInline = {}, bodyInline = {}, navigator, scrollY = 0, inner = 390, client = 390 } = {}) {
  const html = { style: styleOf(htmlInline), clientWidth: client };
  const body = { style: styleOf(bodyInline) };
  const scrolls = [];
  return {
    html, body, scrolls,
    env: {
      document: { documentElement: html, body },
      window: { innerWidth: inner, getComputedStyle: () => ({ paddingRight: "0px" }), scrollY, scrollTo: (x, y) => scrolls.push([x, y]), navigator },
    },
  };
}

test("scroll lock: the inline styles come back EXACTLY, the priority (!important) included, in any release order", () => {
  const { lockScroll } = lib("scroll-lock.ts");
  const page = pageEnv({ htmlInline: { overflow: ["auto", "important"], "padding-right": ["8px", "important"] }, inner: 1440, client: 1425 });
  const before = snapshot(page.html.style);
  const first = lockScroll(page.env);
  const second = lockScroll(page.env);
  assert.equal(page.html.style.getPropertyValue("overflow"), "hidden");
  second();
  first();
  assert.equal(snapshot(page.html.style), before, "value and priority are the ones that were there");
  assert.equal(page.html.style.getPropertyPriority("overflow"), "important");
  assert.equal(page.html.style.getPropertyPriority("padding-right"), "important");
});

test("scroll lock: iOS / iPadOS lock <body> (position fixed, top -scrollY, width 100%) and give the page back at its place", () => {
  const { lockScroll, scrollLockCount, isIosEnv } = lib("scroll-lock.ts");
  const iphone = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1", platform: "iPhone", maxTouchPoints: 5 };
  const page = pageEnv({ navigator: iphone, scrollY: 640, bodyInline: { position: ["relative", "important"], top: ["8px"] } });
  const htmlBefore = snapshot(page.html.style);
  const bodyBefore = snapshot(page.body.style);
  const release = lockScroll(page.env);
  assert.equal(page.body.style.getPropertyValue("position"), "fixed");
  assert.equal(page.body.style.getPropertyValue("top"), "-640px");
  assert.equal(page.body.style.getPropertyValue("width"), "100%");
  assert.equal(snapshot(page.html.style), htmlBefore, "<html> is not touched on iOS");
  const second = lockScroll(page.env); // stacked: counted, the position is read once
  assert.equal(scrollLockCount(page.env), 2);
  release();
  assert.equal(page.body.style.getPropertyValue("position"), "fixed", "still locked by the second dialog");
  assert.deepEqual(page.scrolls, []);
  second();
  assert.equal(snapshot(page.body.style), bodyBefore, "body's inline styles, !important included, are back");
  assert.deepEqual(page.scrolls, [[0, 640]], "scrollTo gives the page back where it was");
  // an iPad with desktop Safari calls itself a Mac but has a touch screen
  assert.equal(isIosEnv(pageEnv({ navigator: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 5 } }).env), true);
  assert.equal(isIosEnv(pageEnv({ navigator: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 0 } }).env), false);
  assert.equal(isIosEnv(pageEnv({ navigator: { userAgent: "Mozilla/5.0 (Linux; Android 14)", platform: "Linux armv8l", maxTouchPoints: 5 } }).env), false);
  assert.equal(isIosEnv(pageEnv({}).env), false, "no navigator: not iOS");
});

test("scroll lock: everywhere else <html> overflow is used and <body> is left alone", () => {
  const { lockScroll } = lib("scroll-lock.ts");
  const page = pageEnv({ navigator: { userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/150", platform: "Win32", maxTouchPoints: 0 }, scrollY: 300, inner: 1440, client: 1425 });
  const release = lockScroll(page.env);
  assert.equal(page.html.style.getPropertyValue("overflow"), "hidden");
  assert.equal(page.body.style.props.size, 0);
  release();
  assert.equal(page.html.style.props.size, 0);
  assert.deepEqual(page.scrolls, []);
});

// ── the whole pending queue, then the urgency order ──────────────────────────────────────────────────

/** A fake API: `total` excuses, newest lesson first (id 1 is the newest), paged like the server (limit <= 200). */
function fakeQueue(total) {
  const calls = [];
  const readPage = async (limit, offset) => {
    calls.push([limit, offset]);
    assert.ok(limit <= 200, "never more than the API allows");
    const items = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => ({ id: `e${offset + i + 1}` }));
    return { items, total, pending_total: total };
  };
  return { calls, readPage };
}

test("pending queue: a short queue is one request; a long one is read in pages of 200 up to the cap", async () => {
  const { loadAllPending, PENDING_CAP } = lib("excuses-pending.ts");
  const small = fakeQueue(37);
  const one = await loadAllPending(small.readPage);
  assert.equal(one.items.length, 37);
  assert.equal(small.calls.length, 1);
  assert.equal(one.hidden, 0);

  const mid = fakeQueue(450);
  const all = await loadAllPending(mid.readPage);
  assert.equal(all.items.length, 450, "the whole queue, not the first 50");
  assert.equal(new Set(all.items.map((item) => item.id)).size, 450);
  assert.deepEqual(mid.calls.map(([limit, offset]) => [limit, offset]), [[200, 0], [125, 200], [125, 325]], "the first page is kept; the rest in two balanced pages");
  assert.equal(all.hidden, 0);
  assert.equal(all.pendingTotal, 450);
  assert.equal(PENDING_CAP, 500);
});

test("pending queue: over the cap the OLD end is read (the deadlines that passed), the rest is counted as hidden", async () => {
  const { loadAllPending } = lib("excuses-pending.ts");
  const big = fakeQueue(1200);
  const queue = await loadAllPending(big.readPage);
  assert.equal(queue.items.length, 500, "the safety cap");
  assert.equal(queue.hidden, 700);
  assert.equal(queue.total, 1200);
  const ids = queue.items.map((item) => Number(item.id.slice(1)));
  assert.equal(Math.max(...ids), 1200, "the oldest lesson is on screen");
  assert.equal(Math.min(...ids), 701, "the newest 700 are the ones left out");
  assert.ok(big.calls.every(([limit]) => limit <= 200));
});

test("pending queue: a row that moved between two reads is not shown twice; an empty queue is an empty list", async () => {
  const { loadAllPending } = lib("excuses-pending.ts");
  let call = 0;
  const readPage = async (limit, offset) => {
    call += 1;
    return offset === 0
      ? { items: [{ id: "a" }, { id: "b" }], total: 4, pending_total: 4 }
      : { items: [{ id: "b" }, { id: "c" }], total: 4, pending_total: 4 };
  };
  const queue = await loadAllPending(readPage, { pageLimit: 2 });
  assert.deepEqual(queue.items.map((item) => item.id), ["a", "b", "c"]);
  assert.equal(queue.hidden, 1);
  const none = await loadAllPending(async () => ({ items: [], total: 0, pending_total: 0 }));
  assert.deepEqual([none.items.length, none.total, none.hidden], [0, 0, 0]);
});

test("the «Ожидают» tab reads the whole queue; decided tabs keep paging", () => {
  const page = read("src/components/attendance/excuses-page.tsx");
  assert.match(page, /if \(tab === "pending"\) \{[\s\S]*loadAllPending<AttendanceExcuseItem>/);
  assert.match(page, /limit: PAGE_SIZE, offset: page \* PAGE_SIZE/);
  assert.match(page, /!pendingTab && total > PAGE_SIZE/, "no pager over a queue that is already whole");
  assert.match(page, /sortExcusesByUrgency\(items, businessToday\)/);
});

// ── the payroll gate copy ────────────────────────────────────────────────────────────────────────────

test("payroll gate: «у всех N» when everybody is missing, «у M из N» otherwise; the adjective agrees with the number", () => {
  const R = lib("payroll.ts");
  const teacher = (id) => ({ teacher_id: id, teacher_name: id, lessons_count: 1, lesson_types: [{ lesson_type: "group", groups: 1, suggested_percent: null }], sheet: null, warnings: { open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 0 } });
  const many = (n) => Array.from({ length: n }, (_, i) => teacher(`t${i}`));
  const typedFor = (scope, missingCount) => Object.fromEntries(scope.slice(missingCount).map((t) => [R.percentKey(t.teacher_id, "group"), "50"]));
  const gate = (n, missingCount, subject) => R.calculationGate(many(n), typedFor(many(n), missingCount), subject).text;
  assert.equal(gate(3, 3, "all"), "Не указан процент у всех 3 преподавателей — укажите его, чтобы рассчитать всех");
  assert.equal(gate(3, 1, "all"), "Не указан процент у 1 из 3 преподавателей — укажите его, чтобы рассчитать всех");
  assert.equal(gate(21, 2, "all"), "Не указан процент у 2 из 21 преподавателя — укажите его, чтобы рассчитать всех");
  assert.equal(gate(21, 2, "selected"), "Не указан процент у 2 из 21 выбранного преподавателя — укажите его, чтобы рассчитать выбранных");
  assert.equal(gate(22, 5, "selected"), "Не указан процент у 5 из 22 выбранных преподавателей — укажите его, чтобы рассчитать выбранных");
  assert.equal(gate(11, 11, "selected"), "Не указан процент у всех 11 выбранных преподавателей — укажите его, чтобы рассчитать выбранных");
  assert.equal(gate(4, 4, "selected"), "Не указан процент у всех 4 выбранных преподавателей — укажите его, чтобы рассчитать выбранных");
});

// ── useDialogKeys reads the LATEST onClose (hook run by a minimal runtime: render, effects with deps, unmount) ──

/** Just enough of React's hook runtime for useRef + useEffect: a render re-runs the hook, an effect re-runs only when its deps change. */
function hookRuntime() {
  const React = require("react");
  const original = { useRef: React.useRef, useEffect: React.useEffect };
  const slots = [];
  let cursor = 0;
  let pending = [];
  React.useRef = (initial) => {
    const slot = cursor++;
    if (!slots[slot]) slots[slot] = { ref: { current: initial } };
    return slots[slot].ref;
  };
  React.useEffect = (create, deps) => { pending.push({ slot: cursor++, create, deps }); };
  return {
    render(run) {
      cursor = 0;
      pending = [];
      const result = run();
      for (const { slot, create, deps } of pending) {
        const previous = slots[slot];
        const changed = !previous || !deps || deps.some((dep, index) => !Object.is(dep, previous.deps[index]));
        if (!changed) continue;
        if (previous && previous.cleanup) previous.cleanup();
        slots[slot] = { deps, cleanup: create() };
      }
      return result;
    },
    unmount() { for (const slot of slots) if (slot && slot.cleanup) slot.cleanup(); },
    restore() { React.useRef = original.useRef; React.useEffect = original.useEffect; },
  };
}

test("useDialogKeys: Escape calls the onClose of the LATEST render, busy blocks it, closing the dialog takes it off the stack", () => {
  const handlers = new Set();
  global.document = {
    addEventListener: (type, handler) => { if (type === "keydown") handlers.add(handler); },
    removeEventListener: (type, handler) => { if (type === "keydown") handlers.delete(handler); },
  };
  const press = (key) => { for (const handler of [...handlers]) handler({ key, preventDefault() {}, shiftKey: false }); };
  const runtime = hookRuntime();
  try {
    const { useDialogKeys } = require(path.join(root, "src/components/ui/modal.tsx"));
    const { dialogLayers } = lib("modal-stack.ts");
    const dialogRef = { current: null };
    const calls = [];
    const closeA = () => calls.push("A");
    const closeB = () => calls.push("B");
    const closeC = () => calls.push("C");

    runtime.render(() => useDialogKeys(true, dialogRef, { onClose: closeA }));
    assert.equal(dialogLayers.size(), 1);
    // the dialog re-renders with a NEW onClose (a state changed): the stack must not be reshuffled and must call the new one
    runtime.render(() => useDialogKeys(true, dialogRef, { onClose: closeB }));
    assert.equal(dialogLayers.size(), 1, "one layer, however many renders");
    press("Escape");
    assert.deepEqual(calls, ["B"], "the latest onClose, not the one of the render the dialog opened in");
    // busy is read at the moment of the key too
    runtime.render(() => useDialogKeys(true, dialogRef, { busy: true, onClose: closeC }));
    press("Escape");
    assert.deepEqual(calls, ["B"], "a running request: Escape closes nothing");
    runtime.render(() => useDialogKeys(true, dialogRef, { busy: false, onClose: closeC }));
    press("Escape");
    assert.deepEqual(calls, ["B", "C"]);
    // closing the dialog (open -> false) takes the layer off the stack and the listener off the document
    runtime.render(() => useDialogKeys(false, dialogRef, { onClose: closeC }));
    assert.equal(dialogLayers.size(), 0);
    assert.equal(handlers.size, 0);
    press("Escape");
    assert.deepEqual(calls, ["B", "C"]);
    runtime.unmount();
  } finally {
    runtime.restore();
    delete global.document;
  }
});

// ── the five hand-made dialogs are the shared Modal now ─────────────────────────────────────────────

test("group create, import, assign to a group, add students (side sheet) and the staff invite use the shared Modal", () => {
  for (const file of [
    "src/components/groups/group-create-modal.tsx", "src/components/import/import-modal.tsx", "src/components/groups/assign-group-modal.tsx",
    "src/components/groups/add-student-drawer.tsx", "src/app/owner/teachers/page.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /import \{ Modal \} from "@\/components\/ui\/modal"/, file);
    assert.match(source, /<Modal\b/, file);
    assert.doesNotMatch(source, /createPortal|fixed inset-0|useScrollLock/, `${file}: no hand-made layer left`);
  }
  assert.match(read("src/components/groups/add-student-drawer.tsx"), /<Modal[\s\S]*placement="right"/);
  // the shared Modal owns role, keys, lock, focus
  const modal = read("src/components/ui/modal.tsx");
  for (const part of [/role="dialog"/, /aria-modal="true"/, /useDialogKeys\(open, dialogRef/, /useScrollLock\(open\)/, /placement === "right"/]) assert.match(modal, part);
});

test("Modal: the first field to focus is one that is on screen (the hidden file input of the import dialog is skipped)", () => {
  assert.match(read("src/components/ui/modal.tsx"), /getClientRects\(\)\.length > 0/);
});

// ── «Остался 1 день», one phrase ─────────────────────────────────────────────────────────────────────

test("leftPhrase: the verb agrees with the number, in the payments chip and in the excuses column alike", () => {
  const { leftPhrase } = lib("plural.ts");
  assert.equal(leftPhrase(1, "день", "дня", "дней"), "Остался 1 день");
  assert.equal(leftPhrase(21, "день", "дня", "дней"), "Остался 21 день");
  assert.equal(leftPhrase(2, "день", "дня", "дней"), "Осталось 2 дня");
  assert.equal(leftPhrase(11, "день", "дня", "дней"), "Осталось 11 дней");
  assert.equal(leftPhrase(1, "урок", "урока", "уроков"), "Остался 1 урок");
  const payments = lib("payments.ts");
  const row = { status: "expiring", period_mode: "calendar", days_overdue: null, days_left: 21, lessons_total: null, lessons_left: null };
  assert.equal(payments.statusLabel(row), "Остался 21 день");
  assert.equal(payments.statusLabel({ ...row, period_mode: "lessons", lessons_total: 12, lessons_left: 1 }), "Остался 1 урок из 12");
  assert.equal(payments.statusDetail({ status: "active", period_mode: "lessons", paid_until: null, lessons_total: 12, lessons_left: 1 }), "остался 1 урок из 12");
  assert.equal(lib("excuse-deadline.ts").excuseDeadlineCell({ lesson_date: "2026-10-03", status: "pending", deadline: { kind: "date", date: "2026-10-26", overdue: false, days_left: 1 } }, "2026-10-25").headline, "Остался 1 день");
  assert.doesNotMatch(read("src/lib/excuse-deadline.ts"), /\bfunction (daysWord|lessonsWord)\b/);
  assert.doesNotMatch(read("src/lib/excuse-decision.ts"), /lastTwo/);
});

// ── one name per action ─────────────────────────────────────────────────────────────────────────────

test("actions: the button, the dialog title and the toast say the same verb", () => {
  const payments = lib("payments.ts");
  assert.equal(payments.PAY_ACTION_LABEL.create, "Внести оплату");
  assert.equal(payments.PAY_ACTION_LABEL.extend, "Продлить");
  assert.deepEqual(payments.PAYMENT_SAVED_TEXT, { create: "Оплата внесена", extend: "Оплата продлена", replace: "Оплата исправлена" });
  assert.match(read("src/components/payments/payment-form-modal.tsx"), /extend: `\$\{PAY_ACTION_LABEL\.extend\} оплату`/);
  for (const file of ["src/components/payments/payments-page.tsx", "src/components/payments/membership-payments.tsx"]) {
    assert.match(read(file), /PAYMENT_SAVED_TEXT\[form\?\.kind \?\? "create"\]/, file);
  }
  const price = lib("group-price.ts");
  assert.equal(price.ASSIGN_OVERRIDE_LABEL, "Назначить индивидуальную цену");
  assert.equal(price.RETURN_TO_GROUP_LABEL, "Вернуть цену группы");
  assert.equal(price.SET_GROUP_PRICE_LABEL, "Задать цену группы");
  assert.equal(price.CHANGE_GROUP_PRICE_LABEL, "Изменить цену группы");
  const membership = read("src/components/payments/membership-price.tsx");
  assert.match(membership, /title=\{ASSIGN_OVERRIDE_LABEL\}/);
  assert.match(membership, /"Индивидуальная цена назначена"/);
  assert.match(membership, /title="Вернуть цену группы"/);
  assert.match(membership, /"Ученик снова платит по цене группы"/);
  assert.match(read("src/components/groups/group-price-dialog.tsx"), /title=\{current \? CHANGE_GROUP_PRICE_LABEL : SET_GROUP_PRICE_LABEL\}/);
  assert.match(read("src/components/groups/group-price-block.tsx"), /onNotify\(current \? "Цена группы изменена" : "Цена группы задана"\)/);
  assert.match(read("src/components/groups/group-price-block.tsx"), /\{current \? "Изменить цену" : "Задать цену"\}/);
});

// ── the bottom bar, viewport, safe areas ─────────────────────────────────────────────────────────────

test("bottom bar: the administrator's bar waits for the one fact that decides its slots; «Посещения»; «Ещё» is current", () => {
  const { bottomBarPending, BOTTOM_BAR_WAIT_MS } = lib("bottom-nav.ts");
  const base = { demo: false, summaryLoaded: false, gaveUp: false };
  assert.equal(bottomBarPending({ ...base, role: "admin" }), true, "unknown: skeleton");
  assert.equal(bottomBarPending({ ...base, role: "admin", summaryLoaded: true }), false);
  assert.equal(bottomBarPending({ ...base, role: "admin", gaveUp: true }), false, "a failing request does not hide the menu");
  assert.equal(bottomBarPending({ ...base, role: "owner" }), false, "the owner always sees payments");
  assert.equal(bottomBarPending({ ...base, role: "teacher" }), false, "a teacher never does");
  assert.equal(bottomBarPending({ ...base, role: "admin", demo: true }), false);
  assert.equal(BOTTOM_BAR_WAIT_MS, 2500);
  const sidebar = read("src/components/layout/sidebar.tsx");
  assert.equal((sidebar.match(/label: "Посещаемость", shortLabel: "Посещения"/g) || []).length, 2, "owner and administrator");
  assert.match(sidebar, /pending=\{barPending\}/);
  const nav = read("src/components/layout/bottom-nav.tsx");
  assert.match(nav, /aria-busy=\{pending \? true : undefined\}/);
  assert.match(nav, /aria-current=\{moreActive \? "page" : undefined\}/);
  assert.match(nav, /data-testid="bottom-nav-skeleton"/);
});

test("viewport-fit=cover and the safe area on every fixed edge", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /export const viewport: Viewport = \{\s*width: "device-width",\s*initialScale: 1,\s*viewportFit: "cover",\s*\}/);
  const css = read("src/app/globals.css");
  assert.match(css, /padding-top: env\(safe-area-inset-top\);/);
  assert.match(css, /\.pad-safe \{[\s\S]*max\(0\.75rem, env\(safe-area-inset-top\)\)[\s\S]*max\(0\.75rem, env\(safe-area-inset-left\)\)/);
  const modal = read("src/components/ui/modal.tsx");
  assert.match(modal, /pad-safe fixed inset-0 z-\[110\]/, "centred dialogs");
  assert.match(read("src/lib/modal-layout.ts"), /pt-\[env\(safe-area-inset-top\)\] pb-\[env\(safe-area-inset-bottom\)\] pr-\[env\(safe-area-inset-right\)\]/, "the side sheet");
  const nav = read("src/components/layout/bottom-nav.tsx");
  assert.equal((nav.match(/pl-\[env\(safe-area-inset-left\)\] pr-\[env\(safe-area-inset-right\)\]/g) || []).length, 2, "the bar and the «Ещё» sheet");
  assert.match(read("src/components/ui/toast.tsx"), /pl-\[max\(1rem,env\(safe-area-inset-left\)\)\] pr-\[max\(1rem,env\(safe-area-inset-right\)\)\] pb-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/);
  assert.match(read("src/components/layout/sidebar.tsx"), /w-\[calc\(240px\+env\(safe-area-inset-left\)\)\]/);
  assert.match(read("src/components/ui/analyzing-toast.tsx"), /pt-\[env\(safe-area-inset-top\)\]/);
});

// ── nits ─────────────────────────────────────────────────────────────────────────────────────────────

test("the payroll save bar really sticks: overflow-x is clip (not hidden) on the root, and the bar clears the bottom bar", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /html,\s*body \{[^}]*overflow-x: hidden;[^}]*overflow-x: clip;/);
  const bar = read("src/components/payroll/sheet-controls.tsx");
  assert.match(bar, /sticky bottom-2 z-30 border-primary-200 shadow-lg max-md:bottom-\[calc\(4\.5rem\+env\(safe-area-inset-bottom\)\)\]/);
});

test("nits: «Осталось: N» does not wrap, the student toast says «Отправляем ответы…», no pin stripe, tabs stay whole below 2xl", () => {
  for (const file of ["src/app/teacher/dashboard/page.tsx", "src/app/teacher/schedule/page.tsx"]) {
    assert.match(read(file), /whitespace-nowrap text-\[11px\] font-semibold text-amber-700 bg-amber-50[^"]*">\s*Осталось: \{/, file);
  }
  assert.match(read("src/app/e/[code]/page.tsx"), /text="Отправляем ответы…"/);
  assert.doesNotMatch(read("src/app/e/[code]/page.tsx"), /SUBMITTING ANSWERS/);
  assert.doesNotMatch(read("src/components/ui/analyzing-toast.tsx"), /uppercase/);
  assert.doesNotMatch(read("src/app/teacher/exams/page.tsx"), /from-amber-400 via-orange-400 to-amber-400/);
  assert.match(read("src/app/teacher/exams/page.tsx"), /<Pin className=/, "a pinned exam is still marked, by its icon");
  assert.match(read("src/components/payments/payments-page.tsx"), /flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between/);
  // the diagnostic report is a screen, not a printed form: no capitals there either
  assert.doesNotMatch(read("src/app/admin/diagnostics/[id]/report/page.tsx"), /\buppercase\b|tracking-wider/);
  assert.doesNotMatch(read("src/components/diagnostics/report-score-header.tsx"), /\buppercase\b|tracking-widest|tracking-wider/);
  // the group header wraps on a phone
  for (const role of ["owner", "admin"]) {
    const page = read(`src/app/${role}/groups/[id]/page.tsx`);
    assert.match(page, /flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between/, role);
    assert.match(page, /flex flex-wrap items-center gap-2 sm:shrink-0/, role);
  }
});

// ── the plan of the reads (no row twice, no wasted page) and the in-place patch after a decision ──────

test("pending queue plan: the rows of the first page that are in the window are kept, only the rest is requested, evenly", () => {
  const { planPendingReads, PENDING_CAP } = lib("excuses-pending.ts");
  const covered = (plan, firstLength, total) => (firstLength - plan.keepFirstFrom) + plan.reads.reduce((sum, read) => sum + read.limit, 0);
  assert.deepEqual(planPendingReads({ total: 150, firstLength: 150 }), { keepFirstFrom: 0, reads: [], hidden: 0 });
  const mid = planPendingReads({ total: 450, firstLength: 200 });
  assert.deepEqual(mid.reads, [{ offset: 200, limit: 125 }, { offset: 325, limit: 125 }]);
  assert.equal(mid.keepFirstFrom, 0);
  // 600: the window starts at 100, the first page already holds rows 100-199: two requests (3 in all, the old plan needed 4)
  const six = planPendingReads({ total: 600, firstLength: 200 });
  assert.deepEqual(six.reads, [{ offset: 200, limit: 200 }, { offset: 400, limit: 200 }]);
  assert.equal(six.keepFirstFrom, 100);
  assert.equal(covered(six, 200, 600), PENDING_CAP);
  // 620: rows 120-199 come from the first page, [200, 620) is 420 rows = 3 pages of 140 (500 rows cannot take fewer at 200 a page)
  const over = planPendingReads({ total: 620, firstLength: 200 });
  assert.deepEqual(over.reads, [{ offset: 200, limit: 140 }, { offset: 340, limit: 140 }, { offset: 480, limit: 140 }]);
  assert.equal(over.keepFirstFrom, 120);
  assert.equal(over.hidden, 120);
  assert.equal(covered(over, 200, 620), PENDING_CAP);
  // 1200: the first page was the question «how long is it»: none of its rows is in the window
  const far = planPendingReads({ total: 1200, firstLength: 200 });
  assert.equal(far.keepFirstFrom, 200);
  assert.deepEqual(far.reads, [{ offset: 700, limit: 167 }, { offset: 867, limit: 167 }, { offset: 1034, limit: 166 }]);
  assert.equal(covered(far, 200, 1200), PENDING_CAP);
  assert.ok(far.reads.every((read) => read.limit <= 200));
  // a server that sends fewer rows than it promised: the plan reads what is missing
  assert.deepEqual(planPendingReads({ total: 300, firstLength: 50 }).reads, [{ offset: 50, limit: 125 }, { offset: 175, limit: 125 }]);
});

test("pending queue: 620 rows are read once each, and a queue of 600 costs three requests", async () => {
  const { loadAllPending } = lib("excuses-pending.ts");
  const six = fakeQueue(600);
  const queue = await loadAllPending(six.readPage);
  assert.equal(six.calls.length, 3);
  assert.equal(queue.items.length, 500);
  assert.equal(new Set(queue.items.map((item) => item.id)).size, 500);
  assert.equal(queue.hidden, 100);
  const ids = queue.items.map((item) => Number(item.id.slice(1)));
  assert.deepEqual([Math.min(...ids), Math.max(...ids)], [101, 600], "the oldest 500 lessons");
  const over = fakeQueue(620);
  const rows = await loadAllPending(over.readPage);
  assert.equal(rows.items.length, 500);
  assert.equal(rows.hidden, 120);
  assert.deepEqual(over.calls.map(([, offset]) => offset), [0, 200, 340, 480]);
});

test("a decision patches the queue in place: the row leaves the pending tab, the counters follow; a reset brings it back to the list of decided", () => {
  const { applyItemChange } = lib("excuses-pending.ts");
  const state = { items: [{ id: "a", status: "pending" }, { id: "b", status: "pending" }, { id: "c", status: "pending" }], total: 3, pendingTotal: 3 };
  const decided = applyItemChange(state, { id: "b", status: "confirmed" }, "pending");
  assert.deepEqual(decided.items.map((item) => item.id), ["a", "c"]);
  assert.deepEqual([decided.total, decided.pendingTotal], [2, 2]);
  assert.deepEqual(state.items.length, 3, "the old state is not mutated");
  // still in the open tab (an edit of the same status): replaced where it stands, counters unchanged
  const edited = applyItemChange(state, { id: "c", status: "pending", reason: "новая причина" }, "pending");
  assert.deepEqual(edited.items.map((item) => item.id), ["a", "b", "c"]);
  assert.equal(edited.items[2].reason, "новая причина");
  assert.deepEqual([edited.total, edited.pendingTotal], [3, 3]);
  // the decided tab: a reset moves the row to the waiting queue
  const decidedTab = { items: [{ id: "x", status: "confirmed" }, { id: "y", status: "confirmed" }], total: 2, pendingTotal: 5 };
  const reset = applyItemChange(decidedTab, { id: "x", status: "pending" }, "confirmed");
  assert.deepEqual(reset.items.map((item) => item.id), ["y"]);
  assert.deepEqual([reset.total, reset.pendingTotal], [1, 6]);
  // a rejected one from the «Подтверждено» tab: leaves it, the waiting count does not move
  assert.deepEqual(applyItemChange(decidedTab, { id: "y", status: "rejected" }, "confirmed").pendingTotal, 5);
  // an answer that cannot be trusted, or a row that is not on screen: null = read the list again
  assert.equal(applyItemChange(state, null, "pending"), null);
  assert.equal(applyItemChange(state, { ok: true }, "pending"), null);
  assert.equal(applyItemChange(state, { id: "zzz", status: "confirmed" }, "pending"), null);
  // sequential answers (a dialog with several excuses) chain on each other
  const second = applyItemChange(decided, { id: "a", status: "rejected" }, "pending");
  assert.deepEqual(second.items.map((item) => item.id), ["c"]);
  assert.deepEqual([second.total, second.pendingTotal], [1, 1]);
});

test("the excuses page patches a decision in place and reads the list again only when it must", () => {
  const page = read("src/components/attendance/excuses-page.tsx");
  assert.match(page, /const updated = await orgApi\.reviewAttendanceExcuse\(/);
  assert.match(page, /const updated = await orgApi\.resetAttendanceExcuse\(/);
  assert.equal((page.match(/afterDecision\(\(\) => settleChange\(updated\), refreshBadge\)/g) || []).length, 2, "a decision and a reset");
  assert.match(page, /now\.hiddenPending === 0\s*\? applyItemChange/);
  assert.match(page, /\(now\.tab !== "pending" && now\.total > PAGE_SIZE\)/);
  assert.match(page, /live\.current = \{ \.\.\.now, \.\.\.patched \}/, "a chain of answers builds on the previous patch");
  // the cut reason keeps its whole text in a tooltip
  assert.match(page, /title=\{cut && !expanded \? text : undefined\}/);
});

// ── Modal: the defaults are pinned, an override lands where it should ────────────────────────────────

test("Modal defaults: width 480, the body padding and scroll, the footer layout under a divider, the card of a centred dialog", () => {
  const L = lib("modal-layout.ts");
  const layout = L.modalLayout();
  assert.equal(L.MODAL_DEFAULT_MAX_WIDTH, "max-w-[480px]");
  assert.equal(L.MODAL_BODY_DEFAULT, "px-5 sm:px-6 py-2 overflow-y-auto overscroll-contain min-h-0");
  assert.equal(L.MODAL_FOOTER_DEFAULT, "flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 p-5 sm:p-6 pt-4 mt-3");
  assert.equal(layout.body, L.MODAL_BODY_DEFAULT);
  assert.equal(layout.footer, "shrink-0 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 p-5 sm:p-6 pt-4 mt-3");
  assert.equal(
    layout.card,
    "bg-white rounded-[24px] shadow-2xl border border-slate-100 w-full max-w-[480px] max-h-full pointer-events-auto overflow-hidden flex flex-col outline-none",
  );
  assert.equal(layout.header, "flex items-start justify-between gap-3 p-5 sm:p-6 pb-3 sm:pb-4 shrink-0");
  assert.equal(layout.title, "text-lg sm:text-xl font-bold text-slate-900");
});

test("Modal overrides: the width replaces the default, bodyClassName REPLACES the body padding, footerClassName replaces the footer layout but keeps its divider", () => {
  const L = lib("modal-layout.ts");
  const custom = L.modalLayout({ maxWidthClassName: "max-w-[620px]", bodyClassName: "px-6 py-3 min-h-0", footerClassName: "flex items-center justify-between gap-3 p-6" });
  assert.match(custom.card, / w-full max-w-\[620px\] max-h-full /);
  assert.doesNotMatch(custom.card, /max-w-\[480px\]/);
  assert.equal(custom.body, "px-6 py-3 min-h-0", "no default padding left over");
  assert.equal(custom.footer, "shrink-0 border-t border-slate-100 flex items-center justify-between gap-3 p-6");
  assert.doesNotMatch(custom.footer, /flex-col-reverse/);
  // the side sheet: full height, no card chrome, safe areas, its own header and title
  const side = L.modalLayout({ placement: "right", maxWidthClassName: "max-w-md" });
  assert.match(side.card, /^bg-white shadow-2xl w-full max-w-md h-full /);
  assert.doesNotMatch(side.card, /rounded-\[24px\]/);
  assert.equal(side.header, "flex items-start justify-between gap-3 p-5 border-b border-slate-100 shrink-0");
  assert.equal(side.title, "font-semibold text-slate-900");
  assert.equal(side.body, L.MODAL_BODY_DEFAULT, "the default body is the same for a sheet");
  // the component takes everything from the layout
  const modal = read("src/components/ui/modal.tsx");
  assert.match(modal, /modalLayout\(\{ placement, maxWidthClassName, bodyClassName, footerClassName \}\)/);
  assert.equal((modal.match(/className=\{layout\.card\}/g) || []).length, 2);
  assert.match(modal, /className=\{layout\.body\}/);
  assert.match(modal, /className=\{layout\.footer\}/);
  assert.doesNotMatch(modal, /maxWidthClassName = "/, "the default lives in modal-layout.ts");
});

test("Modal opener: nothing changes the control to return to while the dialog is open (an autoFocus field is not the opener)", () => {
  const { shouldRememberOpener } = lib("modal-layout.ts");
  assert.equal(shouldRememberOpener({ dialogOpen: false, targetInsideDialog: false }), true, "the button that is about to open it");
  assert.equal(shouldRememberOpener({ dialogOpen: true, targetInsideDialog: false }), false, "autoFocus fires before the dialog's ref is attached: inside is not yet known");
  assert.equal(shouldRememberOpener({ dialogOpen: true, targetInsideDialog: true }), false);
  assert.equal(shouldRememberOpener({ dialogOpen: false, targetInsideDialog: true }), false, "the exit animation of a closing dialog");
  const modal = read("src/components/ui/modal.tsx");
  assert.match(modal, /openRef\.current = open;/, "set during render: already true in the commit that opens the dialog");
  assert.match(modal, /shouldRememberOpener\(\{ dialogOpen: openRef\.current, targetInsideDialog: Boolean\(dialogRef\.current\?\.contains\(target\)\) \}\)/);
});

// ── public pages, student sticky headers ──────────────────────────────────────────────────────────────

test("public pages keep clear of the landscape notch; the sticky header of a student's test sits below the status bar", () => {
  for (const file of ["src/app/login/page.tsx", "src/app/register/page.tsx", "src/app/activate/page.tsx", "src/app/invite/[code]/page.tsx"]) {
    const source = read(file);
    assert.match(source, /p-6 pl-\[max\(1\.5rem,env\(safe-area-inset-left\)\)\] pr-\[max\(1\.5rem,env\(safe-area-inset-right\)\)\]/, file);
  }
  for (const file of ["src/app/e/[code]/page.tsx", "src/app/d/[code]/page.tsx"]) {
    const source = read(file);
    assert.match(source, /min-h-screen w-full relative [^"]* pl-\[env\(safe-area-inset-left\)\] pr-\[env\(safe-area-inset-right\)\]/, file);
    assert.match(source, /sticky top-\[env\(safe-area-inset-top\)\] z-30/, file);
    assert.doesNotMatch(source, /sticky top-0 z-30/, file);
  }
});

test("the payroll save bar: a direct child of the SHEET page (it can stick above the bottom bar on a short phone), inside the preview section of the MONTH page", () => {
  const sheet = read("src/components/payroll/payroll-sheet-page.tsx");
  const month = read("src/components/payroll/payroll-month-page.tsx");
  assert.match(sheet, /\{tab !== "history" && \(\s*<SaveBar/);
  // the month page: the bar floats only while THIS preview is on screen, so it stays inside the preview section
  const section = month.slice(month.indexOf('aria-label="Предпросмотр расчёта"'), month.indexOf("{toastNode}"));
  assert.match(section, /<SaveBar[\s\S]*<\/section>/);
  // …and not inside the tab panel / the preview section any more
  assert.doesNotMatch(sheet.slice(sheet.indexOf('role="tabpanel" className="min-w-0 space-y-4"'), sheet.indexOf("A direct child of the page")), /<SaveBar/);
});

test("bottom bar labels: 11 px, 10 px under 360 px, so «Диагностика» is whole on a 320 px phone (measured in a browser: no label is cut for any role)", () => {
  const nav = read("src/components/layout/bottom-nav.tsx");
  assert.equal((nav.match(/max-w-full truncate text-\[11px\] max-\[359px\]:text-\[10px\] leading-none tracking-tight/g) || []).length, 2, "the sections and «Ещё»");
});

// ── a patched list stays honest: the order of reads and patches, the healing read, the wake-up read ──────

function fakeClock() {
  let now = 0;
  const timers = new Map();
  let nextId = 1;
  return {
    now: () => now,
    setTimer: (run, ms) => { const id = nextId++; timers.set(id, { at: now + ms, run }); return id; },
    clearTimer: (id) => { timers.delete(id); },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].run();
      }
      now = target;
    },
    pending: () => timers.size,
  };
}

test("queue guard: an older read that answers AFTER a patch is dropped; the silent read after the last patch heals the list", () => {
  const { createQueueGuard, HEAL_DELAY_MS } = lib("queue-guard.ts");
  const clock = fakeClock();
  const reloads = [];
  const guard = createQueueGuard({ reload: () => reloads.push(clock.now()), now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  let list = "loaded";
  // the fake order: a read starts, the administrator decides (patch), the read answers late
  const slowRead = guard.begin();
  list = "patched";
  guard.patched();
  if (guard.accepts(slowRead)) list = "answer of the old read";
  assert.equal(list, "patched", "an older in-flight read can never overwrite a newer patch");
  // the heal: one silent read 1.5 s after the last patch, not before
  clock.advance(HEAL_DELAY_MS - 1);
  assert.deepEqual(reloads, []);
  clock.advance(1);
  assert.deepEqual(reloads, [HEAL_DELAY_MS]);
  const healing = guard.begin();
  if (guard.accepts(healing)) list = "healed by the server's list";
  assert.equal(list, "healed by the server's list");
});

test("queue guard: decisions in a row cost one healing read (debounce); every patch invalidates the reads before it", () => {
  const { createQueueGuard } = lib("queue-guard.ts");
  const clock = fakeClock();
  const reloads = [];
  const guard = createQueueGuard({ reload: () => reloads.push(clock.now()), now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  guard.patched();
  clock.advance(1000);
  guard.patched();
  clock.advance(1000);
  guard.patched();
  assert.deepEqual(reloads, [], "the timer restarts with every decision");
  clock.advance(1499);
  assert.deepEqual(reloads, []);
  clock.advance(1);
  assert.equal(reloads.length, 1, "one read for three decisions");
  const a = guard.begin();
  const b = guard.begin();
  assert.equal(guard.accepts(a), false, "latest read wins");
  assert.equal(guard.accepts(b), true);
  guard.patched();
  assert.equal(guard.accepts(b), false, "a patch beats a read that started before it");
  guard.cancel();
  assert.equal(clock.pending(), 0, "the page is gone: no read is left on the timer");
  clock.advance(5000);
  assert.equal(reloads.length, 1);
});

test("queue guard: back to the window (focus / visible) reads silently, at most once a second, and not right after a read", () => {
  const { createQueueGuard } = lib("queue-guard.ts");
  const clock = fakeClock();
  const reloads = [];
  const guard = createQueueGuard({ reload: () => reloads.push(clock.now()), now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  clock.advance(10_000);
  guard.woke();
  assert.equal(reloads.length, 1);
  guard.woke();
  clock.advance(500);
  guard.woke();
  assert.equal(reloads.length, 1, "a flurry of focus and visibilitychange events is one read");
  clock.advance(600);
  guard.woke();
  assert.equal(reloads.length, 2);
  guard.begin(); // a read just started (a tab switch): focus does not start another one
  guard.woke();
  assert.equal(reloads.length, 2);
});

test("after a decision the list is patched (or read) and the badge of the sidebar is re-read - even when the patch fails", async () => {
  const { afterDecision } = lib("queue-guard.ts");
  const log = [];
  await afterDecision(async () => { log.push("patch"); }, () => log.push("badge"));
  assert.deepEqual(log, ["patch", "badge"], "badge after the patch, once");
  const failing = [];
  await assert.rejects(afterDecision(async () => { throw new Error("read failed"); }, () => failing.push("badge")), /read failed/);
  assert.deepEqual(failing, ["badge"], "a failing read does not leave a stale counter in the sidebar");
});

test("the sidebar badge really re-reads the summary after a decision, and the tab badge follows the patch", async () => {
  const { afterDecision } = lib("queue-guard.ts");
  const { applyItemChange } = lib("excuses-pending.ts");
  const Module = require("node:module");
  const originalLoad = Module._load;
  let reads = 0;
  Module._load = function (request, ...rest) {
    if (request === "./api") return { DEMO_MODE: false, orgApi: { getAttendanceExcuseSummary: async () => ({ pending_total: 4 - reads++ , open_lessons_total: 0 }) } };
    return originalLoad.call(this, request, ...rest);
  };
  let badge;
  try { badge = require(path.join(root, "src/lib/excuse-badge.ts")); } finally { Module._load = originalLoad; }
  // the page's own line, as written there
  assert.match(read("src/components/attendance/excuses-page.tsx"), /const refreshBadge = \(\) => \{ void useExcuseBadge\.getState\(\)\.refresh\(true\); \};/);
  badge.useExcuseBadge.getState().setPending(5);
  const state = { items: [{ id: "a", status: "pending" }, { id: "b", status: "pending" }], total: 2, pendingTotal: 5 };
  let patched;
  await afterDecision(() => { patched = applyItemChange(state, { id: "a", status: "confirmed" }, "pending"); }, () => { void badge.useExcuseBadge.getState().refresh(true); });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reads, 1, "the summary was asked again after the decision");
  assert.equal(badge.useExcuseBadge.getState().pending, 4, "the sidebar badge shows the server's new number");
  assert.equal(patched.pendingTotal, 4, "the «Ожидают (N)» tab follows the patch at once");
});

// ── optimistic concurrency: expected_status and EXCUSE_CHANGED ────────────────────────────────────────

test("excuseChange: only a 409 EXCUSE_CHANGED is a change; the message and the item are the server's", () => {
  const { excuseChange, EXCUSE_CHANGED } = lib("excuse-conflict.ts");
  assert.equal(EXCUSE_CHANGED, "EXCUSE_CHANGED");
  const item = { id: "e1", status: "confirmed" };
  const error = Object.assign(new Error("Пропуск уже подтвердил Алиев Рустам"), { status: 409, code: "EXCUSE_CHANGED", detail: { code: "EXCUSE_CHANGED", message: "Пропуск уже подтвердил Алиев Рустам", item } });
  assert.deepEqual(excuseChange(error), { message: "Пропуск уже подтвердил Алиев Рустам", item });
  // no item: the list is read again (item null); no message: a fallback sentence
  const bare = excuseChange(Object.assign(new Error(""), { status: 409, code: "EXCUSE_CHANGED" }));
  assert.equal(bare.item, null);
  assert.match(bare.message, /уже изменили/);
  // everything else is not a change
  assert.equal(excuseChange(Object.assign(new Error("x"), { status: 409, code: "SHEET_REVISION_CONFLICT" })), null);
  assert.equal(excuseChange(Object.assign(new Error("x"), { status: 500, code: "EXCUSE_CHANGED" })), null);
  assert.equal(excuseChange(new Error("network")), null);
  assert.equal(excuseChange(null), null);
  assert.equal(excuseChange("EXCUSE_CHANGED"), null);
});

test("a decision and a reset carry expected_status (the status the dialog showed) from the list and from the journal", () => {
  const api = read("src/lib/api.ts");
  assert.match(api, /reviewAttendanceExcuse: \(id: string, data: \{ decision: "confirmed" \| "rejected"; note\?: string; expected_status\?: ExcuseReviewStatus \}\)/);
  assert.match(api, /resetAttendanceExcuse: \(id: string, data\?: \{ expected_status\?: ExcuseReviewStatus \}\)/);
  const list = read("src/components/attendance/excuses-page.tsx");
  assert.match(list, /reviewAttendanceExcuse\(item\.id, \{ decision, expected_status: item\.status,/);
  assert.match(list, /resetAttendanceExcuse\(item\.id, \{ expected_status: item\.status \}\)/);
  const journal = read("src/components/groups/group-attendance-journal.tsx");
  assert.match(journal, /resetAttendanceExcuse\(excuse\.id, \{ expected_status: excuse\.status \}\)/);
  assert.match(journal, /reviewAttendanceExcuse\(excuse\.id, \{ decision: action, expected_status: excuse\.status,/);
});

test("on EXCUSE_CHANGED the dialog stays open with the server's message, the row takes the new state; both screens", () => {
  const list = read("src/components/attendance/excuses-page.tsx");
  const reviewBlock = list.slice(list.indexOf("const review = async"), list.indexOf("const resetDecision"));
  assert.match(reviewBlock, /const changed = excuseChange\(error\);/);
  assert.match(reviewBlock, /await afterDecision\(\(\) => settleChange\(changed\.item\), refreshBadge\);\s*return changed\.message;/, "the message is returned: the dialog shows it and stays open");
  assert.match(reviewBlock, /status: fresh\.status as ExcuseReviewStatus/, "a second press is a decision about the NEW state");
  const resetBlock = list.slice(list.indexOf("const resetDecision"), list.indexOf("const openDialog"));
  assert.match(resetBlock, /showToast\(changed\.message, "warning"\)/);
  assert.equal((list.match(/afterDecision\(\(\) => settleChange\([a-z.]+\), refreshBadge\)/g) || []).length, 4, "every settle goes through afterDecision with the badge");
  const journal = read("src/components/groups/group-attendance-journal.tsx");
  assert.match(journal, /const changed = excuseChange\(error\);[\s\S]*return changed\.message;/);
  assert.match(journal, /items: current\.items\.map\(\(entry\) => \(entry\.id === excuse\.id \? \{ \.\.\.entry, status:/);
  // the dialog shows the error and does not close on it (both screens): an error string means «stay open»
  assert.match(list, /if \(error\) \{ setDialogError\(error\); return; \}/);
  assert.match(journal, /if \(error\) setReviewDialog\(\(current\) => \(current \? \{ \.\.\.current, error \} : current\)\);\s*else closeReviewDialog\(\);/);
});

test("the excuses page: reads and patches go through the guard; a patch bumps the token; focus and visibility read silently", () => {
  const page = read("src/components/attendance/excuses-page.tsx");
  assert.match(page, /const token = guard\.begin\(\);/);
  assert.equal((page.match(/guard\.accepts\(token\)/g) || []).length, 4, "every await of load asks the guard");
  assert.doesNotMatch(page, /requests\.current/);
  assert.match(page, /guard\.patched\(\);\s*setLoading\(false\);/, "a patch invalidates older reads");
  assert.match(page, /window\.addEventListener\("focus", onFocus\)/);
  assert.match(page, /document\.addEventListener\("visibilitychange", onVisible\)/);
  assert.match(page, /document\.visibilityState === "visible"\) guard\.woke\(\)/);
  assert.match(page, /guard\.cancel\(\);/);
});
