// N13 UI - floating panels: nothing is clipped by the viewport or an overflow ancestor, nothing needs a mouse hover.
//   1. placement maths (near the right edge, near the bottom, inside a scroll container, 375x667, keyboard, tiny viewport)
//   2. the teacher / group filter: in-panel drill-down logic (no left-full flyout, no hover handlers)
//   3. source checks over the whole app: no hover-only reveal, every menu goes through the placement hook
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
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const { computeFloatingPlacement, pickHorizontalAlign, placementBox } = require(path.join(root, "src/lib/floating-placement.ts"));
const { isAnchorInSight } = require(path.join(root, "src/lib/select-menu.ts"));
const F = require(path.join(root, "src/lib/cascading-filter.ts"));
const R = require(path.join(root, "src/lib/reveal.ts"));

/** A trigger of the given size whose top-left corner sits at (left, top). */
const trigger = (left, top, w = 120, h = 40) => ({ left, top, right: left + w, bottom: top + h });

// ---- 1. placement maths ---------------------------------------------------------------------------

test("a trigger at the right edge opens right-aligned and fully on screen (the payments filter case)", () => {
  const vp = { width: 1280, height: 800 };
  const p = computeFloatingPlacement(trigger(1100, 120, 160), vp, { width: 256, contentHeight: 300 });
  assert.equal(p.align, "end");
  assert.equal(p.left, 1260 - 256, "right edges line up (right-0)");
  assert.ok(p.left >= 8 && p.left + p.width <= vp.width - 8);
  // the same trigger on the left half aligns to its left edge
  const q = computeFloatingPlacement(trigger(24, 120, 160), vp, { width: 256, contentHeight: 300 });
  assert.equal(q.align, "start");
  assert.equal(q.left, 24);
});

test("pickHorizontalAlign: the nearer viewport edge wins, on the visible viewport too", () => {
  const vp = { width: 1000, height: 800 };
  assert.equal(pickHorizontalAlign(trigger(0, 0, 100), vp), "start");
  assert.equal(pickHorizontalAlign(trigger(900, 0, 100), vp), "end");
  assert.equal(pickHorizontalAlign(trigger(450, 0, 100), vp), "start", "exactly centred -> start");
  // pinch-zoomed: the visible part is 400..700, the trigger sits in its right half
  assert.equal(pickHorizontalAlign(trigger(600, 0, 80), { ...vp, visibleLeft: 400, visibleRight: 700 }), "end");
});

test("a trigger near the bottom opens upward, a trigger near the top opens downward", () => {
  const vp = { width: 1280, height: 800 };
  const low = computeFloatingPlacement(trigger(300, 740), vp, { width: 224, contentHeight: 260 });
  assert.equal(low.side, "above");
  assert.equal(low.bottom, 800 - 740 + 8, "bottom edge sits `gap` over the trigger");
  const box = placementBox(low, vp, 260);
  assert.ok(box.top >= 0 && box.bottom <= 740, "the whole panel is over the trigger and on screen");
  const high = computeFloatingPlacement(trigger(300, 20), vp, { width: 224, contentHeight: 260 });
  assert.equal(high.side, "below");
  assert.equal(high.top, 20 + 40 + 8);
  // a short panel that fits below does not flip even low on the page
  const fits = computeFloatingPlacement(trigger(300, 600), vp, { width: 224, contentHeight: 100 });
  assert.equal(fits.side, "below");
  // preferSide "above" (tooltips) is honoured when there is room, and given up when there is none
  assert.equal(computeFloatingPlacement(trigger(300, 400), vp, { width: 224, contentHeight: 80, preferSide: "above" }).side, "above");
  assert.equal(computeFloatingPlacement(trigger(300, 10), vp, { width: 224, contentHeight: 80, preferSide: "above" }).side, "below");
});

test("a «⋯» in the last row of a scroll container: the fixed panel flips over it and is not bound by the container", () => {
  // the container (overflow-x-auto) ends at y = 420, the page viewport at 800; the last row's button is at y = 380
  const container = { top: 100, bottom: 420, left: 0, right: 1000 };
  const button = trigger(940, 380, 32, 32);
  const vp = { width: 1280, height: 800 };
  const menu = computeFloatingPlacement(button, vp, { width: 232, contentHeight: 150, align: "end" });
  assert.equal(menu.side, "below", "the viewport has room, the container's edge is irrelevant to a portaled panel");
  assert.ok(placementBox(menu, vp, 150).bottom > container.bottom, "it extends past the container: an inline absolute menu would be clipped there");
  assert.equal(menu.left, button.right - 232, "end-aligned to the button");
  // the container sits at the very bottom of the viewport: now it flips up and stays on screen
  const low = computeFloatingPlacement(trigger(940, 760, 32, 32), vp, { width: 232, contentHeight: 150, align: "end" });
  assert.equal(low.side, "above");
  assert.ok(placementBox(low, vp, 150).top >= 0);
  // a trigger scrolled out of its container is out of sight: the hook closes the panel instead of letting it float
  const visible = { top: 0, bottom: 800, left: 0, right: 1280 };
  assert.equal(isAnchorInSight(trigger(940, 380, 32, 32), visible, [container], "none"), true);
  assert.equal(isAnchorInSight(trigger(940, 430, 32, 32), visible, [container], "none"), false, "scrolled below the container's edge");
  assert.equal(isAnchorInSight(trigger(1100, 380, 32, 32), visible, [container], "none"), false, "scrolled out sideways");
});

test("375x667 phone: every panel stays inside the screen and under ~60vh, wherever the trigger is", () => {
  const vp = { width: 375, height: 667 };
  for (const width of [160, 224, 256, 320, 600]) {
    for (let top = 0; top <= 667 - 40; top += 37) {
      for (const left of [0, 16, 120, 200, 335]) {
        for (const contentHeight of [80, 300, 1200]) {
          for (const align of ["auto", "start", "end", "center"]) {
            const p = computeFloatingPlacement(trigger(left, top, 40), vp, { width, contentHeight, align });
            const label = `w=${width} top=${top} left=${left} h=${contentHeight} ${align}`;
            assert.ok(p.left >= 8 - 1e-9 && p.left + p.width <= 375 - 8 + 1e-9, `${label}: horizontally inside (${p.left}..${p.left + p.width})`);
            assert.ok(p.width <= 375 - 16 + 1e-9, `${label}: narrower than the screen`);
            assert.ok(p.maxHeight <= 667 * 0.6 + 1e-9, `${label}: capped at ~60vh (${p.maxHeight})`);
            const box = placementBox(p, vp, contentHeight);
            assert.ok(box.top >= 0 - 1e-9 && box.bottom <= 667 + 1e-9, `${label}: vertically inside (${box.top}..${box.bottom})`);
          }
        }
      }
    }
  }
});

test("a long list scrolls inside its own height cap instead of growing past the screen", () => {
  const vp = { width: 1280, height: 800 };
  const p = computeFloatingPlacement(trigger(300, 100), vp, { width: 256, contentHeight: 5000 });
  assert.equal(p.maxHeight, 480, "60% of 800");
  const capped = computeFloatingPlacement(trigger(300, 100), vp, { width: 256, contentHeight: 5000, maxHeight: 240 });
  assert.equal(capped.maxHeight, 240, "an explicit px cap wins when it is smaller");
});

test("landscape phone and on-screen keyboard: the panel is pinned inside the visible area and keeps an inner scroll", () => {
  const cases = [
    { vp: { width: 667, height: 375 } },
    { vp: { width: 375, height: 667, visibleTop: 0, visibleBottom: 300 } },
    { vp: { width: 375, height: 667, visibleTop: 100, visibleBottom: 400, visibleLeft: 20, visibleRight: 330 } },
  ];
  for (const { vp } of cases) {
    const vTop = vp.visibleTop ?? 0;
    const vBottom = vp.visibleBottom ?? vp.height;
    for (let top = vTop; top <= vBottom - 40; top += 20) {
      const p = computeFloatingPlacement(trigger(40, top, 80), vp, { width: 240, contentHeight: 600 });
      const box = placementBox(p, vp, 600);
      const label = `${JSON.stringify(vp)} top=${top}`;
      assert.ok(box.top >= vTop - 1e-9 && box.bottom <= vBottom + 1e-9, `${label}: inside the visible area (${box.top}..${box.bottom})`);
      assert.ok(p.maxHeight > 0, `${label}: not collapsed`);
      assert.ok(p.left >= (vp.visibleLeft ?? 0) + 8 - 1e-9 && p.left + p.width <= (vp.visibleRight ?? vp.width) - 8 + 1e-9, `${label}: horizontally inside`);
    }
  }
});

// ---- 2. the teacher / group filter ----------------------------------------------------------------

const groups = [
  { id: "g1", name: "Алгебра 7А", teacher_id: "t1" },
  { id: "g2", name: "Геометрия 7Б", teacher_id: "t1" },
  { id: "g3", name: "Алгебра 8", teacher_id: "t2" },
];
const ctx = (value) => ({ value, groups });

test("filter panel: opening expands the teacher of the selected group, nothing else", () => {
  const closed = F.CLOSED_FILTER_PANEL;
  assert.deepEqual(F.reduceFilterPanel(closed, { type: "toggle" }, ctx(F.EMPTY_FILTER)).state, { open: true, expandedTeacherId: null });
  assert.deepEqual(
    F.reduceFilterPanel(closed, { type: "toggle" }, ctx({ teacherId: "t2", groupId: "g3" })).state,
    { open: true, expandedTeacherId: "t2" },
  );
  assert.deepEqual(F.reduceFilterPanel({ open: true, expandedTeacherId: "t1" }, { type: "toggle" }, ctx(F.EMPTY_FILTER)).state, closed);
  assert.equal(F.initialExpandedTeacher({ teacherId: "t1", groupId: "" }, groups), null, "a whole-teacher selection expands nothing");
});

test("filter panel: expand is an accordion (one at a time) and never changes the filter", () => {
  let state = { open: true, expandedTeacherId: null };
  let step = F.reduceFilterPanel(state, { type: "expand", teacherId: "t1" }, ctx(F.EMPTY_FILTER));
  assert.deepEqual(step.state, { open: true, expandedTeacherId: "t1" });
  assert.equal(step.value, undefined);
  step = F.reduceFilterPanel(step.state, { type: "expand", teacherId: "t2" }, ctx(F.EMPTY_FILTER));
  assert.equal(step.state.expandedTeacherId, "t2", "t1 collapsed when t2 opened");
  step = F.reduceFilterPanel(step.state, { type: "expand", teacherId: "t2" }, ctx(F.EMPTY_FILTER));
  assert.equal(step.state.expandedTeacherId, null, "the same button collapses it");
  assert.equal(step.state.open, true, "expanding keeps the panel open");
});

test("filter panel: a pick closes the panel and returns the value the pages' onChange expects", () => {
  const open = { open: true, expandedTeacherId: "t1" };
  assert.deepEqual(F.reduceFilterPanel(open, { type: "pick-all" }, ctx({ teacherId: "t1", groupId: "g1" })), { state: F.CLOSED_FILTER_PANEL, value: { teacherId: "", groupId: "" } });
  assert.deepEqual(F.reduceFilterPanel(open, { type: "pick-teacher", teacherId: "t1" }, ctx(F.EMPTY_FILTER)), { state: F.CLOSED_FILTER_PANEL, value: { teacherId: "t1", groupId: "" } });
  assert.deepEqual(F.reduceFilterPanel(open, { type: "pick-group", teacherId: "t1", groupId: "g2" }, ctx(F.EMPTY_FILTER)), { state: F.CLOSED_FILTER_PANEL, value: { teacherId: "t1", groupId: "g2" } });
  assert.deepEqual(F.reduceFilterPanel(open, { type: "close" }, ctx(F.EMPTY_FILTER)), { state: F.CLOSED_FILTER_PANEL });
});

test("filter helpers: groups of a teacher, trigger label, selected / on-path flags", () => {
  assert.deepEqual(F.groupsOfTeacher(groups, "t1").map((g) => g.id), ["g1", "g2"]);
  assert.deepEqual(F.groupsOfTeacher(groups, "nobody"), []);
  const name = (id) => ({ t1: "Дилноза Каримова" }[id] ?? null);
  assert.equal(F.filterLabel(F.EMPTY_FILTER, groups, name), "Все ученики");
  assert.equal(F.filterLabel({ teacherId: "t1", groupId: "" }, groups, name), "Дилноза Каримова");
  assert.equal(F.filterLabel({ teacherId: "t1", groupId: "g2" }, groups, name), "Геометрия 7Б");
  assert.equal(F.filterLabel({ teacherId: "gone", groupId: "" }, groups, name), "Фильтр");
  assert.equal(F.filterLabel({ teacherId: "t1", groupId: "gone" }, groups, name), "Фильтр");
  assert.equal(F.isTeacherSelected({ teacherId: "t1", groupId: "" }, "t1"), true);
  assert.equal(F.isTeacherSelected({ teacherId: "t1", groupId: "g1" }, "t1"), false, "a group is selected, the check is on the group");
  assert.equal(F.isTeacherOnPath({ teacherId: "t1", groupId: "g1" }, "t1"), true);
  assert.equal(F.isTeacherOnPath({ teacherId: "t2", groupId: "g1" }, "t1"), false);
});

test("CascadingFilter source: an in-panel drill-down - no hover flyout, no hover handlers, real buttons", () => {
  const src = read("src/components/ui/cascading-filter.tsx");
  assert.doesNotMatch(src, /left-full/, "no flyout hanging off the panel's edge");
  assert.doesNotMatch(src, /\bright-full\b/);
  assert.doesNotMatch(src, /onMouseEnter|onMouseLeave|onMouseOver|onPointerEnter|hoveredTeacher|setTimeout|group-hover/, "nothing depends on hover");
  assert.match(src, /aria-expanded=\{expanded\}/, "the expand button is a disclosure");
  assert.match(src, /aria-controls=\{groupsId\}/);
  assert.match(src, /pick-teacher/);
  assert.match(src, /pick-group/);
  assert.match(src, /<Check /, "the selected state is a check mark");
  assert.match(src, /truncate/);
  assert.match(src, /title=\{group\.name\}/, "a long group name is readable via title");
  assert.match(src, /title=\{staffDisplayName\(teacher\)\}/);
  assert.match(src, /"Escape"/);
  assert.match(src, /triggerRef\.current\?\.focus/, "Escape returns focus to the trigger");
  assert.match(src, /addEventListener\("pointerdown"/, "an outside press (mouse and touch) closes");
  assert.match(src, /ArrowDown/);
  assert.match(src, /useFloatingPlacement\(pillRef, panelRef/, "placed from the whole pill (label + reset)");
  assert.match(src, /style=\{anchoredStyle\}/, "aligned to the nearer edge, flipped and height-capped by the hook");
  assert.match(src, /\{staffDisplayName\(teacher\)\}/);
  // the API of the three pages did not change
  assert.match(src, /value: \{ teacherId: string; groupId: string \};\s*onChange: \(value: \{ teacherId: string; groupId: string \}\) => void;/);
  for (const page of ["components/payments/payments-page.tsx", "components/students/students-list-view.tsx", "components/attendance/excuses-page.tsx"]) {
    const body = read(`src/${page}`);
    const use = body.slice(body.indexOf("<CascadingFilter"), body.indexOf("/>", body.indexOf("<CascadingFilter")) + 2);
    assert.match(use, /teachers=\{[^}]+\}\s*groups=\{[^}]+\}\s*value=\{[\s\S]+?\}\s*onChange=/, `${page} still uses teachers / groups / value / onChange`);
  }
});

test("CascadingFilter renders closed on the server: trigger with its label, no panel markup", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { CascadingFilter } = require(path.join(root, "src/components/ui/cascading-filter.tsx"));
  const html = renderToStaticMarkup(
    React.createElement(CascadingFilter, {
      teachers: [{ id: "t1", first_name: "Дилноза", last_name: "Каримова" }],
      groups,
      value: { teacherId: "t1", groupId: "g1" },
      onChange() {},
    }),
  );
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /Алгебра 7А/, "the trigger shows the selected group");
  assert.doesNotMatch(html, /Преподаватели/, "the panel is not rendered while closed");
  assert.match(html, /aria-label="Сбросить фильтр"/);
});

// ---- 3. source checks over the whole app ----------------------------------------------------------

const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx$/.test(e.name) ? [`${dir}/${e.name}`] : []);
const allTsx = walk("src");

test("no component reveals content on mouse hover only: hover handlers have a focus / tap twin, hover-reveals have a focus twin", () => {
  const hoverHandlers = allTsx.filter((f) => /onMouseEnter|onMouseOver|onPointerEnter/.test(read(f)));
  // feature-lock: hover + focus + tap-to-pin;  hint: hover + focus + click / Enter pin
  // income-parts: the donut «Чем платили» — the hover only HIGHLIGHTS a segment and its legend line (nothing is revealed by hover alone): focus does the same, a tap / Enter chooses it
  assert.deepEqual(hoverHandlers.sort(), ["src/components/payments/income-parts.tsx", "src/components/ui/feature-lock.tsx", "src/components/ui/hint.tsx"]);
  const donut = read("src/components/payments/income-parts.tsx");
  assert.match(donut, /onFocus: \(\) => setHover\(method\)/, "the donut: focus highlights too");
  assert.match(donut, /onClick=\{\(\) => pick\(segment\.method\)\}/, "the donut: a tap chooses");
  assert.match(donut, /event\.key === "Enter" \|\| event\.key === " "/, "the donut: the keyboard chooses");
  for (const f of hoverHandlers.filter((name) => name !== "src/components/payments/income-parts.tsx")) {
    const src = read(f);
    assert.match(src, /onFocus[=:]/, `${f}: focus shows it too`);
    assert.match(src, /onClick[=:]/, `${f}: a tap shows it too`);
    assert.match(src, /reduceReveal/, `${f}: touch rules come from the tested state machine`);
    assert.match(src, /"Escape"/, `${f}: Escape dismisses it`);
  }
  // an element that is `opacity-0` until the group is hovered must also appear on keyboard focus
  for (const f of allTsx) {
    read(f).split("\n").forEach((line, i) => {
      if (/\bopacity-0\b/.test(line) && /group-hover:opacity-100/.test(line)) {
        assert.match(line, /focus-visible:opacity-100|group-focus-visible:opacity-100|group-focus-within:opacity-100/, `${f}:${i + 1} hover-only reveal without a focus twin`);
      }
    });
  }
  // and the action buttons that were invisible on a tablet (no hover) are shown there
  assert.match(read("src/app/owner/teachers/page.tsx"), /sm:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 \[@media\(hover:none\)\]:!opacity-100/);
  assert.match(read("src/app/teacher/exams/[id]/page.tsx"), /opacity-0 group-hover:opacity-100 focus-visible:opacity-100 \[@media\(hover:none\)\]:!opacity-100/);
});

test("no hand-placed absolute dropdown remains: menus go through FloatingPanel / the placement hook", () => {
  // `absolute ... top-full | bottom-full | left-full | right-full` = a panel glued to its trigger's box
  const hand = allTsx.filter((f) => /absolute[\s\S]{0,260}?\b(top-full|bottom-full|left-full|right-full)\b/.test(read(f))).sort();
  // sidebar: the profile menu hangs off a `fixed` full-height rail (documented, click + Escape); feature-lock: the tooltip's arrow
  assert.deepEqual(hand, ["src/components/layout/sidebar.tsx", "src/components/ui/feature-lock.tsx"].sort());
  assert.doesNotMatch(read("src/components/layout/sidebar.tsx"), /left-full|right-full/);
  // the full-screen click-catcher behind a menu (fixed inset-0 z-30..40 + onClick close) is gone: FloatingPanel closes on a press outside
  for (const f of allTsx) {
    assert.doesNotMatch(read(f), /className="fixed inset-0 z-(30|40)[^"]*"\s*onClick=\{[^}]*(setMenuOpen|setHeaderMenuOpen|setShowLangMenu)/, `${f}: click-catcher backdrop`);
  }
  const converted = {
    "src/app/teacher/exams/page.tsx": "menuTriggerRef",
    "src/app/teacher/exams/[id]/page.tsx": "headerMenuTriggerRef",
    "src/app/teacher/exams/[id]/draft/page.tsx": "headerMenuTriggerRef",
    "src/app/teacher/schedule/page.tsx": "groupFilterTriggerRef",
    "src/components/layout/header.tsx": "langTriggerRef",
  };
  for (const [file, ref] of Object.entries(converted)) {
    const src = read(file);
    assert.match(src, /import \{ FloatingPanel \} from "@\/components\/ui\/floating-panel"/, `${file} imports FloatingPanel`);
    assert.match(src, new RegExp(`<FloatingPanel[\\s\\S]{0,200}triggerRef=\\{${ref}\\}`), `${file}: FloatingPanel on ${ref}`);
    assert.match(src, new RegExp(`ref=\\{${ref}\\}`), `${file}: the trigger carries the ref`);
  }
  // the lesson dialog's «⋯» and the exam table's popover were already fixed-positioned, but opened downward only
  const schedule = read("src/app/teacher/schedule/page.tsx");
  assert.match(read("src/components/substitutions/teacher-lesson-controls.tsx"), /triggerRef=\{buttonRef\}/);       // 26.10: the «⋯» of both lesson panels is ONE component
  assert.doesNotMatch(schedule, /recurringActionsPosition/);
  const exam = read("src/app/teacher/exams/[id]/page.tsx");
  assert.match(exam, /triggerRef=\{activeStudentMenuBtnRef\}/);
  assert.doesNotMatch(exam, /menuAnchor|setMenuAnchor/);
});

test("FloatingPanel: portaled and fixed, keyboard- and touch-reachable, closes on outside press / Escape / trigger out of sight", () => {
  const src = read("src/components/ui/floating-panel.tsx");
  assert.match(src, /createPortal\(/);
  assert.match(src, /style=\{fixedStyle\}/);
  assert.match(src, /"pointerdown"/, "mouse and touch");
  assert.match(src, /"Escape"/);
  assert.match(src, /triggerRef\.current\?\.focus/, "focus returns to the trigger");
  assert.match(src, /ArrowDown/);
  assert.match(src, /ArrowUp/);
  assert.match(src, /event\.key === "Tab"/);
  assert.match(src, /onAnchorHidden/, "closes when the trigger scrolls away");
  assert.match(src, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/, "a click in the menu does not reach a surrounding <Link>");
  assert.doesNotMatch(src, /AnimatePresence|framer-motion|opacity:/, "no stalled opacity animation (same rule as <Select>)");
  assert.doesNotMatch(src, /onMouseEnter|onMouseLeave/);
});

test("useFloatingPlacement: measured from getBoundingClientRect, re-placed on resize / scroll / visual viewport, closes when the trigger is gone", () => {
  const src = read("src/lib/use-floating-placement.ts");
  assert.match(src, /getBoundingClientRect\(\)/);
  assert.match(src, /addEventListener\("resize"/);
  assert.match(src, /addEventListener\("scroll", onScroll, true\)/, "any scroll container, captured");
  assert.match(src, /window\.visualViewport/);
  assert.match(src, /isAnchorInSight/);
  assert.match(src, /isConnected/);
  assert.match(src, /scrollHeight/, "the panel's own height decides whether it flips");
  assert.match(src, /position: "fixed"/);
  assert.match(src, /position: "absolute"/);
});

test("Hint replaces hover-only title tooltips of the badges whose detail was only in the title", () => {
  const journal = read("src/components/groups/group-attendance-journal.tsx");
  assert.doesNotMatch(journal, /title=\{formatMembershipEvent/);
  assert.doesNotMatch(journal, /title=\{transferDescription\} className="mt-1 inline-flex rounded-md/);
  assert.match(journal, /<Hint text=\{formatMembershipEvent\(membershipEvent\)\}/);
  assert.match(journal, /<Hint\s+text=\{\[\s*`Исправлено:/);
  assert.match(journal, /\{excuse && \(\s*<div className="mb-1 rounded-xl bg-slate-50 px-3 py-2">\s*<p className="whitespace-pre-line[^"]*">\{excuseTooltip\(excuse, \{ withLate: false \}\)\}<\/p>/, "the absence reason is also in the opened cell menu");
  // income2 §1: a schedule card is information only - its chip is plain text with the detail in the title, not a focusable Hint
  assert.match(read("src/components/groups/group-schedule-overview.tsx"), /title=\{state\.description\}/);

  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { Hint } = require(path.join(root, "src/components/ui/hint.tsx"));
  const html = renderToStaticMarkup(React.createElement(Hint, { text: "Переведён из «Группа 7А»", className: "x" }, "Переведён"));
  assert.match(html, /tabindex="0"/, "focusable");
  assert.match(html, /role="button"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-describedby="/);
  assert.match(html, /class="sr-only"[^>]*>Переведён из «Группа 7А»</, "the detail is in the DOM for screen readers");
  assert.doesNotMatch(html, /title=/, "no hover-only native tooltip");
  assert.doesNotMatch(html, /role="tooltip"/, "the bubble exists only while shown");
});

test("keyboard / touch twins of the other reveals: sidebar profile menu closes on Escape, the inline figure opens by keyboard", () => {
  const side = read("src/components/layout/sidebar.tsx");
  assert.match(side, /handleEscape/);
  assert.match(side, /addEventListener\("pointerdown", handleClickOutside\)/);
  assert.match(side, /aria-expanded=\{profileOpen\}/);
  const fig = read("src/components/tasks/TaskFigureDrawer.tsx");
  assert.match(fig, /role="button"\s+tabIndex=\{0\}/);
  assert.match(fig, /group-focus-visible:opacity-100/);
  const lock = read("src/components/ui/feature-lock.tsx");
  assert.match(lock, /\{ type: "click", mousePins: false \}/, "a feature lock reacts to a tap, a mouse click does not pin it");
  assert.match(lock, /\{ type: "blur" \}/);
});

// ---- 4. R3 follow-ups ------------------------------------------------------------------------------

const fresh = () => ({ ...R.INITIAL_REVEAL });
const run = (events, state = fresh()) => events.reduce((acc, ev) => R.reduceReveal(acc, ev), state);
const TAP = [{ type: "pointer-enter", pointerType: "touch" }, { type: "pointer-down", pointerType: "touch" }];

test("reveal state machine - mouse: hover shows it, leaving hides it, a click pins it, a second click unpins", () => {
  let st = run([{ type: "pointer-enter", pointerType: "mouse" }, { type: "mouse-enter" }]);
  assert.equal(R.isRevealed(st), true);
  st = R.reduceReveal(st, { type: "mouse-leave" });
  assert.equal(R.isRevealed(st), false);
  st = run([{ type: "pointer-enter", pointerType: "mouse" }, { type: "mouse-enter" }, { type: "pointer-down", pointerType: "mouse" }, { type: "focus" }, { type: "click", mousePins: true }]);
  assert.equal(st.pinned, true);
  st = R.reduceReveal(R.reduceReveal(st, { type: "mouse-leave" }), { type: "blur" });
  assert.equal(R.isRevealed(st), false, "blur clears the pin");
  // a click on a feature lock (mousePins false) does not pin it with the mouse
  st = run([{ type: "pointer-down", pointerType: "mouse" }, { type: "click", mousePins: false }]);
  assert.equal(st.pinned, false);
});

test("reveal state machine - touch: the emulated hover and the press's focus are ignored, tap opens, next tap closes", () => {
  // phone tap: pointerdown(touch) -> emulated mouseenter -> focus caused by the press -> click
  let st = run([...TAP, { type: "mouse-enter" }, { type: "focus" }]);
  assert.equal(st.hovered, false, "emulated hover ignored");
  assert.equal(st.focused, false, "focus caused by the press ignored");
  assert.equal(R.isRevealed(st), false, "nothing shown before the click decides");
  st = R.reduceReveal(st, { type: "click", mousePins: true });
  assert.equal(st.pinned, true, "first tap opens");
  assert.equal(st.pressing, false);
  // second tap: the element keeps its DOM focus but no focus event comes; hover is ignored again
  st = run([...TAP, { type: "mouse-enter" }, { type: "click", mousePins: true }], st);
  assert.equal(R.isRevealed(st), false, "second tap closes");
  // and a third tap opens again
  st = run([...TAP, { type: "click", mousePins: true }], st);
  assert.equal(st.pinned, true);
  // a press elsewhere / Escape dismisses, blur clears the pin
  assert.equal(R.isRevealed(R.reduceReveal(st, { type: "dismiss" })), false);
  assert.equal(R.isRevealed(R.reduceReveal(st, { type: "blur" })), false);
});

test("reveal state machine - keyboard after a touch session: Tab focus shows it, Enter pins, blur clears, a cancelled press frees focus", () => {
  let st = run([...TAP, { type: "click", mousePins: true }, { type: "dismiss" }]);
  st = R.reduceReveal(st, { type: "focus" });
  assert.equal(st.focused, true, "not pressing: this is keyboard focus, even though the last pointer was a finger");
  st = R.reduceReveal(st, { type: "key-toggle" });
  assert.equal(st.pinned, true);
  st = R.reduceReveal(st, { type: "blur" });
  assert.equal(R.isRevealed(st), false);
  // a touch press that was cancelled (scroll) must not swallow the next real focus
  st = run([...TAP, { type: "pointer-cancel" }, { type: "focus" }], fresh());
  assert.equal(st.focused, true);
  // a pen behaves like a finger
  st = run([{ type: "pointer-down", pointerType: "pen" }, { type: "mouse-enter" }, { type: "focus" }, { type: "click", mousePins: true }]);
  assert.equal(st.pinned, true);
  assert.equal(st.hovered, false);
});

test("Hint is a labelled button: role=button + aria-expanded; FeatureLock/Hint share the tested touch rules", () => {
  const hint = read("src/components/ui/hint.tsx");
  assert.match(hint, /role="button"/);
  assert.match(hint, /aria-expanded=\{open\}/);
  assert.match(hint, /dispatch\(\{ type: "pointer-down", pointerType: event\.pointerType \}\)/);
  assert.match(hint, /dispatch\(\{ type: "blur" \}\)/);
  assert.match(hint, /dispatch\(\{ type: "click", mousePins: true \}\)/);
  const lock = read("src/components/ui/feature-lock.tsx");
  assert.match(lock, /dispatch\(\{ type: "pointer-down", pointerType: event\.pointerType \}\)/);
  assert.doesNotMatch(lock, /setIsHovered|setIsFocused|setIsPinned/, "no ad-hoc hover / focus / pin state any more");
});

test("filter keyboard + a11y: ArrowDown on the trigger, focus returns after a pick, the reset is a real button, selected rows are marked", () => {
  const src = read("src/components/ui/cascading-filter.tsx");
  // focus returns to the trigger after a pick (and after the reset button)
  assert.match(src, /if \(result\.value\) \{\s*onChange\(result\.value\);\s*\/\/[^\n]*\n\s*triggerRef\.current\?\.focus\(\{ preventScroll: true \}\);/);
  assert.match(src, /onChange\(\{ teacherId: "", groupId: "" \}\);\s*triggerRef\.current\?\.focus/);
  // ArrowDown: opens and focuses the first row once the panel is placed; when already open, focuses it at once
  assert.match(src, /onKeyDown=\{handleTriggerKeyDown\}/);
  assert.match(src, /event\.key !== "ArrowDown"/);
  assert.match(src, /focusFirstRowRef\.current = true;\s*dispatch\(\{ type: "toggle" \}\)/);
  assert.match(src, /if \(!placed \|\| !focusFirstRowRef\.current\) return;/, "waits until the panel is visible (a hidden element cannot take focus)");
  // the reset is a <button>, not a div role=button, and it is not nested in the opening button
  assert.doesNotMatch(src, /<div[^>]*role="button"/);
  assert.match(src, /<button\s+type="button"\s+aria-label="Сбросить фильтр"/);
  // selected rows
  assert.equal((src.match(/aria-current=\{[^}]+\? "true" : undefined\}/g) || []).length, 3, "all / teacher / group rows");

  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { CascadingFilter } = require(path.join(root, "src/components/ui/cascading-filter.tsx"));
  const html = renderToStaticMarkup(
    React.createElement(CascadingFilter, { teachers: [{ id: "t1", first_name: "Дилноза", last_name: "Каримова" }], groups, value: { teacherId: "t1", groupId: "" }, onChange() {} }),
  );
  assert.match(html, /<\/button><button[^>]*aria-label="Сбросить фильтр"/, "two sibling buttons: open + reset");
  assert.doesNotMatch(html, /<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/, "no <button> inside a <button>");
});

test("journal: a locked excused cell opens a READ-ONLY menu with the reason; no marking action is reachable there", () => {
  const src = read("src/components/groups/group-attendance-journal.tsx");
  assert.match(src, /disabled=\{locked && !reviewable && !excuse\}/);
  assert.match(src, /const menuAvailable = isOpen && \(!locked \|\| reviewable \|\| Boolean\(excuse\)\);/);
  assert.match(src, /const readOnlyExcuse = locked && !reviewable && Boolean\(excuse\);/);
  assert.match(src, /role=\{readOnlyExcuse \? "group" : "menu"\}/, "no empty role=menu");
  assert.match(src, /<p className="whitespace-pre-line break-words /, "a long reason wraps");
  // the cell menu: everything that marks, resets or reviews sits behind a guard that a locked, non-reviewable cell fails
  const start = src.indexOf("id={`attendance-menu-${student.id}-${key}`}");
  const menu = src.slice(start, src.indexOf("</FloatingMenu>", start));
  assert.match(menu, /\{excuse && \(\s*<div className="mb-1 rounded-xl bg-slate-50 px-3 py-2">\s*<p/, "the reason is the only unguarded part");
  // confirm and reject now open the confirmation dialog (askReview), the request itself is sent from the dialog
  const marking = [...menu.matchAll(/handleSelectStatus\(|handleReview\(|askReview\(/g)];
  assert.equal(marking.length, 5, "status options, reset, confirm, reject, reset-decision");
  // each marking call lives in a block opened by one of the guards, and the block opens before the call
  const guards = [
    { open: "{!locked && STATUS_OPTIONS.map(", calls: 1 },
    { open: "{!locked && value && !inCorrection && (", calls: 1 },
    { open: "{reviewable && excuse && (", calls: 3 },
  ];
  const guardAt = guards.map((g) => {
    const at = menu.indexOf(g.open);
    assert.ok(at >= 0, `guard present: ${g.open}`);
    return { ...g, at };
  });
  assert.ok(Math.min(...marking.map((m) => m.index)) > Math.min(...guardAt.map((g) => g.at)), "no marking call before the first guard");
  const perGuard = new Map();
  for (const m of marking) {
    const owner = guardAt.filter((g) => g.at < m.index).sort((x, y) => y.at - x.at)[0];
    assert.ok(owner, "every marking call sits inside a guarded block");
    perGuard.set(owner.open, (perGuard.get(owner.open) || 0) + 1);
  }
  for (const g of guards) assert.equal(perGuard.get(g.open), g.calls, `calls owned by ${g.open}`);
  assert.ok(menu.indexOf("{!locked && STATUS_OPTIONS.map(") < menu.indexOf("handleSelectStatus(item.value"));
  assert.ok(menu.indexOf("{reviewable && excuse && (") < menu.indexOf('askReview(excuse, key, student, lesson, "confirmed")'));
  // `reviewable` itself needs admin mode and no correction in progress, and `locked` still covers completed / cancelled / future / view-only
  assert.match(src, /const reviewable = adminMode && !inCorrection && Boolean\(excuse\);/);
  assert.match(src, /const locked = !wasInLesson \|\| !canEdit \|\| lessonIsOthers\(key\) \|\| columnBusyKey === key \|\| isFutureLesson \|\| lessonStatus === "scheduled" \|\| \(lessonStatus === "completed" && !inCorrection\) \|\| lessonStatus === "cancelled";/);
  // the click handler of the cell only toggles the menu: it marks nothing
  assert.match(src, /onClick=\{\(event\) => toggleAttendanceMenu\(event, student\.id, key, isOpen\)\}/);
});

test("menus: panels are role=group, so no aria-haspopup=true; triggers point to them with aria-controls", () => {
  const files = [
    "src/app/teacher/exams/page.tsx", "src/app/teacher/exams/[id]/page.tsx", "src/app/teacher/exams/[id]/draft/page.tsx",
    "src/app/teacher/schedule/page.tsx", "src/components/layout/header.tsx", "src/components/layout/sidebar.tsx",
  ];
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /aria-haspopup="true"/, `${f}: a generic group is not a popup menu`);
    assert.match(src, /aria-controls=\{/, `${f}: trigger points to its panel`);
  }
  for (const f of allTsx) assert.doesNotMatch(read(f), /aria-haspopup="true"/, f);
  // id <-> aria-controls pairs
  const pairs = [
    ["src/app/teacher/exams/[id]/page.tsx", "exam-actions-menu"], ["src/app/teacher/exams/[id]/page.tsx", "exam-student-popover"],
    ["src/app/teacher/exams/[id]/draft/page.tsx", "draft-actions-menu"], ["src/app/teacher/schedule/page.tsx", "schedule-group-filter-menu"],
    ["src/components/substitutions/teacher-lesson-controls.tsx", "lesson-actions-menu"], ["src/components/layout/header.tsx", "language-menu"],
    ["src/components/layout/sidebar.tsx", "sidebar-profile-menu"],
  ];
  for (const [f, id] of pairs) {
    const src = read(f);
    assert.match(src, new RegExp(`id="${id}"`), `${f}: panel id ${id}`);
    assert.match(src, new RegExp(`aria-controls=\\{[^}]*"${id}"`), `${f}: aria-controls ${id}`);
  }
  const list = read("src/app/teacher/exams/page.tsx");
  assert.match(list, /const menuId = useId\(\);/, "one menu per exam card: unique ids");
  assert.match(list, /aria-controls=\{menuOpen \? menuId : undefined\}/);
  assert.match(list, /id=\{menuId\}/);
  // the lesson dialog menu really has menu / menuitem roles, so aria-haspopup="menu" stays
  assert.match(read("src/components/substitutions/teacher-lesson-controls.tsx"), /aria-haspopup="menu"/);
});
