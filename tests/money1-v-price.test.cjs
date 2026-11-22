// «Деньги-1 / В», the windows of the price: the question of an unusual price (the server's words, «Да, цена верная» before «Сохранить», confirm_unusual in the write), the correction of a typo
// backdated (the switch, the reason 3..200, correction + correction_reason), and NO salary of the teachers in the window (decision of the lead 10.11).
const assert = require("node:assert/strict");
const test = require("node:test");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const { start, plain, conflict, open } = require("./helpers/money1-v.cjs");

let browser;
test.before(async () => { browser = await start(); });
test.after(async () => { await browser.close(); });

const NB = " ";
const impact = (extra = {}) => ({ students_following: 3, students_with_override: 0, stale_payroll_sheets: 0, stale_sheets: [], money: null, warnings: [], correction: null, ...extra });
const unusual = { code: "price_unusual", text: `Вы уверены: 3${NB}000${NB}000${NB}сум? Сейчас 300${NB}000${NB}сум` };
const saved = { json: { dry_run: false, current: null, history: [], impact: impact() } };

function groupServer({ dry = () => ({ json: { dry_run: true, impact: impact({ warnings: [unusual] }) } }), write = () => saved } = {}) {
  return (request) => {
    if (request.method === "PUT" && request.path === "/auth/org/groups/g1/price") return /dry_run/.test(request.query) ? dry(request) : write(request);
    return null;
  };
}
async function group(width, server, props) {
  const run = await open(browser, "money-v.entry.tsx", "groupPrice", { width, server, props });
  await run.page.waitForSelector("#group-price-amount");
  return run;
}

test("unusual price: the server's question and «Да, цена верная»; «Сохранить цену» is off until it is ticked; the write carries confirm_unusual", async () => {
  const { page, calls } = await group(1280, groupServer());
  await page.fill("#group-price-amount", "3 000 000");
  const notice = page.locator('[data-testid="price-unusual"]');
  await notice.waitFor();
  assert.match(plain(await notice.textContent()), /Вы уверены: 3 000 000 сум\? Сейчас 300 000 сум/);
  assert.ok((await notice.textContent()).includes(`3${NB}000${NB}000${NB}сум`));
  const save = page.locator('button[form="group-price-form"]');
  assert.equal(plain(await save.textContent()), "Сохранить цену 3 000 000 сум");
  assert.equal(await save.isDisabled(), true);
  await page.check('[data-testid="price-unusual-ok"]');
  assert.equal(await save.isDisabled(), false);
  await save.click();
  await page.waitForFunction(() => window.__log.includes("close"));
  const write = calls.find((call) => call.method === "PUT" && !/dry_run/.test(call.query));
  assert.equal(write.body.confirm_unusual, true);
  assert.equal(write.body.amount, 3000000);
  // the salary of the teachers is NOT in the window
  assert.equal(await page.locator("text=/Зарплата/").count(), 0);
  await page.close();
});

test("a usual price asks nothing and carries no confirm_unusual; changing the sum drops the tick", async () => {
  let unusualNow = true;
  const { page, calls } = await group(1280, groupServer({ dry: () => ({ json: { dry_run: true, impact: impact({ warnings: unusualNow ? [unusual] : [] }) } }) }));
  await page.fill("#group-price-amount", "3 000 000");
  await page.waitForSelector('[data-testid="price-unusual"]');
  await page.check('[data-testid="price-unusual-ok"]');
  unusualNow = false;
  await page.fill("#group-price-amount", "320 000");
  await page.waitForFunction(() => !document.querySelector('[data-testid="price-unusual"]'));
  await page.click('button[form="group-price-form"]');
  await page.waitForFunction(() => window.__log.includes("close"));
  const write = calls.find((call) => call.method === "PUT" && !/dry_run/.test(call.query));
  assert.equal("confirm_unusual" in write.body, false);
  await page.close();
});

test("409 PRICE_UNUSUAL on the write (a race) asks the same question and the window stays", async () => {
  let n = 0;
  const { page } = await group(1280, groupServer({ dry: () => ({ json: { dry_run: true, impact: impact() } }), write: () => (++n === 1 ? conflict("PRICE_UNUSUAL", unusual.text, { old: 300000, new: 3000000 }) : saved) }));
  await page.fill("#group-price-amount", "3 000 000");
  await page.waitForFunction(() => /Сохранить цену/.test(document.body.innerText) && !document.querySelector('button[form="group-price-form"]').disabled);
  await page.click('button[form="group-price-form"]');
  await page.waitForSelector('[data-testid="price-unusual"]');
  assert.deepEqual(await page.evaluate(() => window.__log), []);
  assert.equal(await page.locator('button[form="group-price-form"]').isDisabled(), true);
  await page.check('[data-testid="price-unusual-ok"]');
  await page.click('button[form="group-price-form"]');
  await page.waitForFunction(() => window.__log.includes("close"));
  await page.close();
});

const blockedBody = (extra = {}) => conflict("PRICE_BACKDATE_WITH_PAYMENTS", "Нельзя изменить цену задним числом: у учеников есть оплаты за этот период", { students: [{ membership_id: "m1", student_name: "Тошматов Бобур" }, { membership_id: "m2", student_name: "Каримова Дилноза" }], can_correct: true, ...extra });

test("a typo backdated: the blocked notice lists the students, «Исправляю опечатку в цене» asks the reason (3..200), the dry run and the write carry the correction", async () => {
  const { page, calls } = await group(1280, groupServer({
    dry: (request) => (request.body.correction ? { json: { dry_run: true, impact: impact({ correction: { students: 2, reason: null } }) } } : blockedBody()),
  }));
  await page.fill("#group-price-amount", "30 000");
  const blocked = page.locator('[data-testid="price-blocked"]');
  await blocked.waitFor();
  assert.match(plain(await blocked.textContent()), /Нельзя изменить цену задним числом.*Тошматов Бобур, Каримова Дилноза/);
  await page.check('[data-testid="price-correction-on"]');
  await page.waitForSelector('[data-testid="correction-impact"]');
  assert.equal(plain(await page.textContent('[data-testid="correction-impact"]')), "Исправление затронет 2 учеников, у которых есть оплаты.");
  const save = page.locator('button[form="group-price-form"]');
  assert.equal(await save.isDisabled(), true, "no reason - off");
  await page.fill("#price-correction-reason", "ab");
  assert.equal(await save.isDisabled(), true);
  await page.fill("#price-correction-reason", "ошибся в нуле");
  assert.equal(await save.isDisabled(), false);
  assert.equal(await page.getAttribute("#price-correction-reason", "maxlength"), "200");
  await save.click();
  await page.waitForFunction(() => window.__log.includes("close"));
  const dry = calls.filter((call) => /dry_run/.test(call.query));
  assert.equal(dry.at(-1).body.correction, true);
  const write = calls.find((call) => call.method === "PUT" && !/dry_run/.test(call.query));
  assert.deepEqual([write.body.correction, write.body.correction_reason], [true, "ошибся в нуле"]);
  await page.close();
});

test("a blocked price with no can_correct has no switch", async () => {
  const { page } = await group(1280, groupServer({ dry: () => blockedBody({ can_correct: false }) }));
  await page.fill("#group-price-amount", "30 000");
  await page.waitForSelector('[data-testid="price-blocked"]');
  assert.equal(await page.locator('[data-testid="price-correction"]').count(), 0);
  await page.close();
});

for (const width of [1280, 375]) {
  test(`${width}: the question and the box fit the window, the box is a tap zone`, async () => {
    const { page } = await group(width, groupServer());
    await page.fill("#group-price-amount", "3 000 000");
    await page.waitForSelector('[data-testid="price-unusual"]');
    await page.waitForTimeout(500);
    const facts = await page.evaluate(layoutProbe, '[role="dialog"]');
    assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
    assert.equal(facts.scroll, 0);
    assert.ok((await page.locator('[data-testid="price-unusual"] label').evaluate((el) => el.getBoundingClientRect().height)) >= 40);
    await page.close();
  });
}

// ── the individual price ──────────────────────────────────────────────────────

function overrideServer({ dry, write }) {
  return (request) => {
    if (request.method === "PUT" && request.path === "/auth/org/memberships/m1/price-override") return /dry_run/.test(request.query) ? dry(request) : write(request);
    return null;
  };
}
async function override(server) {
  const run = await open(browser, "money-v.entry.tsx", "assignOverride", { server });
  await run.page.waitForSelector("#membership-price-amount");
  return run;
}

test("individual price: the same question and the box; the write carries confirm_unusual and the reason stays the one reason; a zero price is asked too", async () => {
  const { page, calls } = await override(overrideServer({
    dry: () => ({ json: { dry_run: true, impact: impact({ warnings: [{ code: "price_unusual", text: `Вы уверены: 0${NB}сум? Сейчас 300${NB}000${NB}сум` }] }), row: undefined } }),
    write: () => ({ json: { row: { membership_id: "m1", student_id: "st1", student_name: "Иванов", group_id: "g1", group_name: "7-А", is_primary: true, is_active: true, status: "ok", debt: 0 } } }),
  }));
  await page.fill("#membership-price-amount", "0");
  await page.fill("#membership-price-reason", "стипендия");
  await page.waitForSelector('[data-testid="price-unusual"]');
  assert.match(plain(await page.textContent('[data-testid="price-unusual"]')), /Вы уверены: 0 сум\? Сейчас 300 000 сум/);
  const save = page.locator('[data-testid="membership-price-save"]');
  assert.equal(await save.isDisabled(), true);
  await page.check('[data-testid="price-unusual-ok"]');
  await save.click();
  await page.waitForFunction(() => window.__log.includes("saved"));
  const write = calls.find((call) => call.method === "PUT" && !/dry_run/.test(call.query));
  assert.deepEqual([write.body.confirm_unusual, write.body.reason, write.body.amount], [true, "стипендия", 0]);
  await page.close();
});

test("individual price: a typo backdated - the switch (no second reason field), the write carries correction and the reason of the price as correction_reason", async () => {
  const { page, calls } = await override(overrideServer({
    dry: (request) => (request.body.correction ? { json: { dry_run: true, impact: impact({ correction: { students: 1, reason: "опечатка" } }) } } : blockedBody()),
    write: () => ({ json: { row: { membership_id: "m1", student_id: "st1", student_name: "Иванов", group_id: "g1", group_name: "7-А", is_primary: true, is_active: true, status: "ok", debt: 0 } } }),
  }));
  await page.fill("#membership-price-amount", "30 000");
  await page.fill("#membership-price-reason", "опечатка");
  await page.waitForSelector('[data-testid="price-blocked"]');
  assert.equal(await page.locator("#price-correction-reason").count(), 0);
  await page.check('[data-testid="price-correction-on"]');
  await page.waitForFunction(() => !document.querySelector('[data-testid="price-blocked"]'));
  await page.click('[data-testid="membership-price-save"]');
  await page.waitForFunction(() => window.__log.includes("saved"));
  const write = calls.find((call) => call.method === "PUT" && !/dry_run/.test(call.query));
  assert.deepEqual([write.body.correction, write.body.correction_reason], [true, "опечатка"]);
  await page.close();
});

// ── PAY-TAILS Б11.8 п. 9: the refusal of a «typo» that would turn a forgiven debt into an advance (409 PRICE_CORRECTION_FORGIVENESS) - the blocked notice of the existing path ───────────
const PEOPLE = [{ membership_id: "m1", student_name: "Тошматов Бобур" }, { membership_id: "m2", student_name: "Каримова Дилноза" }, { membership_id: "m3", student_name: "Юсупов Бек" }];
const forgiveness = (n) => conflict(
  "PRICE_CORRECTION_FORGIVENESS",
  `У ${n} ${n === 1 ? "ученика" : "учеников"} исправление превратит прощённый долг в переплату. Сначала отмените прощение долга, затем исправьте цену.`,
  { count: n, students: PEOPLE.slice(0, n) },
);
const PHRASE = (n) => `У ${n} ${n === 1 ? "ученика" : "учеников"} исправление превратит прощённый долг в переплату. Сначала отмените прощение долга, затем исправьте цену`;   // the window shows a title without the final dot, as the neighbour refusal does

for (const n of [1, 3]) {
  test(`group price, ${n} student(s): the dry run of the correction is refused - the notice has the phrase of the server and the names, the window stays, the typed values stay, nothing is written`, async () => {
    const { page, calls } = await group(1280, groupServer({ dry: (request) => (request.body.correction ? forgiveness(n) : blockedBody()) }));
    await page.fill("#group-price-amount", "30 000");
    await page.waitForSelector('[data-testid="price-blocked"]');
    await page.check('[data-testid="price-correction-on"]');
    await page.waitForFunction(() => /исправление превратит/.test(document.querySelector('[data-testid="price-blocked"]')?.textContent ?? ""));
    const text = plain(await page.textContent('[data-testid="price-blocked"]'));
    assert.ok(text.includes(PHRASE(n)), text);
    for (const student of PEOPLE.slice(0, n)) assert.ok(text.includes(student.student_name), text);
    assert.equal(await page.locator('[data-testid="price-correction-on"]').isVisible(), true, "the switch stays: the person can untick it");
    assert.equal(plain(await page.inputValue("#group-price-amount")), "30 000", "the typed sum is kept");
    assert.equal(await page.isChecked('[data-testid="price-correction-on"]'), true);
    assert.equal(await page.locator('button[form="group-price-form"]').isDisabled(), true, "a refused change cannot be saved");
    assert.deepEqual(await page.evaluate(() => window.__log), [], "the window did not close");
    assert.equal(await page.locator('[role="dialog"]').count(), 1);
    assert.equal(calls.filter((call) => call.method === "PUT" && !/dry_run/.test(call.query)).length, 0, "the price did not change: no write");
    assert.equal(await page.locator('[data-testid="price-blocked"]').getAttribute("role"), "alert");
    await page.close();
  });
}

test("group price: the write itself is refused (a race after a clean check) - the same notice, the window stays, the button works again, the price did not change", async () => {
  let writes = 0;
  const { page, calls } = await group(1280, groupServer({
    dry: (request) => (request.body.correction ? { json: { dry_run: true, impact: impact({ correction: { students: 2, reason: null } }) } } : blockedBody()),
    write: () => { writes += 1; return forgiveness(3); },
  }));
  await page.fill("#group-price-amount", "30 000");
  await page.waitForSelector('[data-testid="price-blocked"]');
  await page.check('[data-testid="price-correction-on"]');
  await page.waitForSelector('[data-testid="correction-impact"]');
  await page.fill("#price-correction-reason", "ошибся в нуле");
  const save = page.locator('button[form="group-price-form"]');
  await save.click();
  await page.waitForFunction(() => /исправление превратит/.test(document.querySelector('[data-testid="price-blocked"]')?.textContent ?? ""));
  const text = plain(await page.textContent('[data-testid="price-blocked"]'));
  assert.ok(text.includes(PHRASE(3)) && text.includes("Тошматов Бобур") && text.includes("Юсупов Бек"), text);
  assert.equal(writes, 1);
  assert.equal(plain(await page.inputValue("#group-price-amount")), "30 000");
  assert.equal(await page.inputValue("#price-correction-reason"), "ошибся в нуле", "the reason is kept");
  assert.deepEqual(await page.evaluate(() => window.__log), [], "the window did not close");
  await page.uncheck('[data-testid="price-correction-on"]');                                   // the way out: not a typo - the plain refusal of the backdated price again
  await page.waitForFunction(() => /задним числом/.test(document.querySelector('[data-testid="price-blocked"]')?.textContent ?? ""));
  assert.equal(await save.isDisabled(), true);
  assert.equal(await save.evaluate((el) => el.getAttribute("aria-busy")), null, "no busy state is left behind");
  assert.equal(calls.filter((call) => call.method === "PUT" && !/dry_run/.test(call.query)).length, 1);
  await page.close();
});

test("individual price: the dry run of the correction is refused - the same notice (phrase and names), the window and the values stay, nothing is written", async () => {
  const { page, calls } = await override(overrideServer({
    dry: (request) => (request.body.correction ? forgiveness(1) : blockedBody()),
    write: () => { throw new Error("must not be written"); },
  }));
  await page.fill("#membership-price-amount", "30 000");
  await page.fill("#membership-price-reason", "опечатка");
  await page.waitForSelector('[data-testid="price-blocked"]');
  await page.check('[data-testid="price-correction-on"]');
  await page.waitForFunction(() => /исправление превратит/.test(document.querySelector('[data-testid="price-blocked"]')?.textContent ?? ""));
  const text = plain(await page.textContent('[data-testid="price-blocked"]'));
  assert.ok(text.includes(PHRASE(1)) && text.includes("Тошматов Бобур"), text);
  assert.equal(plain(await page.inputValue("#membership-price-amount")), "30 000");
  assert.equal(await page.inputValue("#membership-price-reason"), "опечатка");
  assert.equal(await page.locator('[data-testid="membership-price-save"]').isDisabled(), false, "as with the neighbour refusal of this window: the button is not left off");
  assert.deepEqual(await page.evaluate(() => window.__log), []);
  assert.equal(calls.filter((call) => call.method === "PUT" && !/dry_run/.test(call.query)).length, 0);
  await page.close();
});

test("individual price: the write is refused (a race) - the notice, the window stays, the reason is kept", async () => {
  const { page } = await override(overrideServer({
    dry: (request) => (request.body.correction ? { json: { dry_run: true, impact: impact({ correction: { students: 1, reason: "опечатка" } }) } } : blockedBody()),
    write: () => forgiveness(1),
  }));
  await page.fill("#membership-price-amount", "30 000");
  await page.fill("#membership-price-reason", "опечатка");
  await page.waitForSelector('[data-testid="price-blocked"]');
  await page.check('[data-testid="price-correction-on"]');
  await page.waitForFunction(() => !document.querySelector('[data-testid="price-blocked"]'));
  await page.click('[data-testid="membership-price-save"]');
  await page.waitForFunction(() => /исправление превратит/.test(document.querySelector('[data-testid="price-blocked"]')?.textContent ?? ""));
  assert.ok(plain(await page.textContent('[data-testid="price-blocked"]')).includes(PHRASE(1)));
  assert.equal(await page.inputValue("#membership-price-reason"), "опечатка");
  assert.deepEqual(await page.evaluate(() => window.__log), [], "the window did not close");
  await page.close();
});

for (const width of [1280, 375]) {
  test(`${width}: the refusal of the correction fits the window - the phrase is not cut, the buttons are reachable`, async () => {
    const { page } = await group(width, groupServer({ dry: (request) => (request.body.correction ? forgiveness(3) : blockedBody()) }));
    await page.fill("#group-price-amount", "30 000");
    await page.waitForSelector('[data-testid="price-blocked"]');
    await page.check('[data-testid="price-correction-on"]');
    await page.waitForFunction(() => /исправление превратит/.test(document.querySelector('[data-testid="price-blocked"]')?.textContent ?? ""));
    await page.waitForTimeout(500);
    const facts = await page.evaluate(layoutProbe, '[role="dialog"]');
    assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
    assert.equal(facts.scroll, 0);
    assert.equal(await page.locator('button[form="group-price-form"]').isVisible(), true);
    await page.close();
  });
}


// ── PAY-TAILS Б11.10 п. 4: «Вернуть цену группы» - a refusal of the write by the model (409 PRICE_CORRECTION_FORGIVENESS) is the blocked notice of the same path, not a bare error line ───────────
test("return to the group price: the write refused with PRICE_CORRECTION_FORGIVENESS - the notice has the phrase of the server and the names, the window stays, no error line, the price is not changed", async () => {
  const { page, calls } = await open(browser, "money-v.entry.tsx", "returnPrice", { server: overrideServer({
    dry: () => ({ json: { dry_run: true, impact: impact() } }),
    write: () => forgiveness(2),
  }) });
  await page.waitForSelector('[data-testid="membership-price-return-save"]');
  await page.click('[data-testid="membership-price-return-save"]');
  await page.waitForSelector('[data-testid="price-blocked"]');
  const text = plain(await page.textContent('[data-testid="price-blocked"]'));
  assert.ok(text.includes(PHRASE(2)) && text.includes("Тошматов Бобур") && text.includes("Каримова Дилноза"), text);
  assert.deepEqual(await page.evaluate(() => window.__log), [], "the window did not close");
  assert.equal(await page.locator('[role="dialog"]').count(), 1);
  assert.equal(await page.locator('[role="alert"]:not([data-testid="price-blocked"])').count(), 0, "no second error line");
  assert.equal(calls.filter((call) => call.method === "PUT" && !/dry_run/.test(call.query)).length, 1);
  await page.close();
});
