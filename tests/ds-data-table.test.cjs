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
          last: head("last").offsetParent ? [getComputedStyle(head("last")).textAlign, getComputedStyle(cell("last")).textAlign] : null,
          group: [getComputedStyle(head("group")).textAlign, getComputedStyle(cell("group")).textAlign],
          student: [getComputedStyle(head("student")).textAlign, getComputedStyle(cell("student")).textAlign],
          leftEdge: [Math.round(head("student").getBoundingClientRect().left), Math.round(cell("student").getBoundingClientRect().left)],
          scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      assert.equal(facts.nameCut, false, "the name is not cut");
      assert.equal(facts.groupCut, false, "the group is not cut");
      assert.deepEqual(facts.price, ["right", "right"], "the price is money: right, its header too");
      assert.equal(facts.last, null, "«Последняя оплата» is a secondary column: hidden in a table narrower than 1100 px (the sidebar takes 240 px at 1280)");
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

// the COMPACT card of the month list (a place from 560 px up to the table): the name with the status and a button of its own size in the first line, the three sums in equal columns under it
const ADVANCE = { teacher_id: "t9", teacher_name: "Юсупов Рустам", lessons_count: 0, lesson_types: [], rates: {}, missing_rates: [], sheet: null, advance_only: true, member_active: false, carry_in: 40000, warnings: { open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 0 },
  payout: { saved_total: 0, fresh_total: 0, target: 0, paid: 0, balance: 0, state: "unpaid", basis: "fresh", changed_by: 0, change_text: null, text: "x", items: [], carry_in: 40000, carry_used: 0, advance_out: 40000 } };
const CARD_FACTS = `(() => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
  return [...document.querySelectorAll(".dt-body > li")].map((li) => {
    const row = li.classList.contains("dt-row") ? li : li.querySelector(".dt-row"), btn = li.querySelector('[data-col="action"] button'), figs = ["salary", "paid", "rest"].map((c) => li.querySelector('[data-col="' + c + '"]')).filter((el) => el.offsetParent !== null);
    const rb = box(row), one = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getClientRects().length <= 1 || new Set([...r.getClientRects()].map((q) => Math.round(q.top / 4))).size === 1; };
    const lonely = [...li.querySelectorAll(".dt-value *")].filter((el) => el.offsetParent !== null && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).filter((el) => !one(el)).map((el) => el.textContent.trim().slice(0, 30));
    const chip = li.querySelector('[data-kind="status"], [data-kind="chip"], [data-kind="tag"]');
    return { name: li.querySelector('[data-col="teacher"] p')?.textContent.slice(0, 20), row: rb, btn: btn ? box(btn) : null, figs: figs.map(box), wraps: lonely, chipOne: chip ? box(chip).height < 40 : true, fig3: figs.length };
  });
})()`;
for (const [width, compact] of [[1024, true], [375, false]]) {
  test(`${width}: «Зарплата», the card of a teacher is ${compact ? "COMPACT (a line of name, status and button; the three sums in a row)" : "a COLUMN with a full-width button"}`, async () => {
    const { page } = await openPage(browser, "money.entry.tsx", monthServer({ teachers: [...require("./helpers/month-list-fixture.cjs").TEACHERS, ADVANCE] }), { width, height: 900 });
    await page.clock.setFixedTime(new Date("2026-11-05T10:00:00+05:00"));
    await page.evaluate((pad) => { document.getElementById("root").style.boxSizing = "border-box"; document.getElementById("root").style.padding = pad ? `0 32px 0 ${pad + 32}px` : "0 16px"; window.__search = "month=2026-11"; window.mount("monthPage", { role: "owner", org_role: "owner" }); }, sidebar(width));
    await page.waitForSelector(".dt-row", WAIT);
    await page.waitForTimeout(300);
    const cards = await page.evaluate(CARD_FACTS);
    assert.ok(cards.length >= 4, "all the rows are there, with the advance row");
    for (const card of cards) {
      assert.deepEqual(card.wraps, [], `${card.name}: chips and sums on one line`);
      if (compact) {
        assert.ok(card.row.height <= 160, `${card.name}: a card is at most 160 px high (${Math.round(card.row.height)})`);
        if (card.btn) {
          assert.ok(card.btn.width < card.row.width * 0.4, `${card.name}: the button is not over the whole width (${Math.round(card.btn.width)} of ${Math.round(card.row.width)})`);
          assert.ok(card.btn.top < card.figs[0].top, `${card.name}: the button is in the first line`);
        }
        assert.ok(card.figs.length >= 1 && card.figs.every((f) => Math.abs(f.top - card.figs[0].top) < 2), `${card.name}: the sums stand on one horizontal`);
        if (card.figs.length === 3) assert.ok(Math.abs(card.figs[0].width - card.figs[1].width) < 2 && Math.abs(card.figs[1].width - card.figs[2].width) < 2, `${card.name}: equal columns`);
      } else {
        if (card.btn) { assert.ok(card.btn.height >= 40, `${card.name}: the button is at least 40 px high (${Math.round(card.btn.height)})`); assert.ok(card.btn.width > card.row.width * 0.8, `${card.name}: the button is over the whole width`); }
        if (card.figs.length === 3) assert.ok(card.figs[1].top > card.figs[0].top && card.figs[2].top > card.figs[1].top, `${card.name}: the sums are a column`);
      }
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
      if (process.env.DT_SHOTS) await page.screenshot({ path: path.join(process.env.DT_SHOTS, `${shot.name}-${width}.png`), fullPage: true });
      assert.deepEqual(facts.bad, [], `${shot.name} ${width}: ${facts.bad.join("; ")}`);
      assert.equal(facts.scroll, 0, "no horizontal scroll");
      if (shot.name === "payments" || shot.name === "payroll-month") assert.ok(facts.chips >= 2, "the chips of the screen were checked");
      await page.close();
    });
  }
}

// ---- owner's remarks on «Оплаты» (06.11): the gap between neighbouring columns is at least 24 px (a sum on the right never touches the status on the left); the sign of an empty value «—» stands in the CENTRE of its column, under the centre of the heading ----
const TABLE_FACTS = `(() => {
  const rows = [...document.querySelectorAll(".dt-body .dt-row")].filter((row) => getComputedStyle(row).display === "grid");
  const gaps = [], dashes = [];
  for (const row of rows) {
    const cells = [...row.querySelectorAll(":scope > .dt-cell")].filter((c) => c.offsetParent !== null).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    for (let i = 1; i < cells.length; i++) gaps.push(Math.round(cells[i].getBoundingClientRect().left - cells[i - 1].getBoundingClientRect().right));
    for (const dash of row.querySelectorAll(".dt-empty")) {
      const head = document.querySelector('.dt-head [data-col="' + dash.closest(".dt-cell").dataset.col + '"]');
      const r = document.createRange(); r.selectNodeContents(dash); const hr = document.createRange(); hr.selectNodeContents(head); const d = r.getBoundingClientRect(), h = hr.getBoundingClientRect();
      dashes.push({ col: head.dataset.col, off: Math.abs((d.left + d.right) / 2 - (h.left + h.right) / 2) });
    }
  }
  const lines = (el) => { const q = document.createRange(); q.selectNodeContents(el); return new Set([...q.getClientRects()].map((x) => Math.round(x.top / 4))).size; };
  const name = (txt) => { const a = [...document.querySelectorAll('.dt-body [data-col="student"] a')].find((x) => x.textContent.includes(txt)); return a ? lines(a) : null; };
  const grp = [...document.querySelectorAll('.dt-body [data-col="group"] *')].find((x) => x.children.length === 0 && x.textContent.includes("7-А"));
  return { names: { ivan: name("Иванов Иван"), long: name("Очень"), group: grp ? lines(grp) : null }, rows: rows.length, minGap: gaps.length ? Math.min(...gaps) : null, dashes, scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
})()`;
// 1280 with the 240 px sidebar and 1024 with the menu folded (the tables stand there too)
for (const [width, pad] of [[1280, 240], [1024, 0]]) {
  for (const shot of SHOTS) {
    test(`${width}${pad ? "" : " (no sidebar)"}: «${shot.name}» - at least 24 px between the columns, «—» in the centre of its column`, async () => {
      const { page } = await openPage(browser, shot.entry, shot.server, { width, height: 900 });
      if (shot.time) await page.clock.setFixedTime(new Date(shot.time));
      await page.evaluate(([padding, name, props, search]) => { document.getElementById("root").style.boxSizing = "border-box"; document.getElementById("root").style.padding = padding ? `0 32px 0 ${padding + 32}px` : "0 16px"; if (search) window.__search = search; window.mount(name, { role: "owner", org_role: "owner" }, props); }, [pad, shot.mount, shot.props, shot.search]);
      await page.waitForSelector(shot.wait, WAIT);
      await page.waitForTimeout(400);
      const facts = await page.evaluate(TABLE_FACTS);
      if (process.env.DT_LOG) console.log("DTLOG", width, shot.name, facts.rows, facts.minGap, "dashes=" + facts.dashes.length, Math.max(0, ...facts.dashes.map((d) => d.off)).toFixed(2));
      if (facts.rows) {
        assert.ok(facts.minGap >= 24, `${shot.name}: the gap between columns is ${facts.minGap} px`);
        for (const dash of facts.dashes) assert.ok(dash.off <= 2, `${shot.name}: «—» of «${dash.col}» is ${dash.off.toFixed(1)} px off the centre of its heading`);
        assert.equal(facts.scroll, 0, "no horizontal scroll");
        if (shot.name === "payments") {
          if (process.env.DT_LOG) console.log("DTLOG-LINES", width, JSON.stringify(facts.names));
          if (width === 1280) { assert.equal(facts.names.group, 1, "«7-А Алгебра» is one line"); assert.equal(facts.names.ivan, 1, "«Иванов Иван» is one line"); assert.ok(facts.names.long <= 3, `the long name takes ${facts.names.long} lines`); }
        }
        if (["payroll-month"].includes(shot.name)) assert.ok(facts.dashes.length > 0, `${shot.name}: the check of «—» has something to measure`);
      }
      await page.close();
    });
  }
}
test("1440 (sidebar) and 1920: «Оплаты» - «Цена в месяц» ends 24 px or more before the status, «—» of «Последняя оплата» and of the salary list is under the centre of the heading", async () => {
  for (const [width, pad] of [[1440, 240], [1920, 0]]) {
    const { page } = await openPage(browser, "money-b.entry.tsx", paymentsServer, { width, height: 900 });
    await page.evaluate(([padding]) => { document.getElementById("root").style.boxSizing = "border-box"; document.getElementById("root").style.padding = padding ? `0 32px 0 ${padding + 32}px` : "0 16px"; }, [pad]);
    await page.evaluate(() => window.mount("payments", { role: "owner", org_role: "owner" }, { refresh: true, search: "bucket=debtors" }));
    await page.waitForSelector(".dt-row", WAIT);
    await page.waitForFunction(() => document.querySelector('[data-col="student"] a')?.textContent?.includes("Иванов"), null, WAIT);
    const f = await page.evaluate(() => {
      const row = document.querySelector(".dt-row"), price = row.querySelector('[data-col="price"]'), chip = row.querySelector('[data-col="status"] [data-kind]') || row.querySelector('[data-col="status"] span');
      const r = document.createRange(); r.selectNodeContents(price.querySelector(".dt-value")); const text = r.getBoundingClientRect();
      const dash = row.querySelector('[data-col="last"] .dt-empty'), head = document.querySelector('.dt-head [data-col="last"]'), dr = document.createRange(); dr.selectNodeContents(dash);
      const hr = document.createRange(); hr.selectNodeContents(head); const d = dr.getBoundingClientRect(), h = hr.getBoundingClientRect();
      return { table: getComputedStyle(row).display === "grid", gap: (() => { const cr = document.createRange(); cr.selectNodeContents(chip); return cr.getBoundingClientRect().left - text.right; })(), off: Math.abs((d.left + d.right) / 2 - (h.left + h.right) / 2) };
    });
    if (process.env.DT_LOG) console.log("DTLOG-PAY", width, f.gap.toFixed(1), f.off.toFixed(2));
    assert.ok(f.table, `${width}: a table`);
    assert.ok(f.gap >= 24, `${width}: the sum ends ${f.gap.toFixed(1)} px before the TEXT of the status (the fill of a chip leans 9 px into the gap)`);
    assert.ok(f.off <= 2, `${width}: «—» is ${f.off.toFixed(1)} px off the centre of «Последняя оплата»`);
    await page.close();
  }
});

// ---- owner's stage walk (12.11): on REAL data the header did not match the columns and the cells overlapped (every row was a grid of its own).  ONE grid for the whole table; measured for EVERY column of EVERY screen ----
const R = require("./helpers/real-life-fixture.cjs");
const GRID_PROBE = `(() => {
  const vis = (r) => r.width > 0.5 && r.height > 0.5;
  const clipTo = (rect, node, stop) => { let out = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }; for (let el = node.parentElement; el && el !== stop; el = el.parentElement) { const st = getComputedStyle(el); if (st.overflowX !== "visible") { const b = el.getBoundingClientRect(); out = { left: Math.max(out.left, b.left), right: Math.min(out.right, b.right), top: out.top, bottom: out.bottom }; } } return out; };
  const ink = (root) => {
    const boxes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) { if (!n.textContent.trim() || n.parentElement.closest(".sr-only, .dt-ghost")) continue; const r = document.createRange(); r.selectNodeContents(n); for (const q of r.getClientRects()) if (vis(q)) boxes.push(clipTo(q, n, root.parentElement)); }
    for (const e of root.querySelectorAll('button, svg, img, input, [role="progressbar"], progress, .rounded-full:not([data-kind])')) { if (e.closest(".sr-only, .dt-ghost, [data-kind]")) continue; const q = e.getBoundingClientRect(); if (vis(q)) boxes.push(q); }
    return boxes.length ? { left: Math.min(...boxes.map((b) => b.left)), right: Math.max(...boxes.map((b) => b.right)) } : null;
  };
  const bad = [], seen = { tables: 0, cells: 0, dashes: 0, cols: 0 };
  for (const table of document.querySelectorAll(".dt")) {
    const head = table.querySelector(".dt-head");
    if (!head || getComputedStyle(head).display !== "grid") continue;
    seen.tables++;
    const name = table.dataset.testid || "table";
    const heads = [...head.querySelectorAll(":scope > .dt-head-cell")];
    const rows = [...table.querySelectorAll(".dt-body .dt-row:not(.dt-row-span)")].filter((row) => getComputedStyle(row).display === "grid");
    const headBox = heads.map((h) => h.getBoundingClientRect());
    const headInk = heads.map((h) => ink(h));
    seen.cols += heads.length;
    rows.forEach((row, ri) => {
      const label = name + " row " + (ri + 1);
      const cells = [...row.querySelectorAll(":scope > .dt-cell")];
      if (cells.length !== heads.length) { bad.push(label + ": " + cells.length + " cells for " + heads.length + " columns"); return; }
      if (row.scrollWidth > row.clientWidth + 1) bad.push(label + ": the row scrolls sideways");
      let prev = null;
      cells.forEach((cell, ci) => {
        const col = heads[ci].dataset.col, hb = headBox[ci], cb = cell.getBoundingClientRect();
        seen.cells++;
        if (Math.abs(hb.left - cb.left) > 1 || Math.abs(hb.right - cb.right) > 1) bad.push(label + " / " + col + ": the column of the header is " + Math.round(hb.left) + "–" + Math.round(hb.right) + ", of the cell " + Math.round(cb.left) + "–" + Math.round(cb.right));
        const content = ink(cell), dash = cell.querySelector(".dt-empty");
        if (content) {
          if (content.left < hb.left - 1 || content.right > hb.right + 1) bad.push(label + " / " + col + ": the content leaves its column (" + Math.round(content.left) + "–" + Math.round(content.right) + " in " + Math.round(hb.left) + "–" + Math.round(hb.right) + ")");
          const align = heads[ci].dataset.align, hi = headInk[ci];
          if (dash) {
            seen.dashes++;
            const d = ink(dash);
            if (hi && d) { const off = Math.abs((d.left + d.right) / 2 - (hi.left + hi.right) / 2); if (off > 2) bad.push(label + " / " + col + ": «—» is " + off.toFixed(1) + " px off the centre of its heading"); }
          } else if (hi) {
            if (align === "start" && Math.abs(hi.left - content.left) > 1) bad.push(label + " / " + col + ": the left edge of the heading is " + Math.round(hi.left) + ", of the content " + Math.round(content.left));
            if (align === "end" && Math.abs(hi.right - content.right) > 1) bad.push(label + " / " + col + ": the right edge of the heading is " + Math.round(hi.right) + ", of the content " + Math.round(content.right));
          }
          if (prev && content.left - prev.right < 23.9) bad.push(label + " / " + col + ": only " + (content.left - prev.right).toFixed(1) + " px from the previous column");
          prev = content;
        }
      });
    });
  }
  return { bad, seen, scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
})()`;
const REAL_SCREENS = [
  { name: "payments-real", entry: "money-b.entry.tsx", server: R.paymentsRealServer, mount: "payments", props: { refresh: true, search: "bucket=debtors" }, wait: ".dt-row", ready: () => document.querySelectorAll(".dt-row").length >= 5, shots: "payments-real" },
  { name: "income-decisions-real", entry: "money-v.entry.tsx", server: R.decisionsRealServer, mount: "decisions", props: {}, wait: '[data-testid="decision-row"]', ready: () => document.querySelectorAll('[data-testid="decision-row"]').length >= 5, shots: "income-decisions-real" },
  { name: "roster-real", entry: "ds.entry.tsx", server: () => null, mount: "roster", props: { students: R.STUDENTS_REAL }, wait: ".dt-row", shots: "roster-real" },
  { name: "income-groups-real", entry: "ds.entry.tsx", server: () => null, mount: "collection", props: { collection: R.COLLECTION_REAL }, wait: ".dt-row", shots: "income-groups-real" },
];
const setPage = (page, pad, shot) => page.evaluate(([padding, name, props, search]) => { document.getElementById("root").style.boxSizing = "border-box"; document.getElementById("root").style.padding = padding ? `0 32px 0 ${padding + 32}px` : "0 16px"; if (search) window.__search = search; window.mount(name, { role: "owner", org_role: "owner" }, props); }, [pad, shot.mount, shot.props, shot.search]);
const gridCheck = (facts, label, needTable) => {
  assert.deepEqual(facts.bad, [], `${label}: ${facts.bad.slice(0, 8).join(" | ")}`);
  assert.equal(facts.scroll, 0, "no horizontal scroll");
  if (needTable) { assert.ok(facts.seen.tables >= 1 && facts.seen.cells >= 6, `${label}: something was measured ${JSON.stringify(facts.seen)}`); }
};
// the sidebar: 240 px at 1280 (a table of 976 px); at 1024 the menu is folded (a table of 992 px)
for (const [width, pad] of [[1280, 240], [1024, 0], [1440, 240]]) {
  for (const shot of [...SHOTS, ...REAL_SCREENS]) {
    test(`${width}: «${shot.name}» - every column: the heading and the cells have one left (right) edge ±1 px, 24 px between the contents, nothing leaves its column, «—» under the centre of the heading`, async () => {
      const { page } = await openPage(browser, shot.entry, shot.server, { width, height: 900 });
      if (shot.time) await page.clock.setFixedTime(new Date(shot.time));
      await setPage(page, pad, shot);
      await page.waitForSelector(shot.wait, WAIT);
      if (shot.ready) await page.waitForFunction(shot.ready, null, WAIT);
      await page.waitForTimeout(400);
      const facts = await page.evaluate(GRID_PROBE);
      const lines = await page.evaluate(PROBE);
      if (process.env.DT_SHOTS && shot.shots) await page.screenshot({ path: path.join(process.env.DT_SHOTS, `${shot.shots}-${width}.png`), fullPage: true });
      if (process.env.DT_LOG) console.log("GRIDLOG", width, shot.name, JSON.stringify(facts.seen), facts.bad.length);
      gridCheck(facts, `${shot.name} ${width}`, !["statement", "excuses"].includes(shot.name) || facts.seen.tables > 0);
      assert.deepEqual(lines.bad, [], `${shot.name} ${width}: ${lines.bad.join("; ")}`);
      if (shot.name.endsWith("-real")) assert.ok(facts.seen.tables === 1 && facts.seen.dashes >= (shot.name === "payments-real" && width === 1440 ? 2 : 0), `${shot.name} ${width}: a table with real data stays a table ${JSON.stringify(facts.seen)}`);
      await page.close();
    });
  }
}
test("1280: «Оплаты» on real data - the long group name wraps by words INSIDE its column, the name, the sums and the chips keep one column grid", async () => {
  const { page } = await openPage(browser, "money-b.entry.tsx", R.paymentsRealServer, { width: 1280, height: 900 });
  await setPage(page, 240, REAL_SCREENS[0]);
  await page.waitForFunction(() => document.querySelectorAll(".dt-row").length >= 5, null, WAIT);
  const f = await page.evaluate(() => {
    const row = (txt) => [...document.querySelectorAll(".dt-body .dt-row")].find((r) => r.textContent.includes(txt));
    const g = row("Ученик 1 Б-тест").querySelector('[data-col="group"] a'), gb = g.closest(".dt-cell").getBoundingClientRect();
    const r = document.createRange(); r.selectNodeContents(g);
    const tracks = [...document.querySelectorAll(".dt-head > .dt-head-cell")].map((c) => Math.round(c.getBoundingClientRect().width));
    const rowTracks = [...row("Тошматов").querySelectorAll(":scope > .dt-cell")].map((c) => Math.round(c.getBoundingClientRect().width));
    return { lines: new Set([...r.getClientRects()].map((q) => Math.round(q.top / 4))).size, inside: r.getBoundingClientRect().right <= gb.right + 1, tracks, rowTracks };
  });
  assert.ok(f.lines >= 2, "«Подготовка к экзамену 9 класс» wraps into lines");
  assert.ok(f.inside, "the wrapped name stays in its column");
  assert.deepEqual(f.tracks, f.rowTracks, "the header and a row have the same column widths");
  await page.close();
});

// ---- owner 13.11: priority of columns («Последняя оплата» is secondary: hidden whole in a table narrower than 1100 px) and wrapping BETWEEN words only ----
const openPayments = async (width, pad) => {
  const { page } = await openPage(browser, "money-b.entry.tsx", R.paymentsRealServer, { width, height: 900 });
  await setPage(page, pad, REAL_SCREENS[0]);
  await page.waitForFunction(() => document.querySelectorAll(".dt-row").length >= 5, null, WAIT);
  await page.waitForTimeout(300);
  return page;
};
const LINES_OF = `(el) => { const q = document.createRange(); q.selectNodeContents(el); return new Set([...q.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top / 4))).size; }`;
test("1280 with the 240 px sidebar: «Оплаты» - no «Последняя оплата» in the heading or the rows; names wrap between words, in few lines", async () => {
  const page = await openPayments(1280, 240);
  const f = await page.evaluate(`(() => {
    const lines = ${LINES_OF};
    const row = (txt) => [...document.querySelectorAll(".dt-body .dt-row")].find((r) => r.textContent.includes(txt));
    const link = (txt, col) => row(txt).querySelector('[data-col="' + col + '"] a');
    return {
      headLast: document.querySelectorAll('.dt-head [data-col="last"]').length, headVisible: [...document.querySelectorAll('.dt-head-cell')].filter((c) => c.offsetParent !== null).map((c) => c.dataset.col),
      cellsLast: [...document.querySelectorAll('[data-col="last"]')].filter((c) => c.offsetParent !== null).length,
      cells: [...document.querySelectorAll(".dt-body .dt-row")].map((r) => [...r.children].filter((c) => c.offsetParent !== null).length),
      algebra: lines(link("Тошматов", "group")), prep: lines(link("Ученик 1", "group")), fio: lines(link("Абдурахмонов", "student")),
      text: link("Тошматов", "group").textContent,
    };
  })()`);
  assert.equal(f.cellsLast, 0, "no visible cell of the hidden column");
  assert.ok(!f.headVisible.includes("last"), "no heading of it");
  assert.deepEqual(f.headVisible, ["student", "group", "price", "status", "actions"]);
  assert.ok(f.cells.every((n) => n === 5), `every row has five visible cells: ${f.cells}`);
  assert.equal(f.algebra, 1, "«Алгебра 7 (вт/пт)» is one line");
  assert.ok(f.fio <= 2, `a three-word full name takes ${f.fio} lines`);
  assert.ok(f.prep <= 2, `«Подготовка к экзамену 9 класс» (five words) takes ${f.prep} lines`);
  assert.equal(f.text, "Алгебра 7 (вт/пт)", "the text itself is untouched");
  await page.close();
});
test("1440 with the sidebar: «Оплаты» keeps the secondary column «Последняя оплата»", async () => {
  const page = await openPayments(1440, 240);
  const f = await page.evaluate(() => ({ head: [...document.querySelectorAll('.dt-head [data-col="last"]')].filter((c) => c.offsetParent !== null).length, cells: [...document.querySelectorAll('.dt-row [data-col="last"]')].filter((c) => c.offsetParent !== null).length, rows: document.querySelectorAll(".dt-body .dt-row").length }));
  assert.equal(f.head, 1); assert.equal(f.cells, f.rows);
  await page.close();
});
test("1403 / 1404: the table of 1099 / 1100 px: the column hides exactly under 1100 px of the TABLE (and is back in a card)", async () => {
  for (const [width, pad, visible] of [[1404, 240, true], [1403, 240, false]]) {
    const page = await openPayments(width, pad);
    const w = await page.evaluate(() => Math.round(document.querySelector(".dt").getBoundingClientRect().width));
    const shown = await page.evaluate(() => [...document.querySelectorAll('.dt-head [data-col="last"]')].some((c) => c.offsetParent !== null));
    assert.equal(shown, visible, `${width}: the table is ${w} px wide`);
    await page.close();
  }
  const card = await openPayments(375, 0);
  const labels = await card.evaluate(() => [...document.querySelectorAll('.dt-row [data-col="last"]')].filter((c) => c.offsetParent !== null).length);
  assert.ok(labels >= 3, "a card keeps «Последняя оплата»");
  await card.close();
});
for (const width of [1280, 1024]) {
  test(`${width}: «вт/пт», «пн/чт», «7-А» are never torn inside a word (payments, roster, collection)`, async () => {
    const checks = [[REAL_SCREENS[0], width === 1280 ? 240 : 0], [REAL_SCREENS[2], width === 1280 ? 240 : 0]];
    for (const [shot, pad] of checks) {
      const { page } = await openPage(browser, shot.entry, shot.server, { width, height: 900 });
      await setPage(page, pad, shot);
      await page.waitForSelector(".dt-row", WAIT);
      await page.waitForTimeout(300);
      const torn = await page.evaluate(() => {
        const bad = [];
        for (const word of ["(вт/пт)", "(пн/чт)"]) {
          const walker = document.createTreeWalker(document.querySelector(".dt-body"), NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (!n.textContent.includes(word)) continue;
            const r = document.createRange(); r.selectNodeContents(n);
            if (new Set([...r.getClientRects()].map((q) => Math.round(q.top / 4))).size > 1) bad.push(word);
          }
        }
        return bad;
      });
      assert.deepEqual(torn, [], `${shot.name} ${width}`);
      await page.close();
    }
  });
}
test("Words: no character is added, spaces stay spaces", () => {
  const src = fs.readFileSync(path.join(root, "src/components/ui/words.tsx"), "utf8");
  assert.doesNotMatch(src, /\\u2060|\\u200b|&#8203;|<wbr/i, "no zero-width characters or <wbr> are inserted");
});

// ---- stage walk W4 (13.11): «Поступления → Решения» at 1280 was 1056 px wide in a 976 px container: the «open» column left it and the page scrolled sideways.
// Real data (long names, a long chip, «1 250 000 сум»): the page never scrolls sideways at 1280 / 1024 / 1440 / 375, the «open» arrow is inside the table, «Кто» (low priority) is
// hidden whole under 1100 px of the TABLE and its value stands in the opened row; the grid check above (shot «income-decisions-real») measures the gap and the one grid.
const DECISIONS_REAL_SHOT = REAL_SCREENS.find((shot) => shot.name === "income-decisions-real");
for (const [width, pad] of [[1280, 240], [1024, 0], [1440, 240], [375, 0]]) {
  test(`${width}: «Решения» on real data - no sideways scroll, the «open» arrow is inside the table, «Кто» ${width === 1440 ? "is a column" : "is not a column (it is in the opened row / the card)"}`, async () => {
    const { page } = await openPage(browser, DECISIONS_REAL_SHOT.entry, DECISIONS_REAL_SHOT.server, { width, height: 900 });
    await page.addStyleTag({ content: ".max-w-\\[1100px\\]{max-width:none !important}" }); // the real page has no 1100 px frame: the table gets what the sidebar leaves
    await setPage(page, pad, DECISIONS_REAL_SHOT);
    await page.waitForSelector(DECISIONS_REAL_SHOT.wait, WAIT);
    await page.waitForFunction(DECISIONS_REAL_SHOT.ready, null, WAIT);
    await page.waitForTimeout(300);
    const facts = await page.evaluate(() => {
      const frame = document.querySelector(".dt-frame").getBoundingClientRect();
      const arrows = [...document.querySelectorAll('.dt-row [data-col="open"] svg')].filter((svg) => svg.getBoundingClientRect().width > 0);
      const actors = [...document.querySelectorAll('.dt-head [data-col="actor"]')].filter((cell) => cell.offsetParent !== null && getComputedStyle(cell).display !== "none");
      return { scroll: document.documentElement.scrollWidth - window.innerWidth, wide: window.innerWidth, table: getComputedStyle(document.querySelector(".dt-head")).display === "grid", frameRight: frame.right, arrowRight: Math.max(0, ...arrows.map((svg) => svg.getBoundingClientRect().right)), arrows: arrows.length, actorHead: actors.length };
    });
    assert.equal(facts.scroll, 0, "document.scrollWidth === innerWidth");
    // a chip of «Что» is never cut: its text is whole, and the chip is wholly inside its cell with room to the right (not sticking out of a too narrow `max-content` column)
    const chips = await page.evaluate(() => [...document.querySelectorAll('[data-testid="decision-kind"]')].map((chip) => {
      const box = chip.getBoundingClientRect(), cell = chip.closest('[data-col="kind"]').getBoundingClientRect();
      return { text: chip.textContent, cut: chip.scrollWidth - chip.clientWidth, wraps: chip.getBoundingClientRect().height > 30, right: Math.round((cell.right - box.right) * 10) / 10 };
    }));
    assert.equal(chips.length, 5, "a chip in every row");
    for (const chip of chips) {
      assert.ok(chip.cut <= 0, `«${chip.text}» is cut by ${chip.cut}px`);
      assert.ok(!chip.wraps, `«${chip.text}» wraps`);
      assert.ok(chip.right >= 0, `«${chip.text}» sticks out of its cell by ${-chip.right}px`);
    }
    if (process.env.DT_SHOTS) await page.screenshot({ path: path.join(process.env.DT_SHOTS, `decisions-fix-${width}.png`), fullPage: true });
    if (facts.table) {
      assert.equal(facts.arrows, 5, "an arrow in every row");
      assert.ok(facts.arrowRight <= facts.frameRight + 0.5, `the arrow ends at ${facts.arrowRight}, the table at ${facts.frameRight}`);
      assert.equal(facts.actorHead, width === 1440 ? 1 : 0, "«Кто» is a column only where the table is 1100 px or more");
      if (width < 1440) {
        await page.locator('[data-testid="decision-row"]').first().click();
        const detail = await page.locator('[data-testid="decision-details"]').innerText();
        assert.ok(detail.includes("Рахимжонова Нилуфар"), `the opened row says who decided: ${detail}`);
      }
    } else {
      assert.equal(width, 375, "only the phone is cards");
      const card = await page.evaluate(() => document.querySelector('[data-testid="decision-row"]').textContent);
      assert.ok(card.includes("Кто") && card.includes("Рахимжонова"), `a card keeps «Кто»: ${card}`);
    }
    await page.close();
  });
}

// ---- words stay words (owner's walk of prod, 14.11): on a phone «Лидтест 14 Тимур» read «Лидтест14Тимур» - the words of a name were separate boxes, and the cell of a card (a flex
// container) made the boxes its own flex items: the spaces between them vanished.  Every screen of REAL data, cards (375) and table (1280): the text of each cell with a name
// or a group is the string of the data (spaces normalised) and between two neighbouring words of one line there is a visible gap.
const NAMES_OF = {
  "payments-real": R.PAYMENT_ITEMS.flatMap((item) => [item.student_name, item.group_name]),
  "income-decisions-real": R.DECISIONS_REAL.map((item) => [item.student_name, item.group_name].join(" · ")),
  "roster-real": R.STUDENTS_REAL.map((item) => item.full_name),
  "income-groups-real": R.COLLECTION_REAL.groups.map((item) => item.group_name),
};
const WORDS_PROBE = `((names) => {
  const norm = (text) => text.replace(/\\s+/g, " ").trim();
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && el.offsetParent !== null; };
  const bad = []; const found = {};
  for (const name of names) {
    const holders = [...document.querySelectorAll("body *")].filter((el) => visible(el) && norm(el.textContent) === name);
    for (const el of holders) {
      found[name] = (found[name] || 0) + 1;
      if (norm(el.innerText) !== name) bad.push("«" + name + "»: the text of the cell is «" + norm(el.innerText) + "»");
      const boxes = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (const match of node.data.matchAll(/\\S+/g)) {
          const range = document.createRange(); range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
          const r = range.getBoundingClientRect(); if (r.width > 0) boxes.push({ word: match[0], left: r.left, right: r.right, top: r.top, bottom: r.bottom });
        }
      }
      if (boxes.map((b) => b.word).join(" ") !== name) bad.push("«" + name + "»: words in the DOM are «" + boxes.map((b) => b.word).join(" ") + "»");
      for (let i = 1; i < boxes.length; i++) {
        const a = boxes[i - 1], b = boxes[i];
        if (Math.abs(a.top - b.top) < (a.bottom - a.top) / 2 && !(a.right < b.left - 0.5)) bad.push("«" + name + "»: «" + a.word + "» and «" + b.word + "» touch (" + a.right.toFixed(1) + " / " + b.left.toFixed(1) + ")");
      }
    }
  }
  return { bad: [...new Set(bad)], found };
})`;
for (const width of [375, 1280]) {
  for (const shot of REAL_SCREENS) {
    test(`${width}: «${shot.name}» - the words of names and groups are the string of the data, with a gap between neighbours (${width === 375 ? "cards" : "table"})`, async () => {
      const { page } = await openPage(browser, shot.entry, shot.server, { width, height: 900 });
      await page.addStyleTag({ content: ".max-w-\\[1100px\\]{max-width:none !important}" });
      await setPage(page, width === 1280 ? 240 : 0, shot);
      await page.waitForSelector(shot.wait, WAIT);
      if (shot.ready) await page.waitForFunction(shot.ready, null, WAIT);
      await page.waitForTimeout(300);
      const names = [...new Set(NAMES_OF[shot.name])];
      const facts = await page.evaluate(`${WORDS_PROBE}(${JSON.stringify(names)})`);
      assert.deepEqual(facts.bad, [], `${shot.name} ${width}: ${facts.bad.slice(0, 6).join(" | ")}`);
      assert.ok(Object.keys(facts.found).length >= 2, `${shot.name} ${width}: names were measured ${JSON.stringify(facts.found)}`);
      await page.close();
    });
  }
}
