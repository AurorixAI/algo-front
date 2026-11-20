/**
 * UX-1 stream D: navigation and shell.
 * (1) the phone's bottom bar: which four sections each role gets, the «Ещё» sheet, counters, safe area, toasts above it;
 * (2) Escape and the focus trap belong to the TOPMOST open dialog only;
 * (3) the payments notice: «2 ученика с просроченной оплатой» / «5 учеников ждут оплаты» + «из них просрочено: 2», one phone row.
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
const lib = (name) => require(path.join(root, "src/lib", name));

// ── plural ────────────────────────────────────────────────────────────────────────────────────────

test("pluralRu: 1 / 2-4 / 5-20 / 21 / 22 / 11-14 / 0 / negative / garbage, both call forms", () => {
  const { pluralRu } = lib("plural.ts");
  const forms = ["ученик", "ученика", "учеников"];
  const expected = {
    0: "учеников", 1: "ученик", 2: "ученика", 4: "ученика", 5: "учеников", 10: "учеников", 11: "учеников", 12: "учеников",
    14: "учеников", 15: "учеников", 20: "учеников", 21: "ученик", 22: "ученика", 25: "учеников", 101: "ученик", 111: "учеников",
    112: "учеников", 121: "ученик", 1000: "учеников", 1001: "ученик",
  };
  for (const [n, word] of Object.entries(expected)) {
    assert.equal(pluralRu(Number(n), "ученик", "ученика", "учеников"), word, n);
    assert.equal(pluralRu(Number(n), forms), word, `${n} (tuple)`);
  }
  assert.equal(pluralRu(-2, "ученик", "ученика", "учеников"), "ученика", "by the absolute value");
  assert.equal(pluralRu(2.9, "ученик", "ученика", "учеников"), "ученика", "the fraction is cut");
  assert.equal(pluralRu(Number.NaN, "ученик", "ученика", "учеников"), "учеников");
  assert.equal(pluralRu(Infinity, "ученик", "ученика", "учеников"), "учеников");
});

// ── the stack of dialogs ──────────────────────────────────────────────────────────────────────────

/** A keyboard host that counts its listeners and lets the test press a key. */
function fakeHost() {
  const host = { listeners: new Set(), attached: 0, detached: 0 };
  host.listen = (handler) => {
    host.attached += 1;
    host.listeners.add(handler);
    return () => { host.detached += 1; host.listeners.delete(handler); };
  };
  host.press = (event) => { for (const handler of [...host.listeners]) handler(event); };
  return host;
}

test("dialog stack: a key goes to the topmost dialog only", () => {
  const { createLayerStack } = lib("modal-stack.ts");
  const host = fakeHost();
  const stack = createLayerStack(host);
  const calls = [];
  const first = stack.push(() => calls.push("form"));
  const second = stack.push(() => calls.push("confirm"));
  host.press({ key: "Escape" });
  assert.deepEqual(calls, ["confirm"], "one Escape reaches the confirmation, not the form under it");
  second.remove();
  host.press({ key: "Escape" });
  assert.deepEqual(calls, ["confirm", "form"], "with the confirmation gone the form is on top again");
  first.remove();
  host.press({ key: "Escape" });
  assert.deepEqual(calls, ["confirm", "form"], "nothing open: nothing happens");
});

test("dialog stack: ONE document listener serves all dialogs and goes away with the last one", () => {
  const { createLayerStack } = lib("modal-stack.ts");
  const host = fakeHost();
  const stack = createLayerStack(host);
  const a = stack.push(() => {});
  const b = stack.push(() => {});
  assert.equal(host.attached, 1);
  assert.equal(stack.size(), 2);
  a.remove();
  assert.equal(host.detached, 0, "one dialog is still open");
  b.remove();
  assert.equal(host.detached, 1);
  assert.equal(host.listeners.size, 0);
  const c = stack.push(() => {});
  assert.equal(host.attached, 2, "opened again: listening again");
  c.remove();
});

test("dialog stack: the top dialog closing during the key press does not hand the same key to the one below", () => {
  const { createLayerStack } = lib("modal-stack.ts");
  const host = fakeHost();
  const stack = createLayerStack(host);
  const calls = [];
  stack.push(() => calls.push("form"));
  let confirm;
  confirm = stack.push(() => { calls.push("confirm"); confirm.remove(); });
  host.press({ key: "Escape" });
  assert.deepEqual(calls, ["confirm"]);
  host.press({ key: "Escape" });
  assert.deepEqual(calls, ["confirm", "form"]);
});

test("dialog stack: removing a layer from the middle keeps the order of the others; remove is idempotent", () => {
  const { createLayerStack } = lib("modal-stack.ts");
  const host = fakeHost();
  const stack = createLayerStack(host);
  const calls = [];
  stack.push(() => calls.push("bottom"));
  const middle = stack.push(() => calls.push("middle"));
  stack.push(() => calls.push("top"));
  middle.remove();
  middle.remove();
  assert.equal(stack.size(), 2);
  host.press({ key: "Escape" });
  assert.deepEqual(calls, ["top"]);
});

/** A dialog with the given controls; focus() records which control has focus. */
function fakeDialog(controlNames, activeName) {
  const focus = { active: activeName };
  const controls = controlNames.map((name) => ({
    name,
    hasAttribute: () => false,
    getAttribute: () => null,
    offsetParent: {},
    focus: () => { focus.active = name; },
  }));
  const dialog = {
    focused: false,
    querySelectorAll: () => controls,
    contains: (el) => controls.includes(el),
    focus() { dialog.focused = true; },
  };
  global.document = { get activeElement() { return controls.find((c) => c.name === focus.active) ?? null; } };
  return { dialog, controls, focus };
}
const keyEvent = (key, extra = {}) => ({ key, shiftKey: false, prevented: false, preventDefault() { this.prevented = true; }, ...extra });

test("dialog keys: Escape closes unless busy; Tab wraps inside the dialog; with no controls the dialog itself takes focus", () => {
  const { handleDialogKey } = lib("modal-stack.ts");
  let closed = 0;
  const state = { busy: false, onClose: () => { closed += 1; } };
  const { dialog, focus } = fakeDialog(["a", "b", "c"], "c");

  handleDialogKey(keyEvent("Escape"), dialog, state);
  assert.equal(closed, 1);
  handleDialogKey(keyEvent("Escape"), dialog, { ...state, busy: true });
  assert.equal(closed, 1, "busy: Escape does nothing");

  const tab = keyEvent("Tab");
  handleDialogKey(tab, dialog, state);
  assert.equal(tab.prevented, true);
  assert.equal(focus.active, "a", "Tab on the last control wraps to the first");

  const back = keyEvent("Tab", { shiftKey: true });
  handleDialogKey(back, dialog, state);
  assert.equal(back.prevented, true);
  assert.equal(focus.active, "c", "Shift+Tab on the first control wraps to the last");

  focus.active = "b";
  const middle = keyEvent("Tab");
  handleDialogKey(middle, dialog, state);
  assert.equal(middle.prevented, false, "in the middle the browser moves focus itself");

  const empty = fakeDialog([], null);
  const none = keyEvent("Tab");
  handleDialogKey(none, empty.dialog, state);
  assert.equal(none.prevented, true);
  assert.equal(empty.dialog.focused, true);
  delete global.document;
});

test("modal.tsx: the shared Modal and the sheet use the stack; no dialog listens to the keyboard on its own", () => {
  const modal = read("src/components/ui/modal.tsx");
  assert.match(modal, /dialogLayers\.push\(/);
  assert.match(modal, /export function useDialogKeys\(/);
  assert.match(modal, /useDialogKeys\(open, dialogRef, \{ busy, onClose \}\)/);
  assert.doesNotMatch(modal, /addEventListener\("keydown"/, "the one document listener lives in modal-stack.ts");
  assert.match(modal, /\}, \[open, dialogRef\]\)/, "onClose is read from a ref: a new function every render must not reshuffle the stack");
  const sheet = read("src/components/layout/bottom-nav.tsx");
  assert.match(sheet, /useDialogKeys\(open, sheetRef, \{ onClose \}\)/);
  assert.match(sheet, /useScrollLock\(open\)/);
});

// ── the bottom bar ────────────────────────────────────────────────────────────────────────────────

const sidebarSource = read("src/components/layout/sidebar.tsx");
const hrefsOf = (from, to) => [...sidebarSource.slice(sidebarSource.indexOf(from), sidebarSource.indexOf(to)).matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
const MENU = {
  owner: hrefsOf("const ownerNav", "const teacherNav"),
  admin: hrefsOf("const adminNav", "const ownerNav"),
  teacher: hrefsOf("const teacherNav", "const navItems"),
};
const items = (hrefs) => hrefs.map((href) => ({ href }));
const hrefsAfterSplit = (list) => list.map((item) => item.href);

test("bottom bar: the priority lists name real menu items, nothing else", () => {
  const { BOTTOM_NAV_PRIORITY } = lib("bottom-nav.ts");
  for (const role of ["owner", "admin", "teacher"]) {
    assert.deepEqual([...BOTTOM_NAV_PRIORITY[role]].sort(), [...MENU[role]].sort(), `${role}: the list is the menu`);
  }
});

test("bottom bar, owner: Панель, Группы, Ученики, Оплаты; the rest (Посещаемость first) rides on «Ещё»", () => {
  const { splitBottomNav, BOTTOM_NAV_PRIORITY } = lib("bottom-nav.ts");
  const { bar, more } = splitBottomNav(items(MENU.owner), BOTTOM_NAV_PRIORITY.owner);
  assert.deepEqual(hrefsAfterSplit(bar), ["/owner/dashboard", "/owner/groups", "/owner/students", "/owner/payments"]);
  assert.deepEqual(hrefsAfterSplit(more), ["/owner/attendance", "/owner/substitutions", "/owner/payroll", "/owner/teachers"]);
  // a menu without attendance / payments / payroll: the next ones by priority fill the bar
  const short = splitBottomNav(items(["/owner/dashboard", "/owner/groups", "/owner/students", "/owner/teachers"]), BOTTOM_NAV_PRIORITY.owner);
  assert.deepEqual(hrefsAfterSplit(short.bar), ["/owner/dashboard", "/owner/groups", "/owner/students", "/owner/teachers"]);
  assert.deepEqual(short.more, []);
});

test("bottom bar, admin: Диагностика, Ученики, Группы, Оплаты; without the payments right «Посещаемость» takes the slot", () => {
  const { splitBottomNav, BOTTOM_NAV_PRIORITY } = lib("bottom-nav.ts");
  const full = splitBottomNav(items(MENU.admin), BOTTOM_NAV_PRIORITY.admin);
  assert.deepEqual(hrefsAfterSplit(full.bar), ["/admin/diagnostics", "/admin/students", "/admin/groups", "/admin/payments"], "menu order");
  assert.deepEqual(hrefsAfterSplit(full.more), ["/admin/exams", "/admin/teachers", "/admin/attendance", "/admin/substitutions"]);   // K2-2: «Сотрудники» of the administrator rides on «Ещё»
  const noPayments = splitBottomNav(items(MENU.admin.filter((href) => href !== "/admin/payments")), BOTTOM_NAV_PRIORITY.admin);
  assert.deepEqual(hrefsAfterSplit(noPayments.bar), ["/admin/diagnostics", "/admin/students", "/admin/groups", "/admin/attendance"]);
  assert.deepEqual(hrefsAfterSplit(noPayments.more), ["/admin/exams", "/admin/teachers", "/admin/substitutions"]);
});

test("bottom bar, teacher: four sections in the order of the menu; «Моя зарплата» (Money-1 V, the fifth item) and the profile and the quick action ride on «Ещё»", () => {
  const { splitBottomNav, BOTTOM_NAV_PRIORITY } = lib("bottom-nav.ts");
  const { bar, more } = splitBottomNav(items(MENU.teacher), BOTTOM_NAV_PRIORITY.teacher);
  assert.deepEqual(hrefsAfterSplit(bar), MENU.teacher.filter((href) => href !== "/teacher/payroll"));
  assert.equal(bar.length, 4);
  assert.deepEqual(hrefsAfterSplit(more), ["/teacher/payroll"]);
  assert.match(sidebarSource, /quickAction=\{isTeacher \? \{ href: "\/teacher\/exams\/new", label: "Создать экзамен", icon: Plus \} : undefined\}/);
});

test("bottom bar: never more than four in the bar, unlisted items go to «Ещё», the menu order is kept", () => {
  const { splitBottomNav } = lib("bottom-nav.ts");
  const list = items(["/a", "/b", "/c", "/d", "/e", "/f"]);
  const { bar, more } = splitBottomNav(list, ["/e", "/a", "/c"]);
  assert.deepEqual(hrefsAfterSplit(bar), ["/a", "/b", "/c", "/e"], "listed first, then the first unlisted one; shown in menu order");
  assert.deepEqual(hrefsAfterSplit(more), ["/d", "/f"]);
  assert.equal(splitBottomNav(list, [], 0).bar.length, 0);
  assert.equal(splitBottomNav([], ["/a"]).bar.length, 0);
});

test("bottom bar: the «Ещё» counter is the sum of the hidden items; active page matching is the sidebar's rule", () => {
  const { moreBadgeTotal, isNavActive } = lib("bottom-nav.ts");
  assert.equal(moreBadgeTotal([{ badge: 3 }, {}, { badge: 4 }]), 7);
  assert.equal(moreBadgeTotal([{ badge: undefined }, { badge: -2 }, { badge: Number.NaN }]), 0);
  assert.equal(moreBadgeTotal([]), 0);
  assert.equal(isNavActive("/owner/students", "/owner/students"), true);
  assert.equal(isNavActive("/owner/students/42", "/owner/students"), true, "a student card keeps «Ученики» lit");
  assert.equal(isNavActive("/owner/students-archive", "/owner/students"), false, "a prefix is not a section");
  assert.equal(isNavActive(null, "/owner/students"), false);
});

test("bottom bar: only on phones, labelled, current page announced, counters through the shared «99+» rule, safe area", () => {
  const nav = read("src/components/layout/bottom-nav.tsx");
  assert.match(nav, /<nav\s+aria-label="Основное меню"/);
  assert.match(nav, /fixed inset-x-0 bottom-0 z-40[^"]*pb-\[env\(safe-area-inset-bottom\)\][^"]*md:hidden/);
  assert.match(nav, /<ul className="flex h-16 /, "64 px high");
  assert.match(nav, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(nav, /text-\[11px\]/, "the labels are 11 px");
  assert.match(nav, /navBadgeText\(count\)/);
  assert.match(nav, /import \{ navBadgeText \} from "@\/lib\/nav-badge"/);
  assert.match(nav, /moreBadgeTotal\(more\)/);
  assert.match(nav, /aria-haspopup="dialog"/);
  assert.match(nav, /Выйти из системы/);
  assert.match(nav, /Настройки<\/span>/); // IA audit F23: «Настройки» everywhere
  assert.match(nav, /role="dialog"\s+aria-modal="true"\s+aria-label="Ещё"/);
  assert.match(nav, /print:hidden/);
  // the sheet is above the dim, both are above the bar and under the toasts (z-120)
  assert.match(nav, /fixed inset-0 z-\[100\]/);
  assert.match(nav, /fixed inset-x-0 bottom-0 z-\[110\]/);
  assert.match(nav, /export const BOTTOM_NAV_CLEARANCE = "max-md:!pb-\[calc\(5rem\+env\(safe-area-inset-bottom\)\)\] print:!pb-0"/);
});

test("sidebar: the rail is hidden under 768 px and both menus come from the same lists", () => {
  assert.match(sidebarSource, /fixed left-0 top-0 hidden h-screen[^"]*md:flex/);
  assert.doesNotMatch(sidebarSource, /compactOnMobile/);
  assert.match(sidebarSource, /<BottomNav\s/);
  assert.match(sidebarSource, /splitBottomNav\(\s*navItems\.filter\(\(item\) => !item\.comingSoon\),/);
  assert.match(sidebarSource, /<nav aria-label="Основное меню"/);
  assert.match(sidebarSource, /shortLabel: "Панель"/);
  assert.match(sidebarSource, /shortLabel: "Группы"/);
});

test("role layouts: no left margin on a phone, room under the bar, tablet and desktop unchanged", () => {
  for (const role of ["owner", "admin", "teacher"]) {
    const layout = read(`src/app/${role}/layout.tsx`);
    assert.match(layout, /<Sidebar \/>/, role);
    assert.doesNotMatch(layout, /ml-\[68px\] \$\{/, `${role}: the 68 px rail margin is gone on phones`);
    // the rail is 68 / 240 px plus the notch of a phone held sideways (env() is 0 everywhere else)
    assert.match(layout, /\$\{collapsed \? "md:ml-\[calc\(68px\+env\(safe-area-inset-left\)\)\]" : "md:ml-\[calc\(240px\+env\(safe-area-inset-left\)\)\]"\}/, role);
    assert.match(layout, /\$\{BOTTOM_NAV_CLEARANCE\}/, role);
  }
});

test("toasts: the column rests on top of the bar while the bar is on the page", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /@media \(max-width: 767px\) \{\s*html\[data-bottom-nav\] #toast-host \{\s*bottom: calc\(4rem \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(read("src/components/layout/bottom-nav.tsx"), /setAttribute\("data-bottom-nav", ""\)[\s\S]*removeAttribute\("data-bottom-nav"\)/);
  assert.match(read("src/components/ui/toast.tsx"), /const HOST_ID = "toast-host"/);
});

// ── the payments notice: removed by PAY-DUE 9.7 (its absence is checked in tests/money2-fix10e-banner.test.cjs); the counts of the summary are the server's students ──

test("payments summary: the student counts reach the store as the server sends them; a missing or bad count stays null", () => {
  const { summaryToState } = lib("payments-summary.ts");
  const full = summaryToState({ debtors: 5, due_students: 2, students_with_advance: 1, students_paused: 3 });
  assert.deepEqual([full.debtors, full.dueStudents, full.studentsWithAdvance, full.studentsPaused], [5, 2, 1, 3]);
  const old = summaryToState({});
  assert.deepEqual([old.debtors, old.dueStudents, old.studentsWithAdvance], [null, null, null]);
  assert.equal(summaryToState({ debtors: "x", due_students: -1 }).debtors, null);
  assert.equal(summaryToState({ debtors: "x", due_students: -1 }).dueStudents, null);
  assert.equal(summaryToState({ debtors: null }).debtors, null);
  assert.equal(summaryToState({ debtors: 0, due_students: 0 }).debtors, 0, "zero is an answer");
});
