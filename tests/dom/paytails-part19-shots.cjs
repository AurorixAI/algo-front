// PAY-TAILS Б11.48 (part 19): `node tests/dom/paytails-part19-shots.cjs <out dir>` - the PNGs of the roster of a group with the pause in the «⋯» of a row, 1280 and 375, named «<состояние>-<ширина>.png».
// The page is the REAL GroupDetailView answered by the REAL answer of the server (tests/fixtures/paytails/part19/group_detail_with_pause.json); the clock stands on the day of its world (24.11.2026).
// `stress_long_names` is the same answer with two long names written by hand (nothing else moved) - the one synthetic state.  Prints ONLY suspicious things (sideways scroll, a menu off the screen, a console error).
// Run with TMPDIR in `artifacts/money1-stage/.cache` (the css of the run goes there).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.join(__dirname, "..", "..");
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
process.env.DOM_CSS = css;
const { launch, openPage } = require("../helpers/dom-page.cjs");
const { GROUP_FIXTURE, WORLD, ON_PAUSE, FREE, OWNER, ADMIN_NO_MONEY, groupServer } = require("../helpers/paytails-part19.cjs");

const suspicious = [];
const LONG = { ...GROUP_FIXTURE, students: GROUP_FIXTURE.students.map((s, index) => ({ ...s, first_name: index ? "Абдурахмонходжа" : "Мухаммадали-Шохрух", last_name: index ? "Шарофутдинов-Каримбердиев" : "Хамидуллаходжаев", full_name: index ? "Шарофутдинов-Каримбердиев Абдурахмонходжа" : "Хамидуллаходжаев Мухаммадали-Шохрух" })) };
const menuFor = (student) => async (page) => {
  const button = page.locator(`button[aria-label="Действия: ${student.full_name}"]`);
  await button.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await button.click();
  await page.waitForSelector('[role="menu"]');
  await page.waitForTimeout(250);
};
const dialogFrom = async (page) => { await menuFor(FREE)(page); await page.getByRole("menuitem", { name: "Пауза…" }).click(); await page.waitForSelector("#pause-first"); await page.waitForTimeout(500); };
const none = async () => {};
// [name, server options, user, act, what the PNG shows: "roster" (the table and the menu around it) or "dialog" (the window)]
const STATES = [
  ["list", {}, OWNER, none, "roster"],
  ["menu_free", {}, OWNER, menuFor(FREE), "roster"],
  ["menu_on_pause", {}, OWNER, menuFor(ON_PAUSE), "roster"],
  ["menu_admin_no_money", {}, ADMIN_NO_MONEY, menuFor(FREE), "roster"],
  ["dialog_from_group", {}, OWNER, dialogFrom, "dialog"],
  ["stress_long_names_list", { answer: LONG }, OWNER, none, "roster"],
  ["stress_long_names_menu_on_pause", { answer: LONG }, OWNER, async (page) => menuFor(LONG.students[0])(page), "roster"],
];

(async () => {
  const browser = await launch();
  for (const width of [1280, 375]) {
    for (const [state, options, user, act, kind] of STATES) {
      const touch = width === 375 ? { newPage: (o) => browser.newPage({ ...o, hasTouch: true, isMobile: true }) } : browser;
      const { page, errors } = await openPage(touch, "money-b.entry.tsx", groupServer(options), { width, height: kind === "dialog" ? (width === 375 ? 1500 : 1000) : 1500, today: WORLD });
      await page.evaluate(([who]) => window.mount("groupHeader", who, { refresh: true }), [user]);
      await page.waitForSelector('[data-testid="roster-table"]');
      await page.waitForTimeout(1200);
      await act(page);
      await page.waitForTimeout(300);
      const label = `${state}-${width}`;
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const bad = errors.filter((text) => !/Failed to load resource/.test(text));
      if (scroll > 0 || bad.length) suspicious.push(`${label}: scroll ${scroll} errors ${JSON.stringify(bad).slice(0, 200)}`);
      const menu = page.locator('[role="menu"]');
      if (await menu.count()) { const box = await menu.boundingBox(); if (box.x < 0 || box.x + box.width > width) suspicious.push(`${label}: the menu is off the screen ${JSON.stringify(box)}`); }
      if (kind === "dialog") {
        const box = await page.locator('[role="dialog"]').boundingBox();
        await page.screenshot({ path: path.join(out, `${label}.png`), clip: { x: 0, y: 0, width, height: Math.min(1500, Math.ceil(box.y + box.height + 24)) } });
      } else {
        const table = await page.locator('[data-testid="roster-table"]').boundingBox();
        const top = Math.max(0, table.y - 80);
        const menuBox = (await menu.count()) ? await menu.boundingBox() : null;
        const bottom = Math.max(table.y + table.height, menuBox ? menuBox.y + menuBox.height : 0) + 40;
        await page.screenshot({ path: path.join(out, `${label}.png`), clip: { x: 0, y: top, width, height: Math.min(1500 - top, bottom - top) } });
      }
      await page.close();
    }
  }
  await browser.close();
  console.log(suspicious.length ? suspicious.join("\n") : "no suspicious");
})().catch((error) => { console.error(error); process.exit(1); });
