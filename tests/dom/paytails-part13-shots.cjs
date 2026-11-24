// PAY-TAILS Б11.33 / Б11.34: `node tests/dom/paytails-part13-shots.cjs <out dir>` - the PNGs of the two screens, 1280 and 375, named «<правка>-<состояние>-<ширина>.png»
// (А - «Куда пойдут N сум» of the window «Внести оплату», Б - the pause closed by a leaving).  Prints ONLY suspicious things (sideways scroll, text off its block, a console error).
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
const { layoutProbe } = require("../helpers/layout-probe.cjs");
const F = require("../helpers/money2-fixture.cjs");
const { STATES, previewState, previewFor, paymentServer, readReal, TOSHMATOV } = require("../helpers/paytails-part13.cjs");
const { toshmatovPreview } = require("../helpers/stage-numbers.cjs");

const OWNER = { role: "owner", org_role: "owner" };
const suspicious = [];
const dims = (width) => ({ width, height: width === 375 ? 1500 : 1000 });

async function check(page, errors, label, scope) {
  const probe = await page.evaluate(layoutProbe, scope);
  const pageScroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (probe.bad.length || probe.scroll > 0 || pageScroll > 0 || errors.length) suspicious.push(`${label}: scroll ${pageScroll}/${probe.scroll} bad ${JSON.stringify(probe.bad).slice(0, 200)} errors ${errors.length}`);
}
const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`) });

(async () => {
  const browser = await launch();
  for (const width of [1280, 375]) {
    const names = [...STATES, "long_label"];
    for (const state of names) {
      let server = paymentServer(state === "long_label" ? "year_and_long_labels" : state);
      let amount = previewState(state === "long_label" ? "year_and_long_labels" : state).amount;
      if (state === "long_label") {
        // a long label of a period with two years: the header and the rows of the same world as the state «year_and_long_labels», only the first label is longer
        server = async (request) => {
          if (request.method === "GET" && request.path === "/auth/org/memberships/m1/payments/preview") {
            const answer = previewFor("year_and_long_labels", /amount=\d+/.test(request.query));
            if (answer.result) answer.result = { ...answer.result, money_rows: [{ ...answer.result.money_rows[0], label: "Декабрь 2025 – февраль 2026, остаток по всем трём периодам" }, answer.result.money_rows[1]] };
            return { json: answer };
          }
          return null;
        };
      }
      const { page, errors, calls } = await openPage(browser, "money.entry.tsx", server, dims(width));
      await page.evaluate(([u, membership]) => window.mount("till", u, { membership }), [undefined, TOSHMATOV]);
      for (let waited = 0; !calls.some((call) => call.path.endsWith("/payments/preview")) && waited < 5000; waited += 25) await page.waitForTimeout(25);
      await page.fill("#payment-amount", String(amount));
      await page.click('[data-testid="payment-methods"] >> text=Наличные');
      await page.waitForSelector('[data-testid="payment-split"]');
      await page.waitForTimeout(400);
      await check(page, errors, `A-${state}-${width}`, '[data-testid="payment-calc"]');
      await shot(page, `A-${state}-${width}`);
      await page.close();
    }
    // the old answer (no rows): the sentence stays
    {
      const { page, errors, calls } = await openPage(browser, "money.entry.tsx", paymentServer(null), dims(width));
      await page.evaluate(([u, membership]) => window.mount("till", u, { membership }), [undefined, TOSHMATOV]);
      for (let waited = 0; !calls.some((call) => call.path.endsWith("/payments/preview")) && waited < 5000; waited += 25) await page.waitForTimeout(25);
      await page.fill("#payment-amount", "400000");
      await page.click('[data-testid="payment-methods"] >> text=Наличные');
      await page.waitForSelector('[data-testid="payment-plan-sentence"]');
      await page.waitForTimeout(300);
      await check(page, errors, `A-old_answer-${width}`, '[data-testid="payment-calc"]');
      await shot(page, `A-old_answer-${width}`);
      await page.close();
    }

    // Б
    const day = (shift) => new Date(Date.now() + shift * 86400000).toISOString().slice(0, 10);
    const pauseOf = (id, first, last, over = {}) => ({ id, membership_id: "m-a", first_day: first, last_day: last, days: 13, reason: "уехал к родственникам", created_by_name: null, created_at: null, voided_at: null, void_reason: null, days_locked: false, days_locked_text: null, ...over });
    const lockedText = readReal("pause_closed_by_leave_later").days_locked_text;
    const locked = (over = {}) => pauseOf("pl", day(-3), day(9), { days_locked: true, days_locked_text: lockedText, ...over });
    for (const [state, pauses, props, act] of [
      ["no_cut", [pauseOf("pa", day(-3), day(9))], {}, async () => {}],
      ["cut_by_leaving", [locked()], {}, async () => {}],
      ["closed_by_transfer_today", [pauseOf("pt", day(-3), day(9), { days_locked: true, days_locked_text: readReal("pause_closed_by_transfer_today").days_locked_text })], {}, async () => {}],
      ["closed_by_transfer_later", [pauseOf("pu", day(-3), day(9), { days_locked: true, days_locked_text: readReal("pause_closed_by_transfer_later").days_locked_text })], {}, async () => {}],
      ["cut_reason_changed", [locked()], {}, async (page) => { await page.fill('[data-testid="pause-locked-reason"]', "уехал к родственникам в Самарканд"); }],
      ["left_student_no_form", [locked()], { active: false }, async () => {}],
      ["returned_student_form_and_locked", [locked()], {}, async () => {}],
      ["long_names_long_reason", [locked({ reason: "уехал к родственникам в Самарканд на всё лето, вернётся к началу занятий, связь через отца" })], { active: true, groupName: "Подготовка к олимпиаде по математике, 9 класс, старшая группа" }, async () => {}],
      ["race_409_becomes_locked", [pauseOf("pr", day(-3), day(9))], { race: true }, async (page) => {
        await page.getByRole("button", { name: "Закончить сегодня" }).click();
        await page.waitForSelector('[data-testid="pause-locked-text"]');
      }],
    ]) {
      let raced = false;
      const answer = F.baseServer((request) => {
        if (props.race && request.method === "GET" && request.path === "/auth/org/memberships/m-a/pauses") return { json: raced ? [locked({ id: "pr" })] : pauses };
        if (props.race && request.method === "PATCH" && request.path === "/auth/org/pauses/pr") { raced = true; return { status: 409, json: { detail: { code: "PAUSE_CLOSED_BY_LEAVE", message: lockedText } } }; }
        if (request.method === "GET" && request.path === "/auth/org/memberships/m-a/pauses") return { json: pauses };
        return null;
      });
      const { page, errors } = await openPage(browser, "money2.entry.tsx", answer, dims(width));
      await page.evaluate(([n, u, p]) => window.mount(n, u, p), ["pause", OWNER, { moneyAvailable: true, ...props }]);
      await page.waitForSelector('section[aria-label="Паузы ученика"]');
      await act(page);
      await page.waitForTimeout(500);
      await check(page, errors, `Б-${state}-${width}`, '[role="dialog"]');
      await shot(page, `Б-${state}-${width}`);
      await page.close();
    }
  }
  await browser.close();
  console.log(suspicious.length ? suspicious.join("\n") : "no suspicious");
})().catch((error) => { console.error(error); process.exit(1); });
