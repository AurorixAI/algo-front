// The clock of the time field opens a choice (release review 06.11, the owner): hours 00-23 and minutes in steps of 5, the typed mask stays, the keyboard works, the choice is inside the screen on a phone,
// a missing time of a NEW lesson says so at its field.  Real browser, real CSS; the demo is tests/dom/ds.entry.tsx.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const open = async (width, height, props = {}) => {
  const { page, errors } = await openPage(browser, "ds.entry.tsx", () => null, { width, height });
  await page.evaluate((p) => { window.__log = []; window.mount("timePicker", { role: "owner", org_role: "owner" }, p); }, props);
  await page.waitForSelector("#demo-time");
  await page.waitForTimeout(450);
  return { page, errors };
};

test("the clock is a button: it opens hours 00-23 and minutes by 5, 24 h; a click on an hour and a minute sets «ЧЧ:ММ», the choice closes, the focus is in the field", async () => {
  const { page } = await open(1280, 900);
  await page.click('#demo-time ~ [data-testid="time-picker-open"]');
  await page.waitForSelector('[data-testid="time-picker"]');
  const sizes = await page.evaluate(() => ({ hours: document.querySelectorAll('[data-column="hours"] [role="option"]').length, minutes: document.querySelectorAll('[data-column="minutes"] [role="option"]').length, first: document.querySelector('[data-column="hours"] [role="option"]').textContent, last: [...document.querySelectorAll('[data-column="hours"] [role="option"]')].pop().textContent, lastMinute: [...document.querySelectorAll('[data-column="minutes"] [role="option"]')].pop().textContent }));
  assert.deepEqual(sizes, { hours: 24, minutes: 12, first: "00", last: "23", lastMinute: "55" });
  await page.click('[data-column="hours"] [data-key="14"]');
  await page.click('[data-column="minutes"] [data-key="35"]');
  assert.equal(await page.inputValue("#demo-time"), "14:35");
  assert.equal(await page.locator('[data-testid="time-picker"]').count(), 0, "the choice is closed after the minutes");
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), "demo-time", "the focus is back in the field");
  await page.close();
});

test("an empty field opens with the columns scrolled to 09; a filled one - to its value, which is highlighted", async () => {
  const empty = await open(1280, 900);
  await empty.page.click('#demo-time ~ [data-testid="time-picker-open"]');
  await empty.page.waitForSelector('[data-testid="time-picker"]');
  await empty.page.waitForTimeout(100);
  const seen = await empty.page.evaluate(() => { const list = document.querySelector('[data-column="hours"]'); const o = list.querySelector('[data-key="09"]'); const l = list.getBoundingClientRect(), r = o.getBoundingClientRect(); return r.top >= l.top - 1 && r.bottom <= l.bottom + 1; });
  assert.ok(seen, "09 is in view");
  await empty.page.close();
  const filled = await open(1280, 900, { initial: "17:45" });
  await filled.page.click('#demo-time ~ [data-testid="time-picker-open"]');
  await filled.page.waitForSelector('[data-testid="time-picker"]');
  const marked = await filled.page.evaluate(() => [...document.querySelectorAll('[data-selected]')].map((o) => o.textContent));
  assert.deepEqual(marked, ["17", "45"]);
  await filled.page.close();
});

test("the keyboard: Alt+↓ opens, ↓ ↑ step the column at once, ← → change the column, Enter closes, Esc closes WITHOUT a change and ONLY the choice (not the window); the focus stays in the field; the typed mask still works", async () => {
  const { page } = await open(1280, 900);
  await page.focus("#demo-time");
  await page.keyboard.press("Alt+ArrowDown");
  await page.waitForSelector('[data-testid="time-picker"]');
  await page.keyboard.press("ArrowDown");          // 09 -> 10, the minute is 00
  assert.equal(await page.inputValue("#demo-time"), "10:00");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");          // minutes: 00 -> 05
  assert.equal(await page.inputValue("#demo-time"), "10:05");
  await page.keyboard.press("ArrowUp");            // back to 00
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  assert.equal(await page.inputValue("#demo-time"), "10:05");
  assert.equal(await page.locator('[data-testid="time-picker"]').count(), 0, "Enter closes");
  await page.keyboard.press("Alt+ArrowDown");
  await page.waitForSelector('[data-testid="time-picker"]');
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.inputValue("#demo-time"), "11:05");
  await page.keyboard.press("Escape");
  assert.equal(await page.inputValue("#demo-time"), "10:05", "Esc takes the change back");
  assert.equal(await page.locator('[data-testid="time-picker"]').count(), 0, "Esc closed the choice");
  assert.deepEqual(await page.evaluate(() => window.__log), [], "the window around it was NOT closed");
  assert.equal(await page.evaluate(() => document.activeElement.id), "demo-time");
  await page.fill("#demo-time", "");
  await page.keyboard.type("930");
  await page.keyboard.press("Tab");
  assert.equal(await page.inputValue("#demo-time"), "09:30", "the mask is still there");
  await page.close();
});

test("a NEW lesson has no prepared time: the fields are empty with «Укажите время»; the first try to save says «Укажите время начала» at the field, then «Укажите время окончания»", async () => {
  const { page } = await open(1280, 900);
  assert.equal(await page.inputValue("#demo-nachalo"), "");
  assert.equal(await page.getAttribute("#demo-nachalo", "placeholder"), "Укажите время");
  assert.equal(await page.locator('[data-testid="demo-start-required"]').count(), 0, "nothing is red before the first try");
  await page.click('button:has-text("Сохранить")');
  await page.waitForSelector('[data-testid="demo-start-required"]');
  assert.equal((await page.textContent('[data-testid="demo-start-required"]')).trim(), "Укажите время начала");
  await page.fill("#demo-nachalo", "10:00");
  await page.keyboard.press("Tab");
  await page.waitForFunction(() => document.querySelector("#demo-okonchanie").value === "11:30", null, { timeout: 3000 });
  assert.equal(await page.inputValue("#demo-okonchanie"), "11:30", "the end follows the start by 90 minutes");
  await page.close();
});

test("the scrollbar of a window: only the body between the header and the footer scrolls, it is thin and soft (no grey gutter), the card is clipped and rounded; the body is inside the screen on 1280 and 375", async () => {
  for (const [width, height] of [[1280, 520], [375, 560]]) {
    const { page } = await open(width, height);
    const m = await page.evaluate(() => {
      const card = document.querySelector('[role="dialog"]');
      const body = card.querySelector('[data-modal-part="body"]');
      const s = getComputedStyle(body);
      const r = card.getBoundingClientRect();
      return { overflowCard: getComputedStyle(card).overflow, radius: getComputedStyle(card).borderTopLeftRadius, scrollbarWidth: s.scrollbarWidth, overflowY: s.overflowY, marginRight: s.marginRight, scrolls: body.scrollHeight > body.clientHeight, cardScrolls: card.scrollHeight > card.clientHeight + 1, bottom: r.bottom, vh: window.innerHeight, right: r.right, vw: window.innerWidth };
    });
    assert.equal(m.overflowCard, "hidden", `${width}: the card clips its content to the rounded corner`);
    assert.equal(m.scrollbarWidth, "thin");
    assert.equal(m.overflowY, "auto");
    assert.equal(m.marginRight, "4px", "the bar is 4 px away from the edge of the card");
    assert.ok(m.scrolls && !m.cardScrolls, `${width}: the body scrolls, the card does not`);
    assert.ok(m.bottom <= m.vh && m.right <= m.vw, `${width}: inside the screen`);
    await page.close();
  }
});

test("the choice: pinned captions «Часы» / «Минуты», a «:» between the columns, ONE band - the hour and the minutes of the value stand on one line; an empty field proposes 09 : 00 but shows nothing in the field; at 375 the same", async () => {
  for (const width of [1280, 375]) {
    const { page } = await open(width, 812);
    await page.click('#demo-time ~ [data-testid="time-picker-open"]');
    await page.waitForSelector('[data-testid="time-picker"]');
    await page.waitForTimeout(150);
    const m = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="time-picker"]');
      const rect = (el) => el.getBoundingClientRect();
      const h = panel.querySelector('[data-column="hours"] [data-key="09"]'), mi = panel.querySelector('[data-column="minutes"] [data-key="00"]');
      const colon = [...panel.querySelectorAll("div")].find((d) => d.textContent === ":" && d.children.length === 0);
      const hs = rect(h), ms = rect(mi), cs = rect(colon), ps = rect(panel);
      const caps = [...panel.querySelectorAll("span")].map((s) => s.textContent).filter(Boolean);
      return { dy: Math.abs((hs.top + hs.height / 2) - (ms.top + ms.height / 2)), cy: Math.abs((cs.top + cs.height / 2) - (hs.top + hs.height / 2)), cx: Math.abs((cs.left + cs.width / 2) - (hs.right + ms.left) / 2), caps, inside: ps.left >= 0 && ps.right <= innerWidth, value: document.querySelector("#demo-time").value, chosen: panel.querySelectorAll("[data-selected]").length };
    });
    assert.ok(m.dy <= 1, `09 and 00 on one line (${width}): ${m.dy}`);
    assert.ok(m.cy <= 1, `the colon is on that line (${width}): ${m.cy}`);
    assert.ok(m.cx <= 2, `the colon is between the columns (${width}): ${m.cx}`);
    assert.deepEqual(m.caps, ["Часы", "Минуты"]);
    assert.ok(m.inside);
    assert.equal(m.value, "", "nothing in the field until a choice");
    assert.equal(m.chosen, 0);
    await page.close();
  }
});

test("the window of a ONE-OFF lesson: nothing is switched off silently - the first try to save says «Укажите время начала», «Укажите время окончания» and «Выберите, как оплатить урок преподавателю», the focus goes to the first empty field; no false «прошедшее время»", async () => {
  const { page } = await openPage(browser, "ds.entry.tsx", () => null, { width: 1280, height: 900 });
  await page.evaluate(() => window.mount("addLesson", { role: "teacher", org_role: "teacher" }, {}));
  await page.waitForSelector('button:has-text("Разовое занятие")');
  await page.click('button:has-text("Разовое занятие")');
  await page.click('button:has-text("Дополнительный урок")');
  await page.fill("#weekly-add-data-zanyatiya", "31.12.2030");
  const save = page.locator('button:has-text("Сохранить урок")');
  assert.equal(await save.isDisabled(), false, "the button is on before the first try");
  await save.click();
  await page.waitForSelector('[data-testid="weekly-add-end-required"]');
  const dialog = page.getByRole("dialog").first();
  const text = await dialog.innerText();
  assert.match(text, /Укажите время начала/);
  assert.match(text, /Укажите время окончания/);
  assert.match(text, /Выберите, как оплатить урок преподавателю/);
  assert.doesNotMatch(text, /прошедшее время/);
  assert.equal(await save.isDisabled(), false, "still on after the try");
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => document.activeElement && (document.activeElement.name || document.activeElement.id)), "weekly-add-money", "the focus is on the first empty field in the order of the screen (the payment is above the time)");
  await page.close();
});

// ── the scroll of the columns (owner, prod 10.11: «при попытке скрола он ломается») ─────────────
// The bug: every scroll event moved the panel's `place` state, and the effect on it scrolled the column back to the middle - the column jumped back on every pixel and no value was ever reached.
const bandState = (page, column) => page.evaluate((name) => {
  const list = document.querySelector(`[data-column="${name}"]`);
  const box = list.getBoundingClientRect(), mid = box.top + box.height / 2;
  let best = null;
  for (const o of list.querySelectorAll("[role=option]")) { const r = o.getBoundingClientRect(); const d = Math.abs(r.top + r.height / 2 - mid); if (!best || d < best.d) best = { key: o.dataset.key, d, h: r.height }; }
  return best;
}, column);
const wheelOn = async (page, column, dy) => { const box = await page.locator(`[data-column="${column}"]`).boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, dy); };
const openPicker = async (page) => { await page.click('#demo-time ~ [data-testid="time-picker-open"]'); await page.waitForSelector('[data-testid="time-picker"]'); await page.waitForTimeout(250); };

for (const [width, height] of [[1280, 520], [375, 640]]) {
  test(`scroll ${width}: the wheel by N rows lands on the item under the band (0 px off), the value is that item, the window under does not scroll`, async () => {
    const { page } = await open(width, height);
    await openPicker(page);
    const row = (await bandState(page, "hours")).h;
    const bodyBefore = await page.evaluate(() => document.querySelector('[data-modal-part="body"]').scrollTop);
    await wheelOn(page, "hours", row * 3);          // 09 -> 12
    await page.waitForTimeout(500);
    let state = await bandState(page, "hours");
    assert.equal(state.key, "12");
    assert.ok(state.d <= 0.5, `centred to ${state.d}px`);
    assert.equal((await page.inputValue("#demo-time")).slice(0, 2), "12", "the field says the hour under the band");
    await wheelOn(page, "minutes", row * 2);        // 00 -> 10
    await page.waitForTimeout(500);
    state = await bandState(page, "minutes");
    assert.equal(state.key, "10");
    assert.ok(state.d <= 0.5);
    assert.equal(await page.inputValue("#demo-time"), "12:10");
    assert.equal(await page.evaluate(() => document.querySelector('[data-modal-part="body"]').scrollTop), bodyBefore, "the window under the choice did not scroll");
    assert.equal(await page.evaluate(() => window.scrollY), 0);
    await page.close();
  });

  test(`scroll ${width}: a fast fling - the value is the item it stopped on, centred; the ends 00 / 23 and 00 / 55 are reachable and centred`, async () => {
    const { page } = await open(width, height);
    await openPicker(page);
    for (let i = 0; i < 6; i += 1) await wheelOn(page, "hours", 160);   // a jerk without pauses
    await page.waitForTimeout(700);
    let state = await bandState(page, "hours");
    assert.ok(state.d <= 0.5, `centred to ${state.d}px`);
    assert.equal((await page.inputValue("#demo-time")).slice(0, 2), state.key, "the value is the item it stopped on");
    for (let i = 0; i < 12; i += 1) await wheelOn(page, "hours", 400);  // to the very bottom
    await page.waitForTimeout(700);
    state = await bandState(page, "hours");
    assert.equal(state.key, "23"); assert.ok(state.d <= 0.5);
    assert.equal((await page.inputValue("#demo-time")).slice(0, 2), "23");
    for (let i = 0; i < 12; i += 1) await wheelOn(page, "hours", -400); // to the very top
    await page.waitForTimeout(700);
    state = await bandState(page, "hours");
    assert.equal(state.key, "00"); assert.ok(state.d <= 0.5);
    for (let i = 0; i < 8; i += 1) await wheelOn(page, "minutes", 400);
    await page.waitForTimeout(700);
    state = await bandState(page, "minutes");
    assert.equal(state.key, "55"); assert.ok(state.d <= 0.5);
    assert.equal(await page.inputValue("#demo-time"), "00:55");
    for (let i = 0; i < 8; i += 1) await wheelOn(page, "minutes", -400);
    await page.waitForTimeout(700);
    state = await bandState(page, "minutes");
    assert.equal(state.key, "00"); assert.ok(state.d <= 0.5);
    assert.equal(await page.inputValue("#demo-time"), "00:00");
    await page.close();
  });

  test(`scroll ${width}: no jump back - scrollTop during a wheel scroll in one direction never goes back; reopened, the value stands in the middle`, async () => {
    const { page } = await open(width, height);
    await openPicker(page);
    await page.evaluate(() => { window.__seq = []; const l = document.querySelector('[data-column="hours"]'); l.addEventListener("scroll", () => window.__seq.push(l.scrollTop)); });
    const row = (await bandState(page, "hours")).h;
    for (const dy of [row, row, row * 2, row * 4, row, row * 3]) { await wheelOn(page, "hours", dy); await page.waitForTimeout(40); }
    await page.waitForTimeout(700);
    const seq = await page.evaluate(() => window.__seq);
    assert.ok(seq.length > 3, "the column moved");
    for (let i = 1; i < seq.length; i += 1) assert.ok(seq[i] >= seq[i - 1] - 0.01, `jump back at ${i}: ${seq[i - 1]} -> ${seq[i]}`);
    const value = await page.inputValue("#demo-time");
    await page.keyboard.press("Escape");
    await page.click("#demo-time");
    await page.fill("#demo-time", value);
    await openPicker(page);
    for (const name of ["hours", "minutes"]) {
      const state = await bandState(page, name);
      assert.equal(state.key, name === "hours" ? value.slice(0, 2) : value.slice(3));
      assert.ok(state.d <= 0.5, `${name} reopened centred to ${state.d}px`);
    }
    await page.close();
  });
}

test("375: a TOUCH scroll (a swipe gesture) moves the column and lands on an item under the band; every row is at least 40 px; the choice is inside the screen", async () => {
  const { page } = await open(375, 640);
  await openPicker(page);
  const sizes = await page.evaluate(() => { const p = document.querySelector('[data-testid="time-picker"]').getBoundingClientRect(); return { row: document.querySelector("[role=option]").getBoundingClientRect().height, inside: p.left >= 0 && p.right <= innerWidth && p.top >= 0 && p.bottom <= innerHeight }; });
  assert.ok(sizes.row >= 40, `a row is ${sizes.row}px`);
  assert.ok(sizes.inside, "the choice is inside the screen");
  const box = await page.locator('[data-column="hours"]').boundingBox();
  const client = await page.context().newCDPSession(page);
  await client.send("Input.synthesizeScrollGesture", { x: box.x + box.width / 2, y: box.y + box.height / 2, yDistance: -sizes.row * 4, gestureSourceType: "touch", speed: 600 });
  await page.waitForTimeout(800);
  const state = await bandState(page, "hours");
  assert.ok(state.d <= 0.5, `centred to ${state.d}px`);
  assert.notEqual(state.key, "09", "the touch moved the column");
  assert.equal((await page.inputValue("#demo-time")).slice(0, 2), state.key);
  await page.close();
});
