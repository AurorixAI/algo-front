// Design system wave 3: the DataTable on the real screens, in a real browser with the project's CSS (and in the Linux container of CI).
// Names are not cut, money is on the right, the text and the dates on the left, a table where there is room (the width of the TABLE, with the 240 px sidebar of the cabinet) and cards on a phone / a narrow place.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const X = require("./helpers/money-b-fixture.cjs");
const { monthServer } = require("./helpers/month-list-fixture.cjs");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const WAIT = { timeout: 10000, polling: "raf" };
// the cabinet's sidebar takes 240 px from a tablet up: the page content is what is left of it
const sidebar = (width) => (width >= 768 ? 240 : 0);
const mountWith = (page, width, name, props = {}) => page.evaluate(([pad, mountName, mountProps]) => { document.getElementById("root").style.boxSizing = "border-box"; document.getElementById("root").style.padding = pad ? `0 32px 0 ${pad + 32}px` : "0 16px"; window.mount(mountName, { role: "owner", org_role: "owner" }, mountProps); }, [sidebar(width), name, props]);

const paymentsServer = (request) => {
  if (request.path === "/auth/org/payments/summary") return { json: X.SUMMARY };
  if (request.path === "/auth/org/payments/status") {
    const tab = /bucket=([a-z]+)/.exec(request.query)[1];
    const items = tab === "waiting" ? [X.WAITING] : tab === "debtors" ? [X.DEBTOR] : [];
    return { json: { items, total: items.length, limit: 50, offset: 0 } };
  }
  if (request.path === "/auth/org/groups") return { json: [{ id: "g1", name: "7-А Алгебра", teacher_id: "t1" }] };
  return null;
};

const MODE = `(() => { const head = document.querySelector(".dt-head"); const row = document.querySelector(".dt-row"); return { table: head ? getComputedStyle(head).display === "grid" : false, rowGrid: getComputedStyle(row).display === "grid", labels: [...document.querySelectorAll(".dt-label")].filter((el) => el.offsetParent !== null).length }; })()`;

for (const width of [1280, 1024, 375]) {
  test(`${width}: «Оплаты» - the name and the group are not cut, money (price, last payment) is RIGHT, text LEFT; ${width >= 1280 ? "a table" : "cards"}`, async () => {
    const { page } = await openPage(browser, "money-b.entry.tsx", paymentsServer, { width, height: 900 });
    await mountWith(page, width, "payments", { refresh: true, search: "bucket=debtors" });
    await page.waitForSelector(".dt-row", WAIT);
    await page.waitForFunction(() => document.querySelector('[data-col="student"] a')?.textContent?.includes("Иванов"), null, WAIT);
    const mode = await page.evaluate(MODE);
    if (width >= 1280) {
      assert.ok(mode.table && mode.rowGrid, "a table at 1280 with the sidebar");
      const facts = await page.evaluate(() => {
        const cell = (col) => document.querySelector(`.dt-row [data-col="${col}"]`), head = (col) => document.querySelector(`.dt-head [data-col="${col}"]`);
        const cut = (el) => { const r = document.createRange(); r.selectNodeContents(el); return el.scrollWidth > el.clientWidth + 1; };
        return {
          nameCut: cut(cell("student").querySelector("a")), groupCut: cut(cell("group").querySelector("a")),
          price: [getComputedStyle(head("price")).textAlign, getComputedStyle(cell("price")).textAlign],
          last: [getComputedStyle(head("last")).textAlign, getComputedStyle(cell("last")).textAlign],
          group: [getComputedStyle(head("group")).textAlign, getComputedStyle(cell("group")).textAlign],
          student: [getComputedStyle(head("student")).textAlign, getComputedStyle(cell("student")).textAlign],
          leftEdge: [Math.round(head("student").getBoundingClientRect().left), Math.round(cell("student").getBoundingClientRect().left)],
          scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      assert.equal(facts.nameCut, false, "the name is not cut");
      assert.equal(facts.groupCut, false, "the group is not cut");
      assert.deepEqual(facts.price, ["right", "right"], "the price is money: right, its header too");
      assert.deepEqual(facts.last, ["right", "right"], "the last payment is money: right");
      assert.deepEqual(facts.group, ["left", "left"], "the group is text: left");
      assert.deepEqual(facts.student, ["left", "left"]);
      assert.equal(facts.leftEdge[0], facts.leftEdge[1], "the header and the cells share one left edge");
      assert.equal(facts.scroll, 0, "no horizontal scroll");
    } else {
      assert.equal(mode.table, false, "cards, not a table, below 1280 with the sidebar");
      assert.ok(mode.labels >= 2, "a card gives its cells captions");
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.equal(scroll, 0, "no horizontal scroll");
    }
    await page.close();
  });
}

// the list of the month is a table from 880 px of ITSELF (the sidebar takes 240 px: a table from a 1184 px window); the rates and a sum with its caption need that room on ONE line
for (const [width, table] of [[1280, true], [1200, true], [1024, false], [768, false], [375, false]]) {
  test(`${width}: «Зарплата», the list of the month is ${table ? "a TABLE" : "CARDS"} (a table from a width above a portrait tablet), the three sums are RIGHT`, async () => {
    const { page } = await openPage(browser, "money.entry.tsx", monthServer(), { width, height: 900 });
    await page.clock.setFixedTime(new Date("2026-11-05T10:00:00+05:00"));
    await page.evaluate((pad) => { document.getElementById("root").style.boxSizing = "border-box"; document.getElementById("root").style.padding = pad ? `0 32px 0 ${pad + 32}px` : "0 16px"; window.__search = "month=2026-11"; window.mount("monthPage", { role: "owner", org_role: "owner" }); }, sidebar(width));
    await page.waitForSelector(".dt-row", WAIT);
    const mode = await page.evaluate(MODE);
    assert.equal(mode.table, table, `${width}: ${table ? "table" : "cards"}`);
    if (table) {
      const aligns = await page.evaluate(() => ["salary", "paid", "rest"].map((col) => [getComputedStyle(document.querySelector(`.dt-head [data-col="${col}"]`)).textAlign, getComputedStyle(document.querySelector(`.dt-row [data-col="${col}"]`)).textAlign]));
      assert.deepEqual(aligns, [["right", "right"], ["right", "right"], ["right", "right"]]);
      const cut = await page.evaluate(() => [...document.querySelectorAll('.dt-row [data-col="action"] button')].filter((b) => b.scrollWidth > b.clientWidth + 1).length);
      assert.equal(cut, 0, "the button label is not cut");
      const rows = await page.evaluate(() => [...document.querySelectorAll(".dt-body > li")].map((li) => Math.round(li.getBoundingClientRect().height)));
      assert.ok(rows.length >= 3 && Math.max(...rows) - Math.min(...rows) <= 8, `the rows of the table are of one height (±8 px): ${rows.join(", ")}`);
    } else {
      assert.ok(mode.labels >= 3, "a card names its numbers");
    }
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.equal(scroll, 0, "no horizontal scroll");
    await page.close();
  });
}

const STUDENTS = [
  { id: "s1", first_name: "Азиз", last_name: "Эргашев", full_name: "Эргашев Азиз Абдуллаевич", class_level: 7, display_id: "DS-0012345", student_phone: "+998901234567", joined_at: "2026-09-01T05:00:00", status: "active" },
  { id: "s2", first_name: "Мадина", last_name: "Каримова", full_name: "Каримова Мадина", class_level: 7, display_id: "DS-0012346", student_phone: "+998907654321", joined_at: "2026-10-12T05:00:00", status: "active" },
];
for (const width of [1280, 375]) {
  test(`${width}: «Состав группы» - ${width > 768 ? "a table" : "cards"}, no sideways scroll anywhere, the ID is not cut`, async () => {
    const { page } = await openPage(browser, "ds.entry.tsx", () => null, { width, height: 900 });
    await mountWith(page, width, "roster", { students: STUDENTS });
    await page.waitForSelector(".dt-row", WAIT);
    const facts = await page.evaluate(() => {
      const id = [...document.querySelectorAll('.dt-row [data-col="display_id"] button')];
      return {
        scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        boxScroll: [...document.querySelectorAll(".dt, .dt-frame, .dt-body, .dt-row")].filter((el) => el.scrollWidth > el.clientWidth + 1).length,
        idCut: id.filter((el) => el.scrollWidth > el.clientWidth + 1).length,
        idTexts: id.map((el) => el.textContent.trim()),
        table: getComputedStyle(document.querySelector(".dt-head")).display === "grid",
      };
    });
    assert.equal(facts.scroll, 0, "the page does not scroll sideways");
    assert.equal(facts.boxScroll, 0, "nothing scrolls inside the table / the card either");
    assert.equal(facts.idCut, 0, "the ID is whole");
    assert.deepEqual([...facts.idTexts].sort(), ["DS-0012345", "DS-0012346"]);
    assert.equal(facts.table, width > 768);
    await page.close();
  });
}

// ---- the same rules on EVERY screen of wave 3: a status chip is one line and its icon does not touch its text; money is one line; the line under a name is one line ----
const { SHOTS } = require("./helpers/wave3-fixtures.cjs");
const LINES = `(el) => { const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const tops = []; for (let node = walker.nextNode(); node; node = walker.nextNode()) { if (!node.textContent.trim()) continue; const range = document.createRange(); range.selectNodeContents(node); for (const rect of range.getClientRects()) if (rect.height > 0 && rect.width > 0) tops.push(Math.round(rect.top)); } tops.sort((a, b) => a - b); let lines = tops.length ? 1 : 0; for (let i = 1; i < tops.length; i++) if (tops[i] - tops[i - 1] > 4) lines++; return lines; }`;
const PROBE = `(() => {
  const lines = ${LINES};
  const textBox = (el) => { const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let box = null; for (let node = walker.nextNode(); node; node = walker.nextNode()) { if (!node.textContent.trim()) continue; const range = document.createRange(); range.selectNodeContents(node); const r = range.getBoundingClientRect(); box = box ? { left: Math.min(box.left, r.left), right: Math.max(box.right, r.right), top: Math.min(box.top, r.top), bottom: Math.max(box.bottom, r.bottom) } : { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; } return box; };
  const bad = [];
  const chips = [...document.querySelectorAll('[data-kind="status"], [data-kind="chip"], [data-kind="tag"], [data-testid="status-todo"]')].filter((el) => el.offsetParent !== null);
  for (const chip of chips) {
    const label = chip.textContent.trim().slice(0, 30), box = chip.getBoundingClientRect(), text = textBox(chip);
    if (lines(chip) > 1) bad.push("chip wraps: " + label);
    if (text && (text.left < box.left - 0.5 || text.right > box.right + 0.5)) bad.push("chip text leaves its frame: " + label);
    for (const icon of chip.querySelectorAll("svg")) { const r = icon.getBoundingClientRect(); if (text && r.width && r.left < text.right - 0.5 && r.right > text.left + 0.5 && r.top < text.bottom && r.bottom > text.top) bad.push("icon over the text: " + label); }
  }
  const money = [...document.querySelectorAll('.dt-row .dt-cell[data-align="end"]:not([data-actions])')].filter((el) => el.offsetParent !== null);
  for (const cell of money) for (const el of cell.querySelectorAll(".dt-value *")) { if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue; if (el.offsetParent === null) continue; if (lines(el) > 1) bad.push("money wraps: " + el.textContent.trim().slice(0, 40)); }
  const rates = [...document.querySelectorAll('[data-testid="teacher-rate"]')].filter((el) => el.offsetParent !== null);
  for (const el of rates) if (el.getBoundingClientRect().height > 20) bad.push("the line under the name wraps: " + el.textContent.trim().slice(0, 40));
  return { bad, chips: chips.length, money: money.length, scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
})()`;

for (const shot of SHOTS) {
  for (const width of [1280, 1024, 375]) {
    test(`${width}: «${shot.name}» - no chip wraps or touches its icon, money is one line, the line under a name is one line, no sideways scroll`, async () => {
      const { page } = await openPage(browser, shot.entry, shot.server, { width, height: 900 });
      if (shot.time) await page.clock.setFixedTime(new Date(shot.time));
      await page.evaluate(([pad, name, props, search]) => { document.getElementById("root").style.boxSizing = "border-box"; document.getElementById("root").style.padding = pad ? `0 32px 0 ${pad + 32}px` : "0 16px"; if (search) window.__search = search; window.mount(name, { role: "owner", org_role: "owner" }, props); }, [sidebar(width), shot.mount, shot.props, shot.search]);
      await page.waitForSelector(shot.wait, WAIT);
      await page.waitForTimeout(400);
      const facts = await page.evaluate(PROBE);
      assert.deepEqual(facts.bad, [], `${shot.name} ${width}: ${facts.bad.join("; ")}`);
      assert.equal(facts.scroll, 0, "no horizontal scroll");
      if (shot.name === "payments" || shot.name === "payroll-month") assert.ok(facts.chips >= 2, "the chips of the screen were checked");
      await page.close();
    });
  }
}
