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
  assert.deepEqual(mid.calls.map(([, offset]) => offset), [0, 200, 400], "the first page is reused, then 200 and 400");
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
  assert.ok(big.calls.every(([limit]) => limit === 200));
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
  assert.match(modal, /pt-\[env\(safe-area-inset-top\)\] pb-\[env\(safe-area-inset-bottom\)\] pr-\[env\(safe-area-inset-right\)\]/, "the side sheet");
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
