// `node tests/dom/fix11f-shots.cjs <out dir>` - the changed states of the windows of enrolment (Money-2 fix 11, part F) as the product draws them: 1280 and 375; LONG=1 - the long names.  Headless Chromium, no window.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.join(__dirname, "..", "..");
const [out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
process.env.DOM_CSS = css;
const { launch } = require("../helpers/dom-page.cjs");
const H = require("../helpers/enrol-v2.cjs");
const { FRAMES, LONG_GROUP, DEBT } = require("../helpers/enrol-v2-frames.cjs");
const { server, pick, search, settled, openDrawer } = H;

const LONG = process.env.LONG === "1";
const GROUP = LONG ? LONG_GROUP : "М11 Г Пн-Ср-Пт";
const FIRST = LONG ? "Новоиспечённый" : "Каримов";
const NO_PLACE = "В группе нет мест: 30 из 30. Увеличьте число мест или выберите другую группу";
const DEBT_STAYS = { kind: "transfer", moves: [], stays: [{ code: "debt", text: "Долг 42 000 сум останется за учеником в группе «Алгебра 7»: его оплатят там", amount: 42000, group_name: "Алгебра 7" }], ends: [] };
const base = (extra = {}) => ({ people: LONG ? H.LONG_PEOPLE : H.PEOPLE, group: { name: GROUP }, ...extra });
const drawer = (ctx, width, extra) => openDrawer(ctx, server(base(extra)), { width, props: { groupName: GROUP } });

const SCENES = {
  "refused-one": async (ctx, width) => { const run = await drawer(ctx, width, { refuse: { st3: { reason: NO_PLACE, code: "GROUP_FULL" } } }); await pick(run.page, FIRST, "Юсупова", "Рашидов"); await run.page.waitForSelector('[data-testid="enrol-refused-st3"]'); await settled(run.page); return run; },
  "refused-all": async (ctx, width) => { const all = Object.fromEntries(["st1", "st2", "st3"].map((id) => [id, { reason: NO_PLACE, code: "GROUP_FULL" }])); const run = await drawer(ctx, width, { refuse: all }); await pick(run.page, FIRST, "Юсупова", "Рашидов"); await run.page.waitForSelector('[data-testid="enrol-refused-all"]'); return run; },
  "new-and-moved": async (ctx, width) => { const run = await drawer(ctx, width, { effectsOf: () => DEBT_STAYS }); await pick(run.page, FIRST); await search(run.page, "Назаров"); await pick(run.page, "Назаров"); await run.page.waitForSelector('[data-testid="transfer-preview"][data-state="ready"]'); await settled(run.page); return run; },
  "price-no-reason": async (ctx, width) => {
    const run = await drawer(ctx, width); await pick(run.page, FIRST, "Юсупова", "Рашидов"); await settled(run.page);
    await run.page.click('[data-testid="enrol-terms-toggle"]'); await run.page.fill("#add-student-price-amount", "520000"); await run.page.waitForTimeout(700);
    await run.page.click('[data-testid="enrol-terms-toggle"]'); await settled(run.page);
    await run.page.click('[data-testid="enrol-submit"]'); await run.page.waitForSelector('[data-testid="field-error"]'); await run.page.waitForTimeout(300);
    return run;
  },
  "whole-period": async (ctx, width) => { const run = await drawer(ctx, width, { parts: () => [{ label: "20.11–19.12", from: "", amount: 450000, lessons: 13, lessons_in_period: null, whole: true }] }); await pick(run.page, FIRST); await settled(run.page); return run; },
  "future-day": async (ctx, width) => { const run = await drawer(ctx, width, { defaultPayFrom: "2026-11-21" }); await pick(run.page, FIRST, "Юсупова"); await run.page.waitForTimeout(800); await settled(run.page); return run; },
  "one-student-two-phrases": async (ctx, width) => { const run = await drawer(ctx, width, { past: { st2: [DEBT] }, ordinary: ["st2"], undone: ["st3"] }); await pick(run.page, FIRST, "Юсупова", "Рашидов"); await run.page.waitForSelector('[data-testid="enrol-note-past"]'); await settled(run.page); return run; },
  "by-student": async (ctx, width) => FRAMES[7](ctx, { width, long: LONG }),
  "keep-in-both": async (ctx, width) => {
    const run = await drawer(ctx, width, { effectsOf: () => DEBT_STAYS, immediateText: () => "К оплате до 24.11: 188 000 сум (за 5 уроков)" });
    await search(run.page, "Назаров"); await pick(run.page, "Назаров"); await run.page.waitForSelector('[data-testid="transfer-preview"][data-state="ready"]'); await settled(run.page);
    await run.page.getByRole("radio", { name: "Оставить в обеих" }).click(); await run.page.waitForTimeout(800); await settled(run.page);
    return run;
  },
};

async function card(ctx, width, o = {}) {
  const physics = LONG ? "Физика 7 класс, углублённая программа подготовки к олимпиаде (понедельник, среда, пятница)" : "М11 А Пн-Ср-Пт";
  const groups = [
    { id: "g7", name: "Алгебра 7", class_level: 7, status: "active", price_current: { amount: 400000, valid_from: "2026-09-01" }, schedule: [H.SLOT(1), H.SLOT(3), H.SLOT(5)], student_count: 20, max_students: 30 },
    { id: "g2", name: physics, class_level: 7, status: "active", teacher_name: "Лола Мирзаева", price_current: { amount: 450000, valid_from: "2026-09-01" }, schedule: [H.SLOT(1), H.SLOT(3), H.SLOT(5)], student_count: 12, max_students: 30 },
    { id: "gg", name: "Геометрия 7", class_level: 7, status: "active", teacher_name: "Камол Эргашев", price_current: { amount: 450000, valid_from: "2026-09-01" }, schedule: [H.SLOT(2, "17:30", "18:30")], student_count: 28, max_students: 30 },
  ];
  const run = await H.openPage(ctx.browser, "enrol-v2.entry.tsx", server({ groups, ...(o.server ?? {}) }), { width, height: width === 375 ? 812 : 900 });
  await run.page.evaluate(([u, p]) => window.mount("card", u, p), [H.OWNER, { mode: "add", currentGroupId: "g7", currentGroupName: "Алгебра 7", excludeGroupIds: ["g7"], sourceGroups: [{ id: "g7", name: "Алгебра 7" }], studentName: LONG ? "Мухаммадаминхужа Новоиспечённый-Подкрепляющийся" : "Анвар Каримов" }]);
  await run.page.waitForSelector('[data-testid="assign-group-card"]');
  await run.page.locator('[data-testid="assign-group-card"]').nth(0).click();
  await run.page.waitForTimeout(800);
  return run;
}
SCENES["card-refused"] = (ctx, width) => card(ctx, width, { server: { refuseSingle: NO_PLACE } });
SCENES["card-future-day"] = (ctx, width) => card(ctx, width, { server: { defaultPayFrom: "2026-11-21" } });
SCENES["card-price-no-reason"] = async (ctx, width) => {
  const run = await card(ctx, width);
  await run.page.waitForFunction(() => !document.querySelector('[data-testid="assign-submit"]').disabled);
  await run.page.click('[data-testid="enrol-terms-toggle"]'); await run.page.fill("#assign-group-price-amount", "520000"); await run.page.waitForTimeout(700);
  await run.page.click('[data-testid="enrol-terms-toggle"]'); await run.page.waitForFunction(() => !document.querySelector('[data-testid="assign-submit"]').disabled);
  await run.page.click('[data-testid="assign-submit"]'); await run.page.waitForSelector('[data-testid="field-error"]'); await run.page.waitForTimeout(300);
  return run;
};

(async () => {
  const browser = await launch();
  const ctx = { browser };
  const only = (process.env.SCENES || "").split(",").filter(Boolean);
  for (const [name, make] of Object.entries(SCENES)) {
    if (only.length && !only.includes(name)) continue;
    for (const width of [1280, 375]) {
      const run = await make(ctx, width);
      await run.page.waitForTimeout(300);
      if (await run.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) console.log(`SUSPECT wide ${name} ${width}`);
      if (run.errors.length) console.log(`ERRORS ${name} ${width}: ${run.errors.slice(0, 2).join(" | ").slice(0, 200)}`);
      await run.page.screenshot({ path: path.join(out, `${name}-${width}${LONG ? "-long" : ""}.png`) });
      await run.page.close();
    }
  }
  await browser.close();
  fs.rmSync(path.dirname(css), { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });
