// The public page of a diagnostic (/d/<code>) on a phone that gives NO animation frames (a real iPhone did: the server answered 200 and the spinner stayed for good),
// and with a request that never answers.  Behaviour in a real browser, not CSS class names: the next screen / question must be on the page AND opaque (nothing waits for a
// JS animation), and a check that hangs ends on the error screen with «retry».  The same suite runs in the Linux container of CI.
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
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "ignore" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

// no frame ever comes (framer-motion lives on requestAnimationFrame); the 20 s limit of the check becomes 400 ms
const NO_FRAMES = () => {
  window.requestAnimationFrame = () => 0;
  window.cancelAnimationFrame = () => {};
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  AbortSignal.timeout = (ms) => timeout(ms >= 20000 ? 400 : ms);
};
// polling by a timer: `raf` polling would wait for the frames the test took away
const WAIT = { timeout: 8000, polling: 50 };

/** The text is on the page and really visible: the product of the opacity of the element and of all its ancestors is 1 (the CSS fade-in is over). */
const SHOWN = (text) => {
  // the innermost element that holds the text (a formula may be split into spans)
  const holders = [...document.querySelectorAll("body *")].filter((node) => node.textContent.includes(text));
  const el = holders.find((node) => !holders.some((other) => other !== node && node.contains(other)));
  if (!el) return false;
  let opacity = 1;
  for (let node = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
  const box = el.getBoundingClientRect();
  return opacity > 0.99 && box.width > 0 && box.height > 0;
};

const INVITE = { student_id: "s1", student_first_name: "Мухаммадюсуф", student_last_name: "Абдурахмонов", class_level: 7, org_name: "Центр «Алго»" };
const task = (id, text, answered) => ({ task_id: id, question_text: text, question_latex: null, question_image_url: null, answer_type: "multiple_choice", answer_options: ["11", "12", "13"], items_answered: answered, items_max: 10 });

test("кадры анимации отключены, приглашение «pending»: виден экран подтверждения с именем и кнопкой", async () => {
  const { page } = await openPage(browser, "diag-page.entry.tsx", (request) => (request.path === "/auth/diagnostic/CODE1" ? { json: { ...INVITE, status: "pending" } } : null), { width: 375, height: 800, initScript: NO_FRAMES });
  await page.evaluate(() => window.mountDiag("CODE1"));
  await page.waitForFunction(SHOWN, "Абдурахмонов", WAIT);
  await page.waitForFunction(SHOWN, "Да, это я", WAIT);
  assert.equal(await page.locator(".animate-spin").count(), 0, "the spinner is gone");
  await page.close();
});

test("кадры анимации отключены, ответ отправлен: виден следующий вопрос", async () => {
  const { page, calls } = await openPage(browser, "diag-page.entry.tsx", (request) => {
    if (request.path === "/auth/diagnostic/CODE2") return { json: { ...INVITE, status: "confirmed" } };
    if (request.path === "/diagnostic/sessions/by-invite") return { json: { session_id: "S1", status: "active", items_answered: 0, total_time_ms: 0, current_task: task("t1", "Вычислите 7+5", 0) } };
    if (request.path === "/diagnostic/sessions/S1/answer") return { json: { next_task: task("t2", "Вычислите 8+6", 1), session_completed: false, total_time_ms: null } };
    return null;
  }, { width: 375, height: 800, initScript: NO_FRAMES });
  await page.evaluate(() => window.mountDiag("CODE2"));
  await page.waitForFunction(SHOWN, "Продолжить с вопроса 1", WAIT);
  await page.getByRole("button", { name: /Продолжить с вопроса 1/ }).click();
  await page.waitForFunction(SHOWN, "Вычислите 7+5", WAIT);
  // an answer is two taps: the first marks the option, the second sends it
  const option = page.getByRole("button", { name: /12/ });
  await option.click();
  await page.waitForTimeout(700);
  await option.click();
  await page.waitForFunction(SHOWN, "Вычислите 8+6", WAIT);
  assert.ok(calls.some((call) => call.path === "/diagnostic/sessions/S1/answer" && call.method === "POST"), "the answer was sent");
  await page.close();
});

test("проверка приглашения не отвечает: через предел экран ошибки с кнопкой повтора", async () => {
  const { page } = await openPage(browser, "diag-page.entry.tsx", (request) => (request.path === "/auth/diagnostic/CODE3" ? new Promise(() => {}) : null), { width: 375, height: 800, initScript: NO_FRAMES });
  await page.evaluate(() => window.mountDiag("CODE3"));
  assert.equal(await page.locator(".animate-spin").count(), 1, "first the spinner");
  await page.waitForFunction(SHOWN, "Не удалось открыть диагностику. Проверьте связь и повторите.", WAIT);
  await page.waitForFunction(SHOWN, "Повторить проверку состояния", WAIT);
  assert.equal(await page.locator(".animate-spin").count(), 0);
  await page.close();
});
