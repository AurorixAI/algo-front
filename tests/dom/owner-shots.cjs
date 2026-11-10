// Owner's remarks of 10.11: `node tests/dom/owner-shots.cjs <out dir> <tailwind css>` - the queue of «Пропуски» across months, the choice of time, the scrollbar of a window.
const fs = require("node:fs");
const path = require("node:path");
const out = process.argv[2];
process.env.DOM_CSS = process.argv[3];
const { launch, openPage } = require("../helpers/dom-page.cjs");

const item = (id, date, group, extra = {}) => ({ id, attendance_id: `a${id}`, lesson_date: date, lesson_key: `${date}_l`, group: { id: `g${id}`, name: group, ...extra }, teacher: { id: "t1", name: "Каримова К." }, student: { id: `s${id}`, full_name: `Ученик ${id}`, display_id: `AL-00${id}` }, reason: "Болел, справка у родителей", reason_by: { id: "p1", name: "Мать" }, reason_at: `${date}T07:00:00`, status: "pending", reviewed_by: null, reviewed_at: null, review_note: null, files: [], deadline: { kind: "date", date: "2026-11-30", days_left: 20 } });
const ROWS = [item("1", "2026-10-14", "7-А Алгебра"), item("2", "2026-09-22", "7-А Алгебра"), item("3", "2026-10-02", "5-Б Геометрия", { archived: true }), item("4", "2026-11-05", "7-Б Геометрия")];
const server = (r) => {
  if (r.path === "/auth/org/attendance/excuses/summary") return { json: { pending_total: ROWS.length, open_lessons_total: 0 } };
  if (r.path === "/auth/org/attendance/excuses") {
    const q = new URLSearchParams(r.query); const from = q.get("date_from"), to = q.get("date_to");
    const items = ROWS.filter((row) => (!from || row.lesson_date >= from) && (!to || row.lesson_date <= to));
    return { json: { items, total: items.length, pending_total: items.length } };
  }
  return null;
};
const SHOTS = [
  { name: "G-excuses-pending-queue", mount: "excuses", server, wait: "li", time: "2026-11-10T10:00:00+05:00" },
  { name: "D-time-picker-open", mount: "timePicker", act: async (page) => { await page.click('#demo-time ~ [data-testid="time-picker-open"]'); await page.waitForSelector('[data-testid="time-picker"]'); await page.waitForTimeout(200); } },
  { name: "D-time-empty-error", mount: "timePicker", act: async (page) => { await page.click('button:has-text("Сохранить")'); await page.waitForSelector('[data-testid="demo-start-required"]'); await page.waitForTimeout(200); } },
  { name: "E-window-scroll", mount: "timePicker", act: async (page) => { await page.evaluate(() => { const b = document.querySelector('[data-modal-part="body"]'); b.scrollTop = 60; }); await page.waitForTimeout(200); } },
];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await launch();
  for (const shot of SHOTS) {
    for (const [width, height] of [[1280, 640], [375, 700]]) {
      const { page } = await openPage(browser, "ds.entry.tsx", shot.server ?? (() => null), { width, height });
      if (shot.time) await page.clock.setFixedTime(new Date(shot.time));
      await page.evaluate(([name]) => window.mount(name, { role: "owner", org_role: "owner" }, {}), [shot.mount]);
      try { if (shot.wait) await page.waitForSelector(shot.wait, { timeout: 5000 }); await page.waitForTimeout(shot.mount === "timePicker" ? 500 : 900); if (shot.act) await shot.act(page); } catch (error) { console.log(`${shot.name} ${width}: ${String(error).split("\n")[0].slice(0, 120)}`); }
      await page.screenshot({ path: path.join(out, `${shot.name}-${width}.png`) });
      await page.close();
    }
  }
  await browser.close();
})();
