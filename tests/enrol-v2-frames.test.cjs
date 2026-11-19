// Windows of enrolment by the owner's mock-up: each of the 15 frames is opened on the stand with the mock-up's answers of the server and checked by its meaning (what is seen and what is not),
// including the accessibility (names of the buttons and the labels, `aria-checked`, the focus, Esc).  The people go through the product's own routes: the list, the search, the boxes, the button.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const { setup } = require("./helpers/money2-w2.cjs");
const H = require("./helpers/enrol-v2.cjs");
const { FRAMES, DEBT } = require("./helpers/enrol-v2-frames.cjs");
const { plain } = H;

const ctx = setup(test);
const text = async (page, selector) => plain(await page.locator(selector).first().innerText());
const bar = (page) => text(page, '[data-testid="summary-bar"]');
const barSum = (page) => text(page, '[data-testid="summary-bar-sum"]');
const barLine = (page) => text(page, '[data-testid="summary-bar-line"]');
const buttonOf = (page, id = "enrol-submit") => page.locator(`[data-testid="${id}"]`);
const writes = (calls) => calls.filter((c) => c.method === "POST" && /\/students\/(bulk|\w+)$/.test(c.path) && !/dry_run=true/.test(c.query));
const probes = (calls) => calls.filter((c) => c.method === "POST" && /\/students\/bulk$/.test(c.path) && /dry_run=true/.test(c.query));
const hints = (page) => page.locator('[role="dialog"] [aria-label="Пояснение"]').count();
const noErrors = (run) => assert.deepEqual(run.errors, [], "no error in the console");
const closed = async (page) => { await page.waitForFunction(() => !document.querySelector('[role="dialog"]')); };

test("frame 1: nobody chosen - the group, its days and price under the title, the search, the list; no sum, the button is off and says what to do", async () => {
  for (const width of [1280, 375]) {
    const run = await FRAMES[1](ctx, { width });
    const p = run.page;
    assert.equal(await p.getByRole("dialog", { name: "Зачислить в «М11 БС»" }).count(), 1);
    assert.match(await text(p, '[data-testid="enrol-group-line"]'), /^Вт · Чт · Сб · 16:00–17:00 · 450 000 сум в месяц$/);
    assert.equal(await p.getByLabel("Поиск по имени или ID").count(), 1);
    assert.equal(await text(p, '[data-testid="enrol-others-title"]'), "Ученики 7 класса · все классы");
    const rowsShown = () => p.locator('[data-testid="enrol-list"] li:visible input[type="checkbox"]').count();
    // a wide window holds the WHOLE list and scrolls it inside (no «и ещё N»); a phone has one scroll for the window, so its list is folded to five rows
    assert.equal(await rowsShown(), width === 375 ? 5 : 27, width === 375 ? "a phone: five rows" : "a wide window: every row");
    assert.equal(await p.locator('[data-testid="enrol-list"] input[type="checkbox"]:checked').count(), 0);
    assert.match(await text(p, '[data-testid="enrol-list"] li'), /Анвар Каримов 7 класс без группы/);
    if (width === 375) assert.match(await text(p, '[data-testid="enrol-list-more"]'), /^и ещё 22 ученика$/);
    else assert.equal(await p.locator('[data-testid="enrol-list-more"]:visible').count(), 0, "the list scrolls to its end: no «и ещё N»");
    // nothing else: no labels, no conditions, no special rows, no sum, no «?»
    for (const absent of ["picked-chips", "enrol-terms", "enrol-exceptions", "summary-bar-sum"]) assert.equal(await p.locator(`[data-testid="${absent}"]`).count(), 0, absent);
    assert.equal(await hints(p), 0);
    assert.equal(await text(p, '[data-testid="summary-bar-idle"]'), "Выберите учеников");
    assert.equal(await buttonOf(p).isDisabled(), true);
    assert.equal(plain(await buttonOf(p).innerText()), "Зачислить");
    if (width === 1280) {
      const box = await p.locator('[data-testid="enrol-list"]').evaluate((el) => ({ scrolls: el.scrollHeight > el.clientHeight + 1, overflowY: getComputedStyle(el).overflowY }));
      assert.deepEqual(box, { scrolls: true, overflowY: "auto" }, "the list scrolls inside the window");
    } else {
      // the rest of the list opens on request
      await p.click('[data-testid="enrol-list-more"]');
      assert.equal(await rowsShown(), 27);
    }
    noErrors(run);
    await p.close();
  }
});

test("frame 1: the filter of classes is a switch: «все классы» drops the class from the request of the list", async () => {
  const run = await FRAMES[1](ctx);
  const sw = run.page.getByRole("switch", { name: "все классы" });
  assert.equal(await sw.getAttribute("aria-checked"), "false");
  assert.match(run.calls.filter((c) => c.path === "/auth/org/students").pop().query, /class_level=7/);
  await sw.click(); await run.page.waitForTimeout(300);
  assert.equal(await sw.getAttribute("aria-checked"), "true");
  assert.doesNotMatch(run.calls.filter((c) => c.path === "/auth/org/students").pop().query, /class_level/);
  await run.page.close();
});

test("frame 2: three chosen - labels with a cross under the search, the rest below as «Ещё ученики»; the sum, its line and the button at the bottom; the conditions in ONE line", async () => {
  for (const width of [1280, 375]) {
    const run = await FRAMES[2](ctx, { width });
    const p = run.page;
    assert.deepEqual(await p.locator('[data-testid="picked-chip"] > span:first-child').allTextContents(), ["Анвар Каримов", "Лола Юсупова", "Тимур Рашидов"]);
    for (const name of ["Анвар Каримов", "Лола Юсупова", "Тимур Рашидов"]) assert.equal(await p.getByRole("button", { name: `Убрать: ${name}` }).count(), 1, `a cross named for ${name}`);
    assert.equal(await text(p, '[data-testid="enrol-others-title"]'), "Ещё ученики · все классы");
    assert.equal(await p.locator('[data-testid="enrol-list"] [data-student-row]').filter({ hasText: "Каримов" }).count(), 0, "a chosen one is not in the list again");
    assert.equal(await p.locator('[data-testid="enrol-exceptions"]').count(), 0, "nothing special: no block");
    assert.equal(await text(p, '[data-testid="enrol-terms-line"]'), "Оплата с 19 ноября, по цене группы");
    assert.equal(await text(p, '[data-testid="enrol-terms-why"]'), "первое занятие группы с сегодня", "the reason of the day is the server's");
    assert.equal(await text(p, '[data-testid="summary-bar"] p'), "К оплате сразу");
    assert.equal(await barSum(p), "564 000 сум");
    assert.equal(await barLine(p), "по 188 000 · 5 уроков из 12 в ноябре");
    assert.equal(plain(await buttonOf(p).innerText()), "Зачислить троих"); assert.equal(await buttonOf(p).isEnabled(), true);
    assert.equal(await hints(p), 0);
    // the cross takes one back to the list; the bar follows
    await p.getByRole("button", { name: "Убрать: Тимур Рашидов" }).click(); await H.settled(p);
    assert.equal(await p.locator('[data-testid="picked-chip"]').count(), 2);
    assert.equal(plain(await buttonOf(p).innerText()), "Зачислить двоих");
    assert.equal(await p.locator('[data-student-row]').filter({ hasText: "Рашидов" }).count(), 1, "he is back in the list");
    assert.equal(await barSum(p), "376 000 сум");
    noErrors(run);
    await p.close();
  }
});

test("frame 3: «Изменить» opens the day, the price and - only for a price that differs - its reason; the line and the sum follow; one probe per change; the way back is «По умолчанию»", async () => {
  const run = await FRAMES[3](ctx);
  const p = run.page;
  assert.equal(await text(p, '[data-testid="enrol-terms-line"]'), "Оплата с 17 ноября, своя цена 400 000");
  assert.equal(await text(p, '[data-testid="enrol-terms-why"]'), "дату выбрали вы");
  assert.equal(await p.getByLabel("Оплата с").inputValue(), "17.11.2026");
  assert.equal(plain(await p.getByLabel("Цена в месяц").inputValue()), "400 000");
  assert.equal(await p.getByLabel(/Почему своя цена/).inputValue(), "Скидка: брат и сёстры");
  assert.match(await text(p, '[data-testid="enrol-terms-edit"]'), /По умолчанию 19\.11/);
  assert.match(await text(p, '[data-testid="enrol-terms-edit"]'), /Цена группы — 450 000/);
  assert.equal(await barSum(p), "600 000 сум");
  assert.equal(await barLine(p), "по 200 000 · 6 уроков из 12 в ноябре");
  // the last probe carries what is on the screen, nothing else
  await p.waitForTimeout(600);   // the form settles: the last probe is the one that was sent after the pause
  const last = probes(run.calls).pop();
  assert.equal(last.body.pay_from, "2026-11-17"); assert.deepEqual(last.body.price_override, { amount: 400000, reason: "Скидка: брат и сёстры" });
  assert.ok(probes(run.calls).length <= 6, `a probe per change, not per key: ${probes(run.calls).length}`);
  // «Изменить» stays; the line says the new state after folding
  assert.equal(plain(await p.locator('[data-testid="enrol-terms-toggle"]').innerText()), "Свернуть");
  await p.click('[data-testid="enrol-terms-toggle"]');
  assert.equal(await p.locator('[data-testid="enrol-terms-edit"]').count(), 0);
  assert.equal(plain(await p.locator('[data-testid="enrol-terms-toggle"]').innerText()), "Изменить");
  assert.equal(await text(p, '[data-testid="enrol-terms-line"]'), "Оплата с 17 ноября, своя цена 400 000");
  // a price equal to the group's is no own price: the reason goes away
  await p.click('[data-testid="enrol-terms-toggle"]');
  await p.fill("#add-student-price-amount", "450000");
  assert.equal(await p.getByLabel(/Почему своя цена/).count(), 0);
  assert.equal(await text(p, '[data-testid="enrol-terms-line"]'), "Оплата с 17 ноября, по цене группы");
  // «По умолчанию 19.11» brings the day back
  await p.click('[data-testid="pay-from-reset"]'); await p.waitForTimeout(500);
  assert.equal(await p.getByLabel("Оплата с").inputValue(), "19.11.2026");
  assert.equal(await text(p, '[data-testid="enrol-terms-line"]'), "Оплата с 19 ноября, по цене группы");
  assert.equal(await p.locator('[data-testid="pay-from-reset"]').count(), 0, "the default needs no way back");
  noErrors(run);
  await p.close();
});

test("frame 3: an own price without a reason is refused at the field: the alert says so, the conditions are open, nothing is written", async () => {
  const run = await FRAMES[2](ctx);
  const p = run.page;
  await p.click('[data-testid="enrol-terms-toggle"]');
  await p.fill("#add-student-price-amount", "400000"); await p.waitForTimeout(400);
  assert.equal(await p.locator("#add-student-price-reason").count(), 1, "the reason appears with the price");
  await p.click('[data-testid="enrol-terms-toggle"]');           // folded: the refusal must open it again
  await p.click('[data-testid="enrol-submit"]'); await p.waitForTimeout(200);
  assert.match(await text(p, '[role="alert"]'), /причин/i);
  assert.equal(await p.locator('[data-testid="enrol-terms-edit"]').count(), 1, "the refusal opens the conditions");
  assert.equal(writes(run.calls).length, 0, "nothing is written");
  await p.fill("#add-student-price-reason", "Скидка: брат и сёстры"); await p.waitForTimeout(500); await H.settled(p);
  await p.click('[data-testid="enrol-submit"]'); await closed(p);
  const written = writes(run.calls);
  assert.equal(written.length, 1); assert.deepEqual(written[0].body.price_override, { amount: 400000, reason: "Скидка: брат и сёстры" });
  await p.close();
});

test("frame 4: written - ONE write, the window closes by itself, the message says who and where and what is to be paid, and it stays long enough to read", async () => {
  const run = await FRAMES[4](ctx);
  const p = run.page;
  assert.equal(await p.locator('[role="dialog"]').count(), 0, "the window is closed");
  assert.equal(writes(run.calls).length, 1, "one write");
  assert.deepEqual(writes(run.calls)[0].body.student_ids, ["st1", "st2", "st3"]);
  assert.equal(await text(p, '[role="status"]'), plain("Трое зачислены в «М11 БС» К оплате 564 000 сум — на странице «Оплаты»"));
  const lifetime = require(path.join(__dirname, "..", "src", "lib", "toast-timing.ts"));
  assert.ok(lifetime.toastLifetimeMs("success", true) >= 6000, "a message with details is on the screen at least 6 s");
  noErrors(run);
  await p.close();
});

test("frame 5: a student of another group - the choice «Перевести сюда / Оставить в обеих» sits in HIS row, the server's line about the money stays; the choice changes the request", async () => {
  const run = await FRAMES[5](ctx);
  const p = run.page;
  assert.match(await text(p, '[data-testid="enrol-transfer-choice"]'), /^Саид Назаров сейчас в «Алгебра 7»/);
  const group = p.getByRole("radiogroup", { name: /^Саид Назаров сейчас в «Алгебра 7»$/ });
  assert.equal(await group.count(), 1, "a labelled group of two choices");
  const here = group.getByRole("radio", { name: "Перевести сюда" }); const both = group.getByRole("radio", { name: "Оставить в обеих" });
  assert.equal(await here.getAttribute("aria-checked"), "true"); assert.equal(await both.getAttribute("aria-checked"), "false");
  assert.match(await text(p, '[data-testid="transfer-preview"]'), /Из «Алгебра 7» перейдёт 555 000 сум: 188 000 — за ноябрь здесь, 367 000 — аванс/);
  // plain muted words in his row: no grey frame, no title «Что изменится»
  const words = p.locator('[data-testid="enrol-transfer-choice"] [data-testid="transfer-preview"]');
  assert.equal(await words.count(), 1, "the server's line stands in the row of the student, under the choice");
  assert.equal(await p.locator('[data-testid="transfer-preview"] h3, [role="dialog"] >> text="Что изменится"').count(), 0, "no title");
  assert.deepEqual(await words.evaluate((el) => { const css = getComputedStyle(el); return { border: css.borderTopWidth, background: css.backgroundColor }; }), { border: "0px", background: "rgba(0, 0, 0, 0)" }, "no frame");
  const order = await p.evaluate(() => { const row = document.querySelector('[data-testid="enrol-transfer-choice"]'); return row.querySelector('[data-testid="enrol-mode"]').getBoundingClientRect().bottom <= row.querySelector('[data-testid="transfer-preview"]').getBoundingClientRect().top; });
  assert.equal(order, true, "the words are under the switch");
  assert.equal(plain(await buttonOf(p).innerText()), "Зачислить двоих");
  // the keyboard: an arrow moves and chooses
  await here.focus(); await p.keyboard.press("ArrowRight"); await p.waitForTimeout(500); await H.settled(p);
  assert.equal(await both.getAttribute("aria-checked"), "true");
  assert.equal(await p.locator('[data-testid="transfer-preview"]').count(), 0, "nobody moves: no «что изменится»");
  assert.equal(await barSum(p), "376 000 сум", "both come new: the sums are counted");
  // and back; then the write goes in the mode the person chose, with the source of the move
  await here.click(); await p.waitForSelector('[data-testid="transfer-preview"][data-state="ready"]');
  await p.click('[data-testid="enrol-submit"]'); await closed(p);
  const written = writes(run.calls);
  assert.equal(written.length, 1); assert.match(written[0].query, /mode=transfer/); assert.deepEqual(written[0].body.sources, { st4: "g7" });
  await p.close();
});

test("frame 5: only the moved student chosen - the title and the button say «Перевести»; a role that may not move money has no choice, only the words about the second group", async () => {
  const run = await H.openDrawer(ctx, H.server({}), { props: { groupName: "М11 БС" } });
  await H.search(run.page, "Назаров"); await H.pick(run.page, "Назаров");
  await run.page.waitForSelector('[data-testid="transfer-preview"][data-state="ready"]');
  assert.equal(await run.page.getByRole("dialog", { name: "Перевести в «М11 БС»" }).count(), 1);
  assert.equal(plain(await buttonOf(run.page).innerText()), "Перевести");
  await run.page.close();
  const admin = await H.openDrawer(ctx, H.server({}), { user: { role: "admin", org_role: "admin", payments_access: false }, props: { groupName: "М11 БС", money: false } });
  await H.search(admin.page, "Назаров"); await H.pick(admin.page, "Назаров"); await admin.page.waitForTimeout(500);
  assert.equal(await admin.page.getByRole("radiogroup").count(), 0, "no choice without the right to money");
  assert.match(await text(admin.page, '[data-testid="enrol-second-group"]'), /Саид Назаров уже в группе Алгебра 7/);
  assert.equal(plain(await buttonOf(admin.page).innerText()), "Зачислить");
  await admin.page.close();
});

test("frame 6: a debt of the last time, «записывается заново», «вернётся как был» - one row each with the NAME of the student, the words of the server as they are; the link «Выписка» for the debt", async () => {
  for (const width of [1280, 375]) {
    const run = await FRAMES[6](ctx, { width });
    const p = run.page;
    const rows = p.locator('[data-testid="enrol-exceptions"] > [data-row-tone]');
    assert.equal(await rows.count(), 3);
    assert.equal(await rows.nth(0).getAttribute("data-row-tone"), "warn");
    assert.match(plain(await rows.nth(0).innerText()), /^Лола Юсупова — Долг с прошлого раза 15 000 сум · в этой же группе, ушёл 19\.11 Выписка$/);
    const link = rows.nth(0).getByRole("link", { name: "Выписка" });
    assert.match(await link.getAttribute("href"), /\/owner\/payments\/statement\/m-same$/);
    assert.equal(plain(await rows.nth(1).innerText()), plain(`Тимур Рашидов — записывается заново ${H.REWRITE}`));
    assert.equal(plain(await rows.nth(2).innerText()), plain(`Мадина Турсунова — ${H.UNDO}`));
    assert.equal(await p.locator('[data-testid="enrol-exceptions"]').getByText("Анвар Каримов").count(), 0, "a student with nothing special has no row");
    assert.equal(await barSum(p), "564 000 сум");
    assert.equal(await barLine(p), "троим по 188 000 · 5 уроков из 12 в ноябре");
    assert.equal(plain(await buttonOf(p).innerText()), "Зачислить четверых");
    assert.equal(await hints(p), 0, "no «?»");
    noErrors(run);
    await p.close();
  }
});

test("frame 6: a common price entered does not apply to the one who comes back as he was - his row says so", async () => {
  const run = await FRAMES[6](ctx);
  const p = run.page;
  assert.equal(await p.locator('[data-testid="enrol-note-shared"]').count(), 0, "no common price - no remark");
  await p.click('[data-testid="enrol-terms-toggle"]');
  await p.fill("#add-student-price-amount", "400000"); await p.fill("#add-student-price-reason", "Скидка"); await p.waitForTimeout(600);
  assert.match(await text(p, '[data-testid="enrol-note-shared"]'), /Общие цена и дата на него не действуют/);
  await p.close();
});

test("frame 7: the sums differ - the bar says the periods in one short line and «По ученикам» opens each student's sum; the date chosen by the person is said", async () => {
  const run = await FRAMES[7](ctx);
  const p = run.page;
  assert.equal(await text(p, '[data-testid="enrol-terms-line"]'), "Оплата с 27 октября, по цене группы");
  assert.equal(await text(p, '[data-testid="enrol-terms-why"]'), "дату выбрали вы");
  assert.equal(await barSum(p), "1 128 000 сум");
  assert.match(await barLine(p), /^за октябрь и ноябрь Свернуть$/);
  assert.equal(await p.locator('[data-testid="enrol-by-student-toggle"]').getAttribute("aria-expanded"), "true");
  // the list opens ABOVE the bar, in the zone of the special rows: the bar itself keeps its height (the sum, the button, one line)
  assert.equal(await p.locator('[data-testid="summary-bar"] [data-testid="enrol-by-student"]').count(), 0, "not inside the bar");
  const places = await p.evaluate(() => { const list = document.querySelector('[data-testid="enrol-by-student-box"]').getBoundingClientRect(); const bar = document.querySelector('[data-testid="summary-bar"]').getBoundingClientRect(); const terms = document.querySelector('[data-testid="enrol-terms"]').getBoundingClientRect(); return { aboveBar: list.bottom <= bar.top + 1, belowTerms: list.top >= terms.bottom - 1, barHeight: Math.round(bar.height) }; });
  assert.equal(places.aboveBar && places.belowTerms, true, "the list is between the conditions and the bar");
  await p.click('[data-testid="enrol-by-student-toggle"]');
  assert.equal(await p.locator('[data-testid="summary-bar"]').evaluate((el) => Math.round(el.getBoundingClientRect().height)), places.barHeight, "the bar has the same height closed and open");
  await p.click('[data-testid="enrol-by-student-toggle"]');
  const rows = await p.locator('[data-testid="enrol-by-student-row"]').allInnerTexts();
  assert.deepEqual(rows.map(plain), ["Анвар Каримов Октябрь, с 27.10 · 2 урока из 9 89 000 сум Ноябрь, весь месяц 400 000 сум 489 000 сум", "Лола Юсупова Октябрь, с 27.10 · 2 урока из 9 89 000 сум Ноябрь, весь месяц 400 000 сум 489 000 сум", "Тимур Рашидов 150 000 сум"]);
  await p.click('[data-testid="enrol-by-student-toggle"]');
  assert.equal(await p.locator('[data-testid="enrol-by-student"]').count(), 0);
  assert.equal(plain(await p.locator('[data-testid="enrol-by-student-toggle"]').innerText()), "По ученикам");
  noErrors(run);
  await p.close();
});

test("frame 8: many chosen - the labels never take more than two lines, the rest hides behind «ещё N» that opens them all; the button says the number", async () => {
  for (const width of [1280, 375]) {
    const run = await FRAMES[8](ctx, { width });
    const p = run.page;
    const rowsOf = () => p.evaluate(() => new Set([...document.querySelector('[data-testid="picked-chips"]').children].map((child) => child.offsetTop)).size);
    assert.ok(await rowsOf() <= 2, `two lines at most at ${width}`);
    const more = p.locator('[data-testid="picked-chips-more"]');
    const shown = await p.locator('[data-testid="picked-chip"]').count();
    assert.equal(plain(await more.innerText()), `ещё ${8 - shown}`);
    assert.equal(plain(await buttonOf(p).innerText()), "Зачислить 8");
    assert.equal(await barSum(p), "1 504 000 сум");
    assert.equal(await more.getAttribute("aria-expanded"), "false");
    await more.click();
    assert.equal(await p.locator('[data-testid="picked-chip"]').count(), 8);
    assert.equal(plain(await p.locator('[data-testid="picked-chips-less"]').innerText()), "Свернуть");
    await p.click('[data-testid="picked-chips-less"]');
    assert.ok(await rowsOf() <= 2);
    // removing one through the cross keeps the rest
    await p.getByRole("button", { name: "Убрать: Анвар Каримов" }).click(); await H.settled(p);
    assert.equal(plain(await buttonOf(p).innerText()), "Зачислить 7");
    noErrors(run);
    await p.close();
  }
});

test("frame 9: counting - the old sum fades, the button is off, the bar keeps its height; then the new sum", async () => {
  const run = await FRAMES[9](ctx);
  const p = run.page;
  const sum = p.locator('[data-testid="summary-bar-sum"]');
  assert.match(await sum.getAttribute("class"), /opacity-50/);
  assert.equal(await text(p, '[data-testid="summary-bar-sum"]'), "376 000 сум", "the previous sum stays, faded");
  assert.equal(await barLine(p), "считаем…");
  assert.equal(await buttonOf(p).isDisabled(), true);
  assert.equal(await p.locator('[data-testid="summary-bar"]').getAttribute("aria-busy"), "true");
  const during = await p.locator('[data-testid="summary-bar"]').evaluate((el) => el.getBoundingClientRect().height);
  await p.waitForFunction(() => !document.querySelector('[data-testid="enrol-submit"]').disabled, null, { timeout: 8000 });
  assert.equal(await barSum(p), "450 000 сум", "6 lessons of 12 from the 17th for two: 225 000 each");
  assert.equal(await sum.evaluate((el) => /opacity-50/.test(el.className)), false);
  const after = await p.locator('[data-testid="summary-bar"]').evaluate((el) => el.getBoundingClientRect().height);
  assert.equal(after, during, "the height of the bar does not jump");
  await p.close();
});

test("frame 10: the group has no price - the server's line and «Задать цену», the sum does not appear, writing is possible", async () => {
  const run = await FRAMES[10](ctx);
  const p = run.page;
  assert.equal(await text(p, '[data-testid="enrol-group-line"]'), "Расписание не задано · цена не задана");
  assert.match(await text(p, '[data-testid="enrol-note-price"]'), /Пока цена не задана, сумма оплаты не подсказывается, а зарплата по ученикам группы не считается/);
  assert.match(await p.getByRole("link", { name: "Задать цену" }).getAttribute("href"), /\/owner\/payments\/prices\?group=g2$/);
  assert.equal(await text(p, '[data-testid="summary-bar-idle"]'), "Сумма появится, когда у группы будет цена");
  assert.equal(await p.locator('[data-testid="summary-bar-sum"]').count(), 0);
  assert.equal(plain(await buttonOf(p).innerText()), "Зачислить"); assert.equal(await buttonOf(p).isEnabled(), true);
  await p.click('[data-testid="enrol-submit"]'); await closed(p);
  assert.equal(writes(run.calls).length, 1);
  await p.close();
});

test("frame 11: a role without the right to money - no sum, no price, no «Оплата с», no «Выписка»; the bar is the button alone", async () => {
  const run = await FRAMES[11](ctx);
  const p = run.page;
  assert.equal(await text(p, '[data-testid="enrol-group-line"]'), "Вт · Чт · Сб · 16:00–17:00");
  assert.equal(await p.locator('[data-testid="enrol-terms"]').count(), 0, "no conditions");
  assert.equal(await p.locator('[data-testid="summary-bar-sum"], [data-testid="summary-bar-idle"], [data-testid="summary-bar-line"]').count(), 0);
  assert.equal(await p.getByRole("link", { name: "Выписка" }).count(), 0);
  assert.equal(await p.getByRole("dialog").innerText().then((t) => /сум/.test(t)), false, "not a sum on the screen");
  assert.match(plain(await p.locator('[data-testid="enrol-note-past"]').innerText()), /^Лола Юсупова — Долг с прошлого раза · в этой же группе, ушёл 19\.11$/);
  assert.equal(plain(await buttonOf(p).innerText()), "Зачислить двоих");
  assert.ok(run.calls.every((c) => !/pay_from|price_override/.test(JSON.stringify(c.body ?? {}))), "nothing about money is asked");
  await p.click('[data-testid="enrol-submit"]'); await closed(p);
  assert.equal(writes(run.calls).length, 1);
  assert.equal(await text(p, '[role="status"]'), "Двое зачислены в «М11 БС»", "no line about a sum");
  await p.close();
});

test("frame 12: not all written - the window stays with the result per student and the reason of the server; the sum is of those who got in; «Готово» hands over and closes", async () => {
  const run = await FRAMES[12](ctx);
  const p = run.page;
  assert.equal(await p.getByRole("dialog", { name: "Записано 2 из 3" }).count(), 1);
  assert.deepEqual((await p.locator('[data-testid="bulk-outcome"] li').allInnerTexts()).map(plain), ["Анвар Каримов", "Лола Юсупова", "Тимур Рашидов В группе нет мест: 30 из 30. Увеличьте число мест или выберите другую группу"]);
  assert.equal(await p.locator('[data-testid="bulk-outcome-added"]').count(), 2); assert.equal(await p.locator('[data-testid="bulk-outcome-skipped"]').count(), 1);
  assert.equal(await text(p, '[data-testid="summary-bar"] p'), "К оплате");
  assert.equal(await barSum(p), "376 000 сум"); assert.equal(await barLine(p), "по 188 000 · 5 уроков из 12 в ноябре");
  assert.deepEqual(await p.locator('[data-testid="summary-bar"] button').allInnerTexts(), ["Готово"]);
  assert.equal(writes(run.calls).length, 1, "one write");
  await p.click('[data-testid="enrol-done"]'); await closed(p);
  assert.match((await p.evaluate(() => window.__log)).join("|"), /added:/);
  assert.equal(await text(p, '[role="status"], [role="alert"]') !== "", true, "the page shows its message");
  noErrors(run);
  await p.close();
});

test("frame 13: phone - one column, ONE scrolling area, the bar and the button pinned to the bottom across the whole width, nothing wide", async () => {
  const run = await FRAMES[13](ctx);
  const p = run.page;
  const geometry = await p.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const scrollers = [...dialog.querySelectorAll("*")].filter((el) => el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY));
    const bar = document.querySelector('[data-testid="summary-bar"]').getBoundingClientRect();
    const button = document.querySelector('[data-testid="enrol-submit"]').getBoundingClientRect();
    return { scrollers: scrollers.length, barBottom: bar.bottom, vh: window.innerHeight, barW: bar.width, buttonW: button.width, wide: document.documentElement.scrollWidth > window.innerWidth + 1, buttonH: button.height };
  });
  assert.ok(geometry.scrollers <= 1, `one scrolling area, found ${geometry.scrollers}`);
  assert.ok(Math.abs(geometry.barBottom - geometry.vh) <= 1, "the bar is pinned to the bottom");
  assert.ok(geometry.buttonW >= geometry.barW - 40, "the button takes the width");
  assert.ok(geometry.buttonH >= 44, "a finger-sized button");
  assert.equal(geometry.wide, false);
  assert.equal(await barLine(p), "5 уроков из 12 в ноябре");
  noErrors(run);
  await p.close();
});

test("frame 14: phone with the conditions open - the fields stand one under another, the list of students is folded up to the labels; the bar stays at the bottom", async () => {
  const run = await FRAMES[14](ctx);
  const p = run.page;
  const boxes = await p.evaluate(() => ["#add-student-pay-from", "#add-student-price-amount"].map((id) => { const r = document.querySelector(id).getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) }; }));
  assert.equal(boxes[0].x, boxes[1].x, "one column"); assert.ok(boxes[1].y > boxes[0].y, "the second field is below the first");
  assert.ok(boxes[0].w > 300, "a field takes the width of the phone");
  assert.equal(await p.locator('[data-student-row]:visible').count(), 0, "the list is folded up");
  assert.equal(await p.locator('[data-testid="picked-chip"]').count(), 2);
  assert.equal(await barSum(p), "450 000 сум"); assert.equal(await barLine(p), "по 225 000 · 6 уроков из 12 в ноябре");
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  await p.click('[data-testid="enrol-terms-toggle"]'); await p.waitForTimeout(200);
  assert.ok(await p.locator('[data-student-row]:visible').count() > 0, "folding the conditions brings the list back");
  noErrors(run);
  await p.close();
});

test("frame 15: from the card of the student - the same device with the groups instead of students: radios, one line of what the choice is made by, the fill; the sum and the button name the group", async () => {
  for (const width of [1280, 375]) {
    const run = await FRAMES[15](ctx, { width });
    const p = run.page;
    assert.equal(await p.getByRole("dialog", { name: "Зачислить: Анвар Каримов" }).count(), 1);
    assert.equal(await text(p, '[data-testid="assign-current-group"]'), "7 класс · уже занимается в «Алгебра 7»");
    assert.equal(await p.getByLabel("Группа или преподаватель").count(), 1);
    const radios = p.getByRole("radiogroup", { name: "Группа" }).getByRole("radio");
    assert.deepEqual(await radios.evaluateAll((list) => list.map((el) => [el.getAttribute("aria-label"), el.checked])), [["Физика 7", true], ["Геометрия 7", false], ["Английский 6", false]], "the current group is not offered");
    const cards = p.locator('[data-testid="assign-group-card"]');
    assert.equal(plain(await cards.nth(0).innerText()), "Физика 7 Пн · Ср · Пт · 16:00–17:00 · Лола Мирзаева · 600 000 сум/мес 12 из 30");
    assert.match(plain(await cards.nth(2).innerText()), /^Английский 6 расписание не задано · другой класс 0 из 30$/);
    assert.equal(await cards.nth(0).getAttribute("data-selected"), "yes");
    assert.match(plain(await p.locator('[data-testid="enrol-note-past"]').innerText()), /^Долг с прошлого раза 38 000 сум · в этой же группе, ушёл 17\.11 Выписка$/);
    assert.equal(await text(p, '[data-testid="enrol-terms-line"]'), "Оплата с 20 ноября, по цене группы");
    assert.equal(await barSum(p), "231 000 сум"); assert.equal(await barLine(p), "5 уроков из 13 в ноябре");
    assert.equal(plain(await buttonOf(p, "assign-submit").innerText()), "Зачислить в «Физика 7»");
    assert.equal(await hints(p), 0);
    noErrors(run);
    await p.close();
  }
});

test("frame 15: the keyboard moves the choice between the groups; the write is ONE request to the chosen group; the window closes and the page says who was enrolled where", async () => {
  const run = await FRAMES[15](ctx);
  const p = run.page;
  await p.getByRole("radio", { name: "Физика 7" }).focus();
  await p.keyboard.press("ArrowDown"); await p.waitForTimeout(500);
  assert.equal(await p.getByRole("radio", { name: "Геометрия 7" }).isChecked(), true);
  assert.equal(await text(p, '[data-testid="assign-submit"]'), "Зачислить в «Геометрия 7»");
  assert.equal(await p.locator('[data-testid="enrol-note-past"]').count(), 0, "the debt was in another group");
  await p.getByRole("radio", { name: "Физика 7" }).check(); await p.waitForTimeout(500);
  await p.waitForFunction(() => !document.querySelector('[data-testid="assign-submit"]').disabled);
  await p.click('[data-testid="assign-submit"]'); await closed(p);
  const written = writes(run.calls);
  assert.equal(written.length, 1); assert.match(written[0].path, /\/groups\/gt\/students\/st1$/);
  assert.equal(await text(p, '[role="status"]'), "Анвар Каримов зачислен в «Физика 7» В «Алгебра 7» тоже остаётся");
  await p.close();
});

test("the card window of a transfer: the title and the button say «Перевести», the server's words about what moves stay, no sum is invented", async () => {
  const run = await require("./helpers/enrol-v2.cjs").openPage(ctx.browser, "enrol-v2.entry.tsx", H.server({ groups: [{ id: "g7", name: "Алгебра 7", class_level: 7, status: "active", price_current: { amount: 400000, valid_from: "2026-09-01" }, schedule: [] }, { id: "g2", name: "М11 БС", class_level: 7, status: "active", teacher_name: "Лола Мирзаева", price_current: { amount: 450000, valid_from: "2026-09-01" }, schedule: [H.SLOT(2)], student_count: 5, max_students: 30 }] }), { width: 1280, height: 900 });
  await run.page.evaluate(([u, p]) => window.mount("card", u, p), [H.OWNER, { mode: "transfer", currentGroupId: "g7", currentGroupName: "Алгебра 7", sourceGroups: [{ id: "g7", name: "Алгебра 7" }] }]);
  await run.page.waitForSelector('[data-testid="assign-group-card"]');
  assert.equal(await run.page.getByRole("dialog", { name: "Перевести: Анвар Каримов" }).count(), 1);
  assert.equal(await text(run.page, '[data-testid="summary-bar-idle"]'), "Выберите группу");
  assert.equal(await buttonOf(run.page, "assign-submit").isDisabled(), true);
  await run.page.getByRole("radio", { name: "М11 БС" }).check();
  await run.page.waitForSelector('[data-testid="transfer-preview"][data-state="ready"]');
  assert.equal(await text(run.page, '[data-testid="assign-submit"]'), "Перевести в «М11 БС»");
  assert.match(await text(run.page, '[data-testid="transfer-preview"]'), /перейдёт 555 000 сум/);
  assert.equal(await run.page.locator('[data-testid="summary-bar-sum"]').count(), 0, "the transfer says its money in the server's words, not in the bar");
  assert.equal(await run.page.locator("#assign-group-pay-from").count(), 0, "a transfer has no «Оплата с»");
  await run.page.close();
});

test("a11y: the search has the focus on opening, Esc closes the window, the boxes and the crosses have names, the labelled checkbox is native", async () => {
  const run = await FRAMES[2](ctx);
  const p = run.page;
  const first = p.getByRole("checkbox", { name: "Дильноза Ахмедова" });
  assert.equal(await first.count(), 1); assert.equal(await first.isChecked(), false);
  await first.click(); await p.waitForTimeout(100);
  assert.equal(await p.locator('[data-testid="picked-chip"]').count(), 4);
  await p.keyboard.press("Escape");
  await closed(p);
  assert.match((await p.evaluate(() => window.__log)).join("|"), /close/);
  await p.close();
  const fresh = await FRAMES[1](ctx);
  assert.equal(await fresh.page.evaluate(() => document.activeElement && document.activeElement.getAttribute("aria-label")), "Поиск по имени или ID", "the search takes the focus");
  await fresh.page.close();
});

const { layoutProbe, touchTargets } = require("./helpers/layout-probe.cjs");
test("layout: in every frame, with ordinary and with the longest names, at 1280 and 375, nothing leaves its box, the page does not scroll sideways, every tap target is 40 px on a phone", async () => {
  const failures = [];
  for (const long of [false, true]) {
    for (const n of Object.keys(FRAMES).map(Number)) {
      if (n === 4) continue;                                   // the window is closed: only the message
      for (const width of n === 13 || n === 14 ? [375] : [1280, 375]) {
        const run = await FRAMES[n](ctx, { width, long });
        await run.page.waitForTimeout(700);                    // the window slides in
        const facts = await run.page.evaluate(layoutProbe, '[role="dialog"]');
        const small = width === 375 ? await run.page.evaluate(touchTargets, '[role="dialog"]') : [];
        if (facts.bad.length || facts.scroll > 0 || small.length) failures.push(`frame ${n} ${width}${long ? " long" : ""}: ${JSON.stringify([...facts.bad, ...small]).slice(0, 220)}`);
        await run.page.close();
      }
    }
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});

test("the window of a group page: the list of students takes the free height and scrolls inside - with 0, 1, 3 and 8 chosen there is no empty area above the bar (1280x900)", async () => {
  // the empty area = from the lowest thing the window shows (the conditions, the special rows, the details of the sum, or the last visible row of the list) to the top of the bar
  const gap = (page) => page.evaluate(() => {
    const footTop = document.querySelector('[data-modal-part="footer"]').getBoundingClientRect().top;
    const list = document.querySelector('[data-testid="enrol-list"]');
    const bottoms = ['[data-testid="enrol-terms"]', '[data-testid="enrol-exceptions"]', '[data-testid="enrol-by-student-box"]'].map((sel) => document.querySelector(sel)?.getBoundingClientRect().bottom ?? 0);
    if (list) {
      const rows = [...list.querySelectorAll("li")].filter((li) => li.offsetParent !== null);
      bottoms.push(Math.min(list.getBoundingClientRect().bottom, rows.length ? rows[rows.length - 1].getBoundingClientRect().bottom : 0));
    }
    return { gap: Math.round(footTop - Math.max(...bottoms)), scrolls: list ? list.scrollHeight > list.clientHeight + 1 : null, bodyScrolls: (() => { const b = document.querySelector('[data-modal-part="body"]'); return b.scrollHeight > b.clientHeight + 1; })() };
  });
  const cases = { 0: (ctx0) => FRAMES[1](ctx0, { width: 1280 }), 1: async (ctx0) => { const r = await FRAMES[1](ctx0, { width: 1280 }); await H.pick(r.page, "Каримов"); await H.settled(r.page); return r; }, 3: (ctx0) => FRAMES[2](ctx0, { width: 1280 }), 8: (ctx0) => FRAMES[8](ctx0, { width: 1280 }) };
  for (const [count, open] of Object.entries(cases)) {
    const run = await open(ctx);
    // the labels fold to two lines («ещё N») when there are many, so the count is read from the button
    const want = { 0: "Зачислить", 1: "Зачислить", 3: "Зачислить троих", 8: "Зачислить 8" }[count];
    assert.equal(plain(await run.page.locator('[data-testid="enrol-submit"]').innerText()), want, `${count} chosen`);
    const measured = await gap(run.page);
    assert.ok(measured.gap <= 24, `${count} chosen: the empty area above the bar is ${measured.gap}px, must be at most 24`);
    assert.equal(measured.scrolls, true, `${count} chosen: the list is longer than its place and scrolls inside`);
    assert.equal(measured.bodyScrolls, false, `${count} chosen: the window itself does not scroll`);
    await run.page.close();
  }
  // the conditions open on a wide window (frames 3 and 9): the list stays and scrolls above the fields, no empty area either
  for (const frame of [3, 9]) {
    const run = await FRAMES[frame](ctx, { width: 1280 });
    const measured = await gap(run.page);
    assert.ok(measured.gap <= 24, `frame ${frame}: the empty area above the bar is ${measured.gap}px`);
    assert.equal(measured.scrolls, true, `frame ${frame}: the list stays and scrolls`);
    await run.page.close();
  }
});

test("frame 5 with two students from other groups: ONE switch over the rows, a row per student with HIS server line under it (not «Уже в другой группе: N»)", async () => {
  const people = H.PEOPLE.map((one) => (one.id === "st5" ? H.STUDENT("st5", "Дильноза", "Ахмедова", H.IN_ALGEBRA) : one));
  const carried = [
    { code: "payment_carried_over", student_id: "st4", message: "Из «Алгебра 7» перейдёт 555 000 сум" },
    { code: "payment_carried_over", student_id: "st5", message: "Из «Алгебра 7» перейдёт 120 000 сум" },
  ];
  const run = await H.openDrawer(ctx, H.server({ people, transferCarried: carried }), { props: { groupName: "М11 БС" } });
  const p = run.page;
  await H.search(p, "Назаров"); await H.pick(p, "Назаров");
  await H.search(p, "Ахмедова"); await H.pick(p, "Ахмедова");
  await p.waitForSelector('[data-testid="transfer-preview"][data-state="ready"]');
  assert.equal(await p.getByRole("radiogroup", { name: "Ученики из других групп" }).count(), 1, "one switch for everybody, named for them");
  assert.equal(await p.locator('[data-testid="enrol-mode"]').count(), 1);
  assert.equal(await p.getByText(/Уже в другой группе: \d/).count(), 0);
  const rows = await p.locator('[data-testid="enrol-transfer-student"]').allInnerTexts();
  assert.deepEqual(rows.map(plain), ["Саид Назаров сейчас в «Алгебра 7» Из «Алгебра 7» перейдёт 555 000 сум", "Дильноза Ахмедова сейчас в «Алгебра 7» Из «Алгебра 7» перейдёт 120 000 сум"]);
  assert.equal(await p.getByText("Что изменится").count(), 0, "no frame, no title");
  // the switch is above the rows
  assert.equal(await p.evaluate(() => document.querySelector('[data-testid="enrol-mode"]').getBoundingClientRect().bottom <= document.querySelector('[data-testid="enrol-transfer-student"]').getBoundingClientRect().top), true);
  await p.close();
});
