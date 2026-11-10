// Owner 10.11: a waiting row holds ONE button «Подтвердить» and «⋯»; «Отклонить…» is the first item of the menu (danger) and opens the same window.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const root = path.join(__dirname, "..");

const item = (id, date, group, extra = {}) => ({ id, attendance_id: `a${id}`, lesson_date: date, lesson_key: `${date}_l`, group: { id: `g${id}`, name: group, ...extra }, teacher: { id: "t1", name: "Каримова К." }, student: { id: `s${id}`, full_name: `Ученик ${id}`, display_id: `AL-00${id}` }, reason: "Болел, справка у родителей", reason_by: { id: "p1", name: "Мать" }, reason_at: `${date}T07:00:00`, status: "pending", reviewed_by: null, reviewed_at: null, review_note: null, files: [], deadline: { kind: "date", date: "2026-11-30", days_left: 20 } });
const ROWS = [item("1", "2026-10-14", "7-А Алгебра"), item("2", "2026-09-22", "7-А Алгебра"), item("3", "2026-10-02", "5-Б Геометрия", { archived: true }), item("4", "2026-11-05", "7-Б Геометрия")];
const server = (r) => {
  if (r.path === "/auth/org/attendance/excuses/summary") return { json: { pending_total: ROWS.length, open_lessons_total: 0 } };
  if (r.path === "/auth/org/attendance/excuses") return { json: { items: ROWS, total: ROWS.length, pending_total: ROWS.length } };
  return null;
};
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

for (const [width, height] of [[1280, 900], [375, 812]]) {
  test(`${width}: a waiting row has no «Отклонить» button; the menu «⋯» has it first, in the danger tone, and it opens the same window`, async () => {
    const { page } = await openPage(browser, "ds.entry.tsx", server, { width, height });
    await page.clock.setFixedTime(new Date("2026-11-10T10:00:00+05:00"));
    await page.evaluate(() => window.mount("excuses", { role: "owner", org_role: "owner" }, {}));
    await page.waitForFunction((count) => document.querySelectorAll("li").length >= count, ROWS.length, { timeout: 10000, polling: "raf" });
    await page.waitForFunction(() => !document.querySelector('[role="progressbar"], .animate-pulse'), null, { timeout: 10000, polling: "raf" });
    const row = page.locator("li").first();
    assert.equal(await row.getByRole("button", { name: /^Отклонить/ }).count(), 0, "no «Отклонить» button in the row");
    assert.equal(await row.getByRole("button", { name: /^Подтвердить/ }).count(), 1, "«Подтвердить» stays");
    await row.getByRole("button", { name: /^Действия/ }).click();
    const items = page.getByRole("menuitem");
    await items.first().waitFor();
    assert.match(await items.first().innerText(), /^Отклонить/, "«Отклонить…» is the first item");
    const cls = await items.first().evaluate((el) => el.className + " " + getComputedStyle(el).color);
    assert.match(cls, /danger|rose|rgb\(2[0-9]{2}, ?[0-9]{1,2}, ?[0-9]{2}\)/, "danger tone");
    await items.first().click();
    await page.getByRole("dialog", { name: "Отклонить пропуск?" }).waitFor();
    await page.close();
  });
}
