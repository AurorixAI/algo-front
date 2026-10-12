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
const { computeMenuPlacement, moveActiveIndex, resolveSelectKey, isAnchorInSight } = require(path.join(__dirname, "../src/lib/select-menu.ts"));

// A field of the given width whose top sits at `top` (height 48).
const anchor = (top, left, width) => ({ top, bottom: top + 48, left, width });

test("the open list stays inside the viewport at 360 / 768 / 1280 wide, wherever the field sits", () => {
  const viewports = [{ width: 360, height: 640 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }];
  for (const vp of viewports) {
    for (let top = 0; top <= vp.height - 48; top += 40) {
      for (const [left, width] of [[8, vp.width - 16], [vp.width - 200, 260], [-20, 300]]) {
        const p = computeMenuPlacement(anchor(top, left, width), vp, { maxHeight: 240, contentHeight: 7 * 48 + 12 });
        const label = `${vp.width}x${vp.height} top=${top} left=${left}`;
        assert.ok(p.left >= 8 && p.left + p.width <= vp.width - 8, `${label}: horizontally inside`);
        const boxTop = p.side === "below" ? p.top : vp.height - p.bottom - p.maxHeight;
        const boxBottom = boxTop + p.maxHeight;
        assert.ok(p.maxHeight <= 240, `${label}: capped at 240`);
        assert.ok(boxTop >= 0 && boxBottom <= vp.height, `${label}: vertically inside (${boxTop}..${boxBottom})`);
      }
    }
  }
});

// Box of a placement in viewport coordinates.
const boxOf = (p, vp) => {
  const top = p.side === "below" ? p.top : vp.height - p.bottom - p.maxHeight;
  return { top, bottom: top + p.maxHeight };
};

test("short viewports (landscape phone, on-screen keyboard): the list never leaves the visible area and keeps an inner scroll", () => {
  const cases = [
    { vp: { width: 640, height: 360 } },
    { vp: { width: 360, height: 200 } },
    { vp: { width: 360, height: 160 } },
    // 360x640 layout viewport with a keyboard covering everything below y = 340
    { vp: { width: 360, height: 640, visibleTop: 0, visibleBottom: 340 } },
    // pinch-zoomed / scrolled visual viewport inside the layout viewport
    { vp: { width: 360, height: 640, visibleTop: 100, visibleBottom: 400, visibleLeft: 40, visibleRight: 300 } },
  ];
  for (const { vp } of cases) {
    const vTop = vp.visibleTop ?? 0;
    const vBottom = vp.visibleBottom ?? vp.height;
    const vLeft = vp.visibleLeft ?? 0;
    const vRight = vp.visibleRight ?? vp.width;
    for (let top = vTop; top <= vBottom - 48; top += 16) {
      const p = computeMenuPlacement(anchor(top, vLeft + 4, 320), vp, { maxHeight: 240, contentHeight: 348 });
      const label = JSON.stringify(vp) + " top=" + top;
      const b = boxOf(p, vp);
      assert.ok(b.top >= vTop && b.bottom <= vBottom, `${label}: vertically inside the visible area (${b.top}..${b.bottom})`);
      assert.ok(p.maxHeight >= 0 && p.maxHeight <= 240, `${label}: cap`);
      assert.ok(p.left >= vLeft && p.left + p.width <= vRight, `${label}: horizontally inside the visible area`);
      assert.ok(p.maxHeight >= 64 || vBottom - vTop < 144, `${label}: at least 64px unless the visible area itself is smaller`);
    }
  }
});

test("when neither side has room the list is pinned inside the visible area, shorter than the minimum, and may cover the field", () => {
  const p = computeMenuPlacement(anchor(60, 16, 328), { width: 360, height: 160 }, { contentHeight: 348 });
  assert.equal(p.side, "below");
  assert.equal(p.top, 8);
  assert.equal(p.maxHeight, 144);
});

test("opens below with room, flips above near the bottom edge, and caps the height to the room left", () => {
  const vp = { width: 400, height: 800 };
  const below = computeMenuPlacement(anchor(300, 16, 368), vp, { contentHeight: 500 });
  assert.equal(below.side, "below");
  assert.equal(below.top, 348 + 6);
  assert.equal(below.maxHeight, 240);

  // 7 grades (~350px) next to the bottom of a 640px phone: below has 100px, above has 500px -> flip.
  const phone = { width: 360, height: 640 };
  const above = computeMenuPlacement(anchor(540, 16, 328), phone, { contentHeight: 348 });
  assert.equal(above.side, "above");
  assert.equal(above.bottom, 640 - 540 + 6);
  assert.equal(above.maxHeight, 240);

  // Little room on both sides: the larger one wins, the list scrolls inside a smaller cap.
  const tiny = computeMenuPlacement(anchor(120, 16, 328), { width: 360, height: 300 }, { contentHeight: 348 });
  assert.equal(tiny.side, "below");
  assert.ok(tiny.maxHeight < 240 && tiny.maxHeight >= 64);
});

test("a short list does not flip just because the long default would not fit", () => {
  const p = computeMenuPlacement(anchor(560, 16, 328), { width: 360, height: 740 }, { contentHeight: 2 * 48 + 12 });
  assert.equal(p.side, "below");
});

test("arrow keys move the highlight, clamp at both ends; Home / End jump", () => {
  assert.equal(moveActiveIndex(7, -1, "ArrowDown"), 0);
  assert.equal(moveActiveIndex(7, -1, "ArrowUp"), 6);
  assert.equal(moveActiveIndex(7, 3, "ArrowDown"), 4);
  assert.equal(moveActiveIndex(7, 3, "ArrowUp"), 2);
  assert.equal(moveActiveIndex(7, 6, "ArrowDown"), 6);
  assert.equal(moveActiveIndex(7, 0, "ArrowUp"), 0);
  assert.equal(moveActiveIndex(7, 3, "Home"), 0);
  assert.equal(moveActiveIndex(7, 3, "End"), 6);
  assert.equal(moveActiveIndex(0, -1, "ArrowDown"), -1);
});

test("field in sight: a hit on the field or on the list pinned over it keeps the menu; an overlay or scrolling away closes it", () => {
  const vp = { top: 0, bottom: 640, left: 0, right: 360 };
  const field = { top: 300, bottom: 346, left: 16, right: 344 };
  assert.equal(isAnchorInSight(field, vp, [], "anchor"), true);
  assert.equal(isAnchorInSight(field, vp, [], "other"), false, "sticky header / overlay on top of the field");
  // The pinned list (very short viewport) covers the field: the next resize / keyboard event must not close it.
  assert.equal(isAnchorInSight(field, vp, [], "list"), true);
  // ...but a list hit does not keep it open once the field has scrolled off-screen or out of its scroller.
  assert.equal(isAnchorInSight({ top: -80, bottom: -34, left: 16, right: 344 }, vp, [], "list"), false);
  assert.equal(isAnchorInSight(field, vp, [{ top: 0, bottom: 200, left: 0, right: 360 }], "list"), false);
  // No usable hit test (null / pointer-events: none): geometry decides.
  assert.equal(isAnchorInSight(field, vp, [], "none"), true);
  assert.equal(isAnchorInSight(field, vp, [{ top: 100, bottom: 500, left: 0, right: 360 }], "none"), true);
  assert.equal(isAnchorInSight(field, vp, [{ top: 400, bottom: 900, left: 0, right: 360 }], "none"), false, "scrolled out of its clip parent");
  assert.equal(isAnchorInSight({ top: 700, bottom: 746, left: 16, right: 344 }, vp, [], "none"), false, "below the viewport");
  // On-screen keyboard: the visible area ends at y = 340, the field's centre (323) is still inside.
  assert.equal(isAnchorInSight(field, { ...vp, bottom: 340 }, [], "none"), true);
  assert.equal(isAnchorInSight({ top: 330, bottom: 376, left: 16, right: 344 }, { ...vp, bottom: 340 }, [], "none"), false);
});

test("every key the Select handles stops bubbling (login form must not submit on Enter while choosing a role)", () => {
  for (const open of [false, true]) {
    for (const key of ["Enter", " "]) {
      const r = resolveSelectKey(open, key);
      assert.equal(r.stop, true, `open=${open} key="${key}" is ours`);
    }
  }
  for (const key of ["ArrowDown", "ArrowUp"]) {
    assert.deepEqual(resolveSelectKey(false, key), { action: "open", stop: true, prevent: true });
  }
  for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
    assert.deepEqual(resolveSelectKey(true, key), { action: "move", stop: true, prevent: true });
  }
  assert.deepEqual(resolveSelectKey(true, "Enter"), { action: "choose", stop: true, prevent: true });
  assert.deepEqual(resolveSelectKey(true, " "), { action: "choose", stop: true, prevent: true });
  // Closed Enter/Space: the button's own click opens it (no preventDefault), but the key is still ours.
  assert.deepEqual(resolveSelectKey(false, "Enter"), { action: "none", stop: true, prevent: false });
  // Tab and unrelated keys keep bubbling / their default.
  assert.deepEqual(resolveSelectKey(true, "Tab"), { action: "close", stop: false, prevent: false });
  for (const open of [false, true]) {
    for (const key of ["a", "F5", "Shift", "Escape"]) assert.equal(resolveSelectKey(open, key).stop, false);
  }
});

test("Select contract: opaque portal surface, no opacity/exit animation, Escape + outside press close, list semantics", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/components/ui/select.tsx"), "utf8");
  // The semi-transparent list came from an opacity animation (and an AnimatePresence exit) stalling mid-way.
  assert.ok(!/AnimatePresence|framer-motion|opacity:/.test(src), "no framer-motion / opacity animation on the list");
  assert.ok(/createPortal\(/.test(src) && /position: "fixed"/.test(src), "list is portaled and fixed-positioned");
  assert.ok(/\bbg-white\b/.test(src.split("role=\"listbox\"")[1] || ""), "list surface is bg-white");
  assert.ok(/\bborder\b[^"]*\bborder-slate-200\b/.test(src) && /\bshadow-2xl\b/.test(src), "border + elevation");
  assert.ok(/z-\[100001\]/.test(src), "z-index above modals/toasts");
  assert.ok(/overflow-y-auto/.test(src) && /maxHeight/.test(src), "height cap with inner scroll");
  assert.ok(/"Escape"/.test(src) && /"mousedown"/.test(src) && /"touchstart"/.test(src), "Escape and outside press close");
  assert.ok(/role="listbox"/.test(src) && /role="option"/.test(src) && /aria-activedescendant/.test(src), "listbox semantics");
  assert.ok(/if \(result\.stop\) e\.stopPropagation\(\)/.test(src), "handled keys do not bubble");
  assert.ok(/elementFromPoint/.test(src) && /if \(!anchorInSight\(\)\) setOpen\(false\)/.test(src), "closes when the field scrolls out of sight");
  assert.ok(/listRef\.current\?\.contains\(hit\)/.test(src) && /pointerEvents === "none"/.test(src), "a hit on the pinned list or a click-through field does not decide");
  assert.ok(/window\.visualViewport/.test(src) && /visibleBottom/.test(src), "uses the visual viewport");
  assert.ok(!/\.focus\(\)/.test(src), "focus() never scrolls the page: preventScroll everywhere");
  assert.ok(/htmlFor=\{triggerId\}/.test(src) && /aria-describedby=\{error \? errorId/.test(src) && /id=\{errorId\}/.test(src), "label and error are associated with the field");
  assert.ok(/lastMouse\.current = null/.test(src), "mouse tracking reset on open");
});
