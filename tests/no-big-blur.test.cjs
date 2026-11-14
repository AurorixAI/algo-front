// Safari on iOS paints a big `filter: blur()` for 6-15 s and the page is frozen meanwhile (a white screen / spinner, no request to the server; measured 14.11 on /d/<code>).
// The soft background of the public pages is radial gradients, never a blurred circle.  `backdrop-filter` is NOT touched (measured: no freeze).
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");

const root = path.join(__dirname, "..");
// the only small decoration left: teacher exam page, a 160x160 px (h-40 w-40) glow in the corner of a card, far below the 200 px of the freeze
const SMALL = [{ file: "src/app/teacher/exams/[id]/page.tsx", match: /h-40 w-40[^"]*blur-2xl/ }];

function sources(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) out.push(...sources(full));
    else if (/\.(tsx?|css)$/.test(name.name)) out.push(full);
  }
  return out;
}

test("в src нет большого размытия самого элемента (blur-[40px+], blur-2xl, blur-3xl, filter: blur(40px+)), кроме перечисленных мелких", () => {
  const bad = [];
  for (const file of sources(path.join(root, "src"))) {
    const rel = path.relative(root, file);
    const text = fs.readFileSync(file, "utf8");
    text.split("\n").forEach((line, index) => {
      const own = line.replace(/backdrop-blur-\[[^\]]*\]|backdrop-blur(-[a-z0-9]+)?|backdrop-filter:[^;]*;|-webkit-backdrop-filter:[^;]*;/g, "");
      const hits = [];
      for (const m of own.matchAll(/(?<![\w-])blur-\[(\d+(?:\.\d+)?)px\]/g)) if (Number(m[1]) >= 40) hits.push(m[0]);
      if (/(?<![\w-])blur-(2xl|3xl)(?![\w-])/.test(own)) hits.push("blur-2xl/3xl");
      for (const m of own.matchAll(/filter\s*:\s*[^;]*?blur\(\s*(\d+(?:\.\d+)?)px/g)) if (Number(m[1]) >= 40) hits.push(m[0]);
      for (const m of own.matchAll(/filter\s*:\s*["'`][^"'`]*blur\(\s*(\d+(?:\.\d+)?)px/g)) if (Number(m[1]) >= 40) hits.push(m[0]);
      if (hits.length && !SMALL.some((s) => s.file === rel && s.match.test(line))) bad.push(`${rel}:${index + 1} ${hits.join(" ")}`);
    });
  }
  assert.deepEqual(bad, []);
});

test("нет mix-blend-mode на фоне публичных страниц", () => {
  for (const file of ["src/components/ui/public-background.tsx", "src/app/login/page.tsx", "src/app/invite/[code]/page.tsx", "src/components/onboarding/onboarding-shell.tsx"]) {
    assert.ok(!/mix-blend|rounded-full blur/.test(fs.readFileSync(path.join(root, file), "utf8")), file);
  }
});

let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "ignore" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

/** Elements bigger than 300x300 px whose computed `filter` blurs them (the element itself, not its backdrop). */
const BIG_BLURS = () => [...document.querySelectorAll("body *")]
  .filter((el) => /blur/.test(getComputedStyle(el).filter))
  .map((el) => ({ cls: String(el.className).slice(0, 60), ...(({ width, height }) => ({ width, height }))(el.getBoundingClientRect()) }))
  .filter((el) => el.width > 300 && el.height > 300);

const WAIT = { timeout: 8000 };
const INVITE = { student_id: "s1", student_first_name: "Иван", student_last_name: "Иванов", class_level: 7, org_name: "Центр", status: "pending" };
const EXAM = { exam_id: "E1", title: "Алгебра 7", subject: "math", teacher_name: "Т", has_group: false, total_time_minutes: 40, tasks_per_variant: 5, variants_count: 1, status: "active", time_remaining_seconds: 1500 };
const SCREENS = [
  ["/d/<code>: подтверждение", "diag-page.entry.tsx", (r) => (r.path === "/auth/diagnostic/C1" ? { json: INVITE } : null), (p) => p.evaluate(() => window.mountDiag("C1")), "Да, это я"],
  ["/e/<code>: лобби", "exam-page.entry.tsx", (r) => (r.path === "/exams/by-code/EX1" ? { json: EXAM } : null), (p) => p.evaluate(() => window.mountExam("ex1")), "Начать экзамен"],
  ["/e/<code>: экзамен не найден", "exam-page.entry.tsx", () => null, (p) => p.evaluate(() => window.mountExam("nope")), "Ошибка"],
  ["вход", "login.entry.tsx", () => null, (p) => p.evaluate(() => window.mountLogin()), "Войти"],
  ["приглашение", "invite.entry.tsx", (r) => (r.path === "/auth/invite/I1" ? { json: { org_name: "Центр", org_role: "teacher" } } : null), (p) => p.evaluate(() => window.mountInvite("I1")), "Вас пригласили"],
];
for (const [name, entry, answer, mount, text] of SCREENS) {
  for (const [width, height] of [[375, 812], [1280, 900]]) {
    test(`${name} (${width}): нет элемента больше 300x300 px с размытием filter, а фон на странице есть`, async () => {
      const { page } = await openPage(browser, entry, answer, { width, height });
      await mount(page);
      await page.getByText(text).first().waitFor(WAIT);
      assert.deepEqual(await page.evaluate(BIG_BLURS), []);
      assert.ok(await page.evaluate(() => [...document.querySelectorAll("body *")].some((el) => /radial-gradient/.test(getComputedStyle(el).backgroundImage))), "the soft spots are radial gradients");
      await page.close();
    });
  }
}
