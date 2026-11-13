// Release review 06.11 (the owner's remark): in a column of a table the TEXT of the status chip, the line under it and the header of the column stand on ONE vertical (±1 px).  Measured in a real browser,
// on the TEXT NODE of the chip (a Range), not on its frame.
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

/** The left edge of the first text of an element (the text node, not the box). */
const textLeft = `(el) => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.textContent.trim()) continue; const r = document.createRange(); r.selectNodeContents(n); const rect = r.getClientRects()[0]; if (rect) return rect.left; } return null; }`;

for (const bucket of ["debt", "waiting"]) {
  for (const [width, height] of [[1280, 900], [375, 812]]) {
    test(`«Оплаты», вкладка ${bucket}, ${width}: the text of the chip, the line under it and (from 1280) the header «Статус» have one left edge`, async () => {
      const { page } = await openPage(browser, "money-b.entry.tsx", paymentsServer, { width, height });
      await page.evaluate((b) => window.mount("payments", { role: "owner", org_role: "owner" }, { refresh: true, search: `bucket=${b}` }), bucket);
      await page.waitForSelector('[data-testid="status-cell"] [data-bleed]');
      await page.waitForTimeout(400);
      const m = await page.evaluate(`(() => {
        const left = ${textLeft};
        const cell = document.querySelector('[data-testid="status-cell"]');
        const chip = cell.querySelector("[data-bleed]");
        const lines = [...cell.querySelectorAll(".dt-value > div > p")].map((p) => ({ text: p.textContent.trim().slice(0, 30), left: left(p) }));
        const header = [...document.querySelectorAll("span")].find((el) => el.textContent.trim() === "Статус" && el.children.length === 0);
        return { chip: left(chip), lines, header: header && header.offsetParent ? left(header) : null };
      })()`);
      assert.ok(m.lines.length > 0, "there is a line under the chip");
      for (const line of m.lines) assert.ok(Math.abs(line.left - m.chip) <= 1, `${line.text}: ${line.left} vs the text of the chip ${m.chip}`);
      if (width >= 1280) assert.ok(m.header !== null && Math.abs(m.header - m.chip) <= 1, `header ${m.header} vs chip text ${m.chip}`);
      await page.close();
    });
  }
}

// the class of the lean is a whole literal in the source, so Tailwind generates it: the computed margins are -N / +N px for every size
for (const [size, out] of [["sm", 7], ["md", 9], ["lg", 13]]) {
  test(`Chip bleed size ${size}: margin-left -${out}px, margin-right ${out}px (real CSS built from the sources)`, async () => {
    const { page } = await openPage(browser, "ds.entry.tsx", () => null, { width: 1280, height: 900 });
    await page.evaluate(() => window.mount("chipBleed"));
    await page.waitForSelector(`[data-testid="bleed-${size}"]`);
    const m = await page.evaluate((s) => { const st = getComputedStyle(document.querySelector(`[data-testid="bleed-${s}"]`)); return [st.marginLeft, st.marginRight]; }, size);
    assert.deepEqual(m, [`-${out}px`, `${out}px`]);
    await page.close();
  });
}

test("StatusChip bleed: the same margins as the medium Chip", async () => {
  const { page } = await openPage(browser, "ds.entry.tsx", () => null, { width: 1280, height: 900 });
  await page.evaluate(() => window.mount("chipBleed"));
  await page.waitForSelector('[data-testid="bleed-status"]');
  const m = await page.evaluate(() => { const st = getComputedStyle(document.querySelector('[data-testid="bleed-status"]')); return [st.marginLeft, st.marginRight]; });
  assert.deepEqual(m, ["-9px", "9px"]);
  await page.close();
});
