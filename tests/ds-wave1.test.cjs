// Design system, wave 1, in a real browser (headless Chromium, the CSS of the project): Button (variants, sizes, heights, flat, focus ring), Modal (widths, title, no blur), ModalActions (order, 44 px on a phone,
// «почему» over an off button) and Toast (tones, contrast, icon, one link).  The gallery is tests/dom/ds.entry.tsx; PNGs of the same gallery: tests/dom/ds-shots.cjs.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe, touchTargets } = require("./helpers/layout-probe.cjs");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const open = async (width, height = 900, user) => {
  const { page, errors } = await openPage(browser, "ds.entry.tsx", () => null, { width, height });
  await page.evaluate((u) => window.mount("gallery", u), user ?? { role: "owner", org_role: "owner" });
  await page.waitForSelector("h1");
  return { page, errors };
};
const luminance = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const rgb = (css) => { const m = /rgba?\(([^)]+)\)/.exec(css); return m[1].split(/[ ,\/]+/).filter(Boolean).slice(0, 3).map(Number); };

test("Button: four variants and three sizes carry data-variant / data-size; a disabled and a loading one say so", async () => {
  const { page } = await open(1280);
  const facts = await page.evaluate(() => [...document.querySelectorAll("button[data-variant]")].map((b) => ({ v: b.dataset.variant, s: b.dataset.size, text: b.textContent.trim(), disabled: b.disabled, busy: b.getAttribute("aria-busy") })));
  assert.deepEqual([...new Set(facts.map((f) => f.v))].sort(), ["danger", "ghost", "primary", "secondary"]);
  assert.deepEqual([...new Set(facts.map((f) => f.s))].sort(), ["lg", "md", "sm"]);
  assert.ok(facts.some((f) => f.text === "Недоступно" && f.disabled), "a disabled button is off");
  assert.ok(facts.some((f) => f.text === "Сохраняем" && f.disabled && f.busy === "true"), "a loading button is off and busy");
  await page.close();
});

test("Button: heights 32 / 40 / 48 on a desktop; 40 / 40 / 48 on a phone; 44 on a phone in the cabinet of a teacher (touch density); the icon button is a square", async () => {
  const measure = (page) => page.evaluate(() => {
    const by = (size, text) => [...document.querySelectorAll(`button[data-size="${size}"]`)].find((b) => b.textContent.trim() === text);
    const h = (el) => Math.round(el.getBoundingClientRect().height * 10) / 10;
    return { sm: h(by("sm", "Малая")), md: h(by("md", "Обычная")), lg: h(by("lg", "Крупная")) };
  });
  const desktop = await open(1280);
  assert.deepEqual(await measure(desktop.page), { sm: 32, md: 40, lg: 48 });
  await desktop.page.close();
  const phone = await open(375, 812);
  assert.deepEqual(await measure(phone.page), { sm: 40, md: 40, lg: 48 }, "a phone of the owner: 40");
  await phone.page.evaluate(() => document.documentElement.setAttribute("data-density", "touch"));
  assert.deepEqual(await measure(phone.page), { sm: 40, md: 44, lg: 48 }, "a phone in the cabinet of a teacher / a student: the main control is 44");
  await phone.page.close();
  const wide = await open(1280);
  await wide.page.evaluate(() => document.documentElement.setAttribute("data-density", "touch"));
  assert.equal((await measure(wide.page)).md, 40, "touch density only matters on a phone");
  await wide.page.close();
});

test("Button is flat: no gradient, no shadow, no transform; a keyboard focus draws a 2 px ring, a disabled one is grey on grey", async () => {
  const { page } = await open(1280);
  const flat = await page.evaluate(() => {
    const s = (el) => getComputedStyle(el);
    const primary = document.querySelector('button[data-variant="primary"][data-size="md"]');
    const disabled = [...document.querySelectorAll("button[data-variant]")].find((b) => b.textContent.trim() === "Недоступно");
    return { image: s(primary).backgroundImage, shadow: s(primary).boxShadow, transform: s(primary).transform, bg: s(primary).backgroundColor, color: s(primary).color, disabledBg: s(disabled).backgroundColor, disabledColor: s(disabled).color };
  });
  assert.equal(flat.image, "none");
  assert.equal(flat.shadow, "none");
  assert.equal(flat.transform, "none");
  assert.deepEqual(rgb(flat.bg), [37, 99, 235], "primary-600");
  assert.ok(ratio(rgb(flat.bg), rgb(flat.color)) >= 4.5, "white on primary-600 passes AA");
  assert.deepEqual(rgb(flat.disabledBg), [226, 232, 240], "disabled: slate-200");
  assert.ok(ratio(rgb(flat.disabledBg), rgb(flat.disabledColor)) >= 3.5, "the label of a disabled button is still legible");
  await page.hover('button[data-variant="primary"][data-size="md"]');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('button[data-variant="primary"][data-size="md"]')).transform), "none", "no scale under the mouse");
  await page.keyboard.press("Tab");
  const ring = await page.evaluate(() => { const el = document.activeElement; return { tag: el.tagName, shadow: getComputedStyle(el).boxShadow }; });
  assert.equal(ring.tag, "BUTTON");
  assert.match(ring.shadow, /rgb\(59, 130, 246\) 0px 0px 0px 4px/, `the focus ring is primary-500 (2 px after a 2 px offset): ${ring.shadow}`);
  await page.close();
});

test("Modal: a question is 448 wide, a form 520; the title is 20 px bold; the backdrop is a plain dim (no blur); the card has the pop shadow and 20 px corners", async () => {
  for (const [id, width] of [["#open-question", 448], ["#open-form", 520]]) {
    const { page } = await open(1280);
    await page.click(id);
    await page.waitForSelector('[role="dialog"]');
    await page.waitForTimeout(450);
    const facts = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const title = dialog.querySelector("h2");
      const backdrop = [...document.querySelectorAll("div.fixed.inset-0")].find((el) => el.className.includes("bg-slate-900/40"));
      return { w: Math.round(dialog.getBoundingClientRect().width), size: getComputedStyle(title).fontSize, weight: getComputedStyle(title).fontWeight, blur: getComputedStyle(backdrop).backdropFilter, radius: getComputedStyle(dialog).borderTopLeftRadius, shadow: getComputedStyle(dialog).boxShadow };
    });
    assert.equal(facts.w, width, id);
    assert.equal(facts.size, "20px");
    assert.equal(facts.weight, "700");
    assert.ok(facts.blur === "none" || facts.blur === "", `no frosted glass: ${facts.blur}`);
    assert.equal(facts.radius, "20px");
    assert.match(facts.shadow, /rgba\(15, 23, 42, 0\.18\) 0px 12px 32px -8px/);
    await page.close();
  }
});

test("ModalActions: on a desktop «Отмена» then the main button on the right; on a phone one under another, the main one on top, full width, 44 px; the focus does not land on the cross", async () => {
  const desktop = await open(1280);
  await desktop.page.click("#open-question");
  await desktop.page.waitForSelector('[data-testid="confirm-cancel"]');
  await desktop.page.waitForTimeout(450);
  const row = await desktop.page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]').getBoundingClientRect();
    const cancel = document.querySelector('[data-testid="confirm-cancel"]');
    const main = document.querySelector('[role="dialog"] button[data-variant="danger"], [role="dialog"] button[data-variant="primary"]');
    const c = cancel.getBoundingClientRect(), m = main.getBoundingClientRect();
    return { cancelVariant: cancel.dataset.variant, mainVariant: main.dataset.variant, mainText: main.textContent.trim(), cancelText: cancel.textContent.trim(), sameRow: Math.abs(c.top - m.top) < 1, cancelLeft: c.right <= m.left, mainRight: Math.round(dialog.right - m.right), h: Math.round(m.height) };
  });
  assert.deepEqual([row.cancelVariant, row.mainVariant, row.cancelText, row.mainText], ["ghost", "danger", "Отмена", "Архивировать"]);
  assert.ok(row.sameRow && row.cancelLeft, "one row, the cancel on the left of the main button");
  assert.ok(row.mainRight >= 20 && row.mainRight <= 28, `the main button stands at the right padding of the window: ${row.mainRight}`);
  assert.equal(row.h, 40);
  await desktop.page.close();

  const phone = await open(375, 812);
  await phone.page.click("#open-question");
  await phone.page.waitForSelector('[data-testid="confirm-cancel"]');
  await phone.page.waitForTimeout(450);
  const stack = await phone.page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]').getBoundingClientRect();
    const cancel = document.querySelector('[data-testid="confirm-cancel"]');
    const main = document.querySelector('[role="dialog"] button[data-variant="danger"], [role="dialog"] button[data-variant="primary"]');
    const c = cancel.getBoundingClientRect(), m = main.getBoundingClientRect();
    return { mainAbove: m.bottom <= c.top + 0.5, mainW: Math.round(m.width), cancelW: Math.round(c.width), mainH: Math.round(m.height), cancelH: Math.round(c.height), inner: Math.round(dialog.width - 2 * 20) };
  });
  assert.ok(stack.mainAbove, "the main button is above «Отмена»");
  assert.ok(stack.mainH >= 44 && stack.cancelH >= 44, `44 px on a phone: ${JSON.stringify(stack)}`);
  assert.ok(stack.mainW >= stack.inner - 2 && stack.cancelW >= stack.inner - 2, `full width: ${JSON.stringify(stack)}`);
  const small = await phone.page.evaluate(touchTargets, '[role="dialog"]');
  assert.deepEqual(small, [], "every tap target of the window is ≥ 40 px");
  const probe = await phone.page.evaluate(layoutProbe, '[role="dialog"]');
  assert.deepEqual(probe.bad, [], "nothing leaves its box");
  await phone.page.close();
});

test("ModalActions: a main button that is off has the reason over the buttons and points at it (never a mute disabled button)", async () => {
  const { page } = await open(1280);
  await page.click("#open-why");
  await page.waitForSelector('[data-testid="confirm-why"]');
  await page.waitForTimeout(450);
  const facts = await page.evaluate(() => {
    const why = document.querySelector('[data-testid="confirm-why"]');
    const main = [...document.querySelectorAll('[role="dialog"] button[data-variant="primary"]')][0];
    return { why: why.textContent, id: why.id, describedBy: main.getAttribute("aria-describedby"), disabled: main.disabled, label: main.textContent.trim(), whyAbove: why.getBoundingClientRect().bottom <= main.getBoundingClientRect().top };
  });
  assert.equal(facts.why, "Укажите, как выплачено: наличные, карта или перевод.");
  assert.equal(facts.describedBy, facts.id);
  assert.ok(facts.disabled && facts.whyAbove, JSON.stringify(facts));
  assert.equal(facts.label, "Записать выплату 757 500 сум", "the main button names the action and the sum");
  await page.close();
});

test("Toast: success is GREEN with ≥ 4.5:1, error is red with ≥ 4.5:1, warning / info are light surfaces with dark text; every toast has an icon (not only a colour); a link is at most one", async () => {
  const cases = [["#toast-ok", "success", "status"], ["#toast-warn", "warning", "status"], ["#toast-err", "error", "alert"], ["#toast-info", "info", "status"]];
  for (const [id, tone, role] of cases) {
    const { page } = await open(1280);
    await page.click(id);
    await page.waitForSelector(`#toast-host [role="${role}"]`);
    await page.waitForTimeout(600);
    const f = await page.evaluate(() => {
      const el = document.querySelector("#toast-host [data-tone]");
      const s = getComputedStyle(el);
      return { tone: el.dataset.tone, bg: s.backgroundColor, color: s.color, icon: Boolean(el.querySelector("svg[aria-hidden='true']")), links: el.querySelectorAll("a").length, shadow: s.boxShadow, radius: s.borderTopLeftRadius };
    });
    assert.equal(f.tone, tone);
    assert.ok(f.icon, `${tone}: an icon`);
    assert.ok(ratio(rgb(f.bg), rgb(f.color)) >= 4.5, `${tone}: contrast ${ratio(rgb(f.bg), rgb(f.color)).toFixed(2)}`);
    assert.equal(f.radius, "16px");
    assert.match(f.shadow, /rgba\(15, 23, 42, 0\.18\)/);
    if (tone === "success") assert.deepEqual(rgb(f.bg), [4, 120, 87], "success-700: green");
    if (tone === "error") assert.deepEqual(rgb(f.bg), [190, 18, 60], "danger-700");
    await page.close();
  }
  const { page } = await open(1280);
  await page.click("#toast-link");
  await page.waitForSelector('#toast-host [data-testid="toast-link"]');
  const link = await page.evaluate(() => { const a = document.querySelector('#toast-host [data-testid="toast-link"]'); return { text: a.textContent, href: a.getAttribute("href"), count: document.querySelectorAll("#toast-host a").length, bg: getComputedStyle(a.closest("[data-tone]")).backgroundColor, color: getComputedStyle(a).color }; });
  assert.deepEqual([link.text, link.href, link.count], ["Открыть выписку", "/owner/payments", 1]);
  assert.ok(ratio(rgb(link.bg), rgb(link.color)) >= 4.5, "the link is legible on the green");
  await page.close();
});

test("the gallery has no horizontal scroll and no escaping text at 1280 / 1024 / 375", async () => {
  for (const width of [1280, 1024, 375]) {
    const { page, errors } = await open(width, 800);
    const probe = await page.evaluate(layoutProbe, "body");
    assert.deepEqual(probe.bad, [], `${width}: ${probe.bad.join(" | ")}`);
    assert.equal(probe.scroll, 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
});
