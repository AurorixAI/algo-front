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
  // the demo build has no attendance / payments / payroll: the next ones by priority fill the bar
  const demo = splitBottomNav(items(["/owner/dashboard", "/owner/groups", "/owner/students", "/owner/teachers"]), BOTTOM_NAV_PRIORITY.owner);
  assert.deepEqual(hrefsAfterSplit(demo.bar), ["/owner/dashboard", "/owner/groups", "/owner/students", "/owner/teachers"]);
  assert.deepEqual(demo.more, []);
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

test("bottom bar, teacher: all four sections fit, in the order of the menu; «Ещё» has the profile and the quick action", () => {
  const { splitBottomNav, BOTTOM_NAV_PRIORITY } = lib("bottom-nav.ts");
  const { bar, more } = splitBottomNav(items(MENU.teacher), BOTTOM_NAV_PRIORITY.teacher);
  assert.deepEqual(hrefsAfterSplit(bar), MENU.teacher);
  assert.equal(bar.length, 4);
  assert.deepEqual(more, []);
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

// ── the payments notice ───────────────────────────────────────────────────────────────────────────

test("payments notice: all overdue -> «2 ученика с просроченной оплатой», no chip", () => {
  const { bannerCopy } = lib("payments-banner.ts");
  const two = bannerCopy({ due: 3, expired: 3, studentsDue: 2, studentsExpired: 2 });
  // 3 payments of 2 students: the page counts rows, so the notice names both numbers
  assert.equal(two.text, "2 ученика с просроченной оплатой (3\u00A0оплаты)");
  assert.equal(two.chip, null);
  assert.deepEqual([two.subject, two.predicate], ["2 ученика", "с просроченной оплатой (3\u00A0оплаты)"]);
  assert.equal(two.count, 2);
  assert.equal(bannerCopy({ due: 1, expired: 1, studentsDue: 1, studentsExpired: 1 }).text, "1 ученик с просроченной оплатой");
  assert.equal(bannerCopy({ due: 5, expired: 5, studentsDue: 5, studentsExpired: 5 }).text, "5 учеников с просроченной оплатой");
  assert.equal(bannerCopy({ due: 21, expired: 21, studentsDue: 21, studentsExpired: 21 }).text, "21 ученик с просроченной оплатой");
  assert.equal(two.compactSubject + " " + two.compactPredicate, two.text, "the phone shows the same sentence");
});

test("payments notice: some overdue -> «5 учеников ждут оплаты» + the chip «из них просрочено: 2»", () => {
  const { bannerCopy } = lib("payments-banner.ts");
  const mixed = bannerCopy({ due: 7, expired: 3, studentsDue: 5, studentsExpired: 2 });
  assert.equal(mixed.text, "5 учеников ждут оплаты (7\u00A0оплат)");
  assert.equal(mixed.chip, "из них просрочено: 2");
  assert.deepEqual([mixed.subject, mixed.predicate], ["5 учеников", "ждут оплаты (7\u00A0оплат)"]);
  // the phone: one sentence with the noun («5» alone says nothing), the chip folded in
  assert.equal(`${mixed.compactSubject} ${mixed.compactPredicate}`, "5 учеников ждут оплаты (7\u00A0оплат), 2\u00A0просрочено");
  assert.equal(`${mixed.compactSubject} ${mixed.compactPredicate}`.replace(/\u00A0/g, " "), "5 учеников ждут оплаты (7 оплат), 2 просрочено");
  assert.equal(bannerCopy({ due: 22, expired: 1, studentsDue: 21, studentsExpired: 1 }).text, "21 ученик ждёт оплаты (22\u00A0оплаты)");
  const phone = bannerCopy({ due: 22, expired: 1, studentsDue: 21, studentsExpired: 1 });
  assert.equal(`${phone.compactSubject} ${phone.compactPredicate}`.replace(/\u00A0/g, " "), "21 ученик ждёт оплаты (22 оплаты), 1 просрочено");
  assert.equal(bannerCopy({ due: 4, expired: 1, studentsDue: 4, studentsExpired: 1 }).text, "4 ученика ждут оплаты");
});

test("payments notice: rows more than people -> «(9 оплат)», plurals; equal counts or an old server -> no parenthesis", () => {
  const { bannerCopy } = lib("payments-banner.ts");
  const note = (due, students) => bannerCopy({ due, expired: 0, studentsDue: students, studentsExpired: 0 }).text.replace(/\u00A0/g, " ");
  assert.equal(note(9, 7), "7 учеников ждут оплаты (9 оплат)");
  assert.equal(note(2, 1), "1 ученик ждёт оплаты (2 оплаты)");
  assert.equal(note(22, 21), "21 ученик ждёт оплаты (22 оплаты)");
  assert.equal(note(21, 20), "20 учеников ждут оплаты (21 оплата)");
  assert.equal(note(15, 12), "12 учеников ждут оплаты (15 оплат)");
  assert.equal(note(7, 7), "7 учеников ждут оплаты", "the same number: nothing to explain");
  assert.equal(bannerCopy({ due: 9, expired: 0 }).text, "9 учеников ждут оплаты", "an older server counts memberships only");
  // the nbsp keeps «(9 оплат)» whole when the phone wraps the line
  assert.match(bannerCopy({ due: 9, expired: 0, studentsDue: 7, studentsExpired: 0 }).text, /\(9\u00A0оплат\)/);
});

test("payments notice: nobody overdue -> «5 учеников ждут оплаты» with no chip", () => {
  const { bannerCopy } = lib("payments-banner.ts");
  const calm = bannerCopy({ due: 5, expired: 0, studentsDue: 5, studentsExpired: 0 });
  assert.equal(calm.text, "5 учеников ждут оплаты");
  assert.equal(calm.chip, null);
  assert.equal(`${calm.compactSubject} ${calm.compactPredicate}`, "5 учеников ждут оплаты");
  assert.equal(bannerCopy({ due: 1, expired: 0 }).text, "1 ученик ждёт оплаты");
  const counts = { 1: "1 ученик ждёт оплаты", 2: "2 ученика ждут оплаты", 5: "5 учеников ждут оплаты", 11: "11 учеников ждут оплаты", 21: "21 ученик ждёт оплаты", 112: "112 учеников ждут оплаты" };
  for (const [n, text] of Object.entries(counts)) assert.equal(bannerCopy({ due: Number(n), expired: 0 }).text, text, n);
});

test("payments notice: an older server (no student counts) falls back to the memberships, as a pair", () => {
  const { bannerCopy } = lib("payments-banner.ts");
  assert.equal(bannerCopy({ due: 13, expired: 5 }).text, "13 учеников ждут оплаты");
  assert.equal(bannerCopy({ due: 13, expired: 5 }).chip, "из них просрочено: 5");
  assert.equal(bannerCopy({ due: 2, expired: 2, studentsDue: null, studentsExpired: null }).text, "2 ученика с просроченной оплатой");
  // only one of the two arrived: not mixed with the other kind of count
  const half = bannerCopy({ due: 9, expired: 9, studentsDue: 4, studentsExpired: undefined });
  assert.equal(half.count, 9);
  assert.equal(half.text, "9 учеников с просроченной оплатой");
  // never more overdue than waiting; garbage is zero
  assert.equal(bannerCopy({ due: 3, expired: 9 }).text, "3 ученика с просроченной оплатой");
  assert.equal(bannerCopy({ due: 3, expired: 9 }).expired, 3);
  assert.equal(bannerCopy({ due: Number.NaN, expired: -4 }).count, 0);
});

test("payments summary: the student counts reach the store; a missing or bad count stays null", () => {
  const { summaryToState } = lib("payments-summary.ts");
  const full = summaryToState({ due: 7, expired: 3, students_due: 5, students_expired: 2 });
  assert.equal(full.studentsDue, 5);
  assert.equal(full.studentsExpired, 2);
  assert.equal(full.due, 7, "memberships stay what the menu counter and the tabs count");
  const old = summaryToState({ due: 7, expired: 3 });
  assert.equal(old.studentsDue, null);
  assert.equal(old.studentsExpired, null);
  assert.equal(summaryToState({ due: 7, students_due: "x", students_expired: -1 }).studentsDue, null);
  assert.equal(summaryToState({ due: 7, students_due: null }).studentsDue, null);
  assert.equal(summaryToState({ due: 7, students_due: 0, students_expired: 0 }).studentsDue, 0, "zero is an answer");
});

test("payments notice: one compact row on a phone, 14 px wrapping sentence without an ellipsis, desktop row as before", () => {
  const banner = read("src/components/payments/payments-alert-banner.tsx");
  // one row at every width: no stacked flex-col layout any more
  assert.doesNotMatch(banner, /flex-col/);
  assert.match(banner, /mb-3 flex items-center gap-2\.5 rounded-2xl border border-slate-200 bg-white py-2 /);
  // 14 px, wraps, never an ellipsis: the sentence is the whole message (UX-1 polish #6)
  assert.match(banner, /min-w-0 flex-1 text-sm leading-5 text-slate-600 sm:hidden/);
  assert.doesNotMatch(banner, /line-clamp|truncate|text-ellipsis|aria-hidden="true">\s*<span className="font-semibold/);
  assert.match(banner, /<span className="sm:hidden">Открыть<\/span>/);
  assert.match(banner, /<span className="hidden sm:inline">Открыть список<\/span>/);
  assert.match(banner, /aria-label="Открыть список"/);
  assert.match(banner, /aria-label="Скрыть напоминание"/);
  // the desktop sentence and the chip (rose only there)
  assert.match(banner, /hidden min-w-0 flex-wrap items-center gap-x-2\.5 gap-y-1 sm:flex/);
  assert.match(banner, /rounded-full bg-rose-50 px-2 py-0\.5/);
  // the cross compares with the number of PEOPLE that is shown
  assert.match(banner, /bannerDismissed\(dismissedAt, copy\.count\)/);
  assert.match(banner, /writeDismissedAt\(copy\.count\)/);
});
