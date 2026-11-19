// Windows of enrolment by the owner's mock-up (frames 1-15): the answers of the server and the opening of each frame.  Group «М11 БС» (Вт, Чт, Сб, 450 000), today 19.11.2026 (Thursday), November has 12 lessons,
// 5 of them from the 19th: 450 000 * 5 / 12 = 187 500 -> 188 000 (rounded up to a thousand, as the server does).
const path = require("node:path");
const { openPage } = require("./dom-page.cjs");

const TODAY = "2026-11-19";
const SLOT = (day, start = "16:00", end = "17:00") => ({ id: `s${day}`, dayOfWeek: day, startTime: start, endTime: end });
const G2 = { id: "g2", name: "М11 БС", class_level: 7, status: "active", price: 450000, teacher_name: "Лола Мирзаева", schedule: [SLOT(2), SLOT(4), SLOT(6)] };
const STUDENT = (id, first, last, extra = {}) => ({ id, first_name: first, last_name: last, full_name: `${first} ${last}`, class_level: 7, status: "new", group_id: null, current_group_id: null, groups_count: 0, ...extra });
const IN_ALGEBRA = { group_id: "g7", current_group_id: "g7", groups_count: 1 };
const PEOPLE = [
  STUDENT("st1", "Анвар", "Каримов"), STUDENT("st2", "Лола", "Юсупова"), STUDENT("st3", "Тимур", "Рашидов"), STUDENT("st4", "Саид", "Назаров", IN_ALGEBRA),
  STUDENT("st5", "Дильноза", "Ахмедова"), STUDENT("st6", "Мадина", "Турсунова"),
  ...Array.from({ length: 22 }, (_, i) => STUDENT(`sx${i + 1}`, `Ученик${String(i + 1).padStart(2, "0")}`, "Тестов")),
];
const LONG_PEOPLE = [
  STUDENT("st1", "Мухаммадаминхужа", "Новоиспечённый-Подкрепляющийся"), STUDENT("st2", "Лола", "Юсупова-Рахмонбердиева"), STUDENT("st3", "Тимур", "Рашидов"), STUDENT("st4", "Саид", "Назаров", IN_ALGEBRA),
  STUDENT("st5", "Дильноза", "Ахмедова"), STUDENT("st6", "Мадина", "Турсунова"),
  ...Array.from({ length: 22 }, (_, i) => STUDENT(`sx${i + 1}`, `Ученик${String(i + 1).padStart(2, "0")}`, "Тестов")),
];

/** lessons of Tue/Thu/Sat in November 2026 from `from` (ISO) to the 30th */
function novemberLessons(from) {
  let n = 0;
  for (let d = Number(from.slice(8, 10)); d <= 30; d += 1) { const dow = new Date(Date.UTC(2026, 10, d)).getUTCDay(); if (dow === 2 || dow === 4 || dow === 6) n += 1; }
  return n;
}
const roundUp = (n) => Math.ceil(n / 1000) * 1000;
/** the default sum at once: price * lessons from the day / 12, rounded up to a thousand */
function defaultParts(price, from) {
  const lessons = novemberLessons(from);
  return lessons === 0 ? null : [{ label: "ноябрь", from, amount: roundUp(price * lessons / 12), lessons, lessons_in_period: 12, whole: false }];
}
const sumOf = (parts) => parts.reduce((s, p) => s + p.amount, 0);

const UNDO = "Ученика убрали сегодня — возвращаем как было: своя цена 300 000, пауза 21–25.11";
const REWRITE = "Ученика убрали сегодня и после этого простили долг — прежняя цена и паузы не вернутся";

/**
 * options: group (price null = none), people, parts(id, body) -> parts | null, past {id: rows}, undone [], ordinary [], writeResults(ids, body) -> `results`, transferCarried (messages), openings (bool),
 * leaving (the answers of the card window): groups for the list of the student's window.
 */
function server(o = {}) {
  const group = { ...G2, ...(o.group ?? {}) };
  const people = o.people ?? PEOPLE;
  const today = o.today ?? TODAY;
  const parts = o.parts ?? ((id, body) => (group.price === null ? null : defaultParts(body.price_override ? body.price_override.amount : group.price, body.pay_from || today)));
  const past = o.past ?? {};
  const undone = o.undone ?? [];
  const ordinary = o.ordinary ?? [];
  const groups = o.groups ?? [{ ...group, price_current: group.price === null ? null : { amount: group.price, valid_from: "2026-09-01" } }, { id: "g7", name: "Алгебра 7", class_level: 7, status: "active", teacher_name: "Камол Эргашев", price_current: { amount: 400000, valid_from: "2026-09-01" }, schedule: [SLOT(1), SLOT(3), SLOT(5)] }];
  const calls = o.calls ?? [];
  const leaveOf = (id) => (undone.includes(id) ? { undone: true, text: UNDO, restored: [] } : ordinary.includes(id) ? { undone: false, text: REWRITE, restored: [] } : null);
  const billingOf = (id, body) => {
    const p = parts(id, body);
    return p ? { pay_from: body.pay_from || today, explicit: Boolean(body.pay_from), default_pay_from: today, first_lesson: today, text: "Оплата с", immediate: { amount: sumOf(p), lessons: p.reduce((s, x) => s + x.lessons, 0), text: "К оплате сразу", parts: p } } : null;
  };
  return (r) => {
    calls.push(r);
    if (r.method === "GET" && r.path === "/auth/org/opening-balances/summary") return { json: { can_set_opening: o.canSetOpening !== false } };
    if (r.method === "GET" && r.path === "/auth/org/groups") return { json: groups };
    if (r.method === "GET" && r.path === "/auth/org/students") {
      const q = new URLSearchParams(r.query);
      const term = (q.get("search") || "").toLowerCase();
      let items = people.filter((s) => (!q.get("class_level") || String(s.class_level) === q.get("class_level")) && (q.get("has_group") !== "false" || s.groups_count === 0) && (!term || s.full_name.toLowerCase().includes(term) || s.id === term));
      const total = items.length;
      items = items.slice(0, o.pageLimit ?? 500);
      return { json: { items, total } };
    }
    if (r.method === "GET" && /\/pay-from-default$/.test(r.path)) return { json: { today, first_lesson: today, default_pay_from: today, text: o.payText ?? "Оплата с 19.11.2026 — первое занятие группы с сегодня" } };
    if (r.method === "POST" && /\/groups\/g2\/students\/bulk$/.test(r.path)) {
      const ids = r.body.student_ids;
      if (/dry_run=true/.test(r.query)) {
        const transfer = /mode=transfer/.test(r.query);
        return { json: { group_id: "g2", added: ids.length, skipped: 0, skipped_details: [], warnings: [], dry_run: true, ...(transfer ? { carried: o.transferCarried ?? [{ code: "payment_carried_over", message: "Из «Алгебра 7» перейдёт 555 000 сум: 188 000 — за ноябрь здесь, 367 000 — аванс" }] } : {}), students: ids.map((id) => ({ student_id: id, group_id: "g2", status: "added", billing: transfer ? null : billingOf(id, r.body), past_balances: past[id] || [], leave_undo: leaveOf(id) })) } };
      }
      const results = o.writeResults ? o.writeResults(ids, r.body) : ids.map((id) => ({ student_id: id, status: "added" }));
      const skipped = results.filter((x) => x.status === "skipped");
      return { json: { group_id: "g2", added: results.length - skipped.length, skipped: skipped.length, skipped_details: skipped.map((x) => ({ student_id: x.student_id, reason: x.reason, code: x.code })), warnings: [], results, students: ids.map((id) => ({ student_id: id, leave_undo: leaveOf(id) })) } };
    }
    const one = /^\/auth\/org\/groups\/(\w+)\/students\/(\w+)$/.exec(r.path);
    if (r.method === "POST" && one) {
      const dry = /dry_run=true/.test(r.query);
      const transfer = /mode=transfer/.test(r.query);
      const body = r.body || {};
      const answer = { student_id: one[2], group_id: one[1], status: "added", dry_run: dry, leave_undo: leaveOf(one[2]), past_balances: (o.pastByGroup ? (o.pastByGroup[one[1]] || {})[one[2]] : past[one[2]]) || [], warnings: [], billing: transfer ? null : billingOf(one[2], body) };
      if (transfer) Object.assign(answer, { carried: o.transferCarried ?? [{ code: "payment_carried_over", message: "Из «Алгебра 7» перейдёт 555 000 сум" }] });
      return { json: answer };
    }
    return o.rest ? o.rest(r) : null;
  };
}

const plain = (text) => String(text ?? "").replace(/[\s ]+/g, " ").trim();
const OWNER = { role: "owner", org_role: "owner" };
const ADMIN_NO_MONEY = { role: "admin", org_role: "admin", payments_access: false };

/** opens the drawer of the group page; `props.money` false - a role without the right to money */
async function openDrawer(ctx, handler, { width = 1280, user = OWNER, props = {} } = {}) {
  const run = await openPage(ctx.browser, "enrol-v2.entry.tsx", handler, { width, height: width === 375 ? 812 : 900 });
  const money = props.money !== false;
  await run.page.evaluate(([name, u, p]) => window.mount(name, u, p), ["drawer", user, { groupName: "М11 БС", groupPrice: money ? (props.groupPrice === undefined ? { amount: 450000, valid_from: "2026-09-01" } : props.groupPrice) : undefined, ...props }]);
  await run.page.waitForSelector('[data-testid="enrol-list"] label, [data-testid="enrol-list"] p');
  return run;
}
/** chooses students by name through the list (the way a person does) */
async function pick(page, ...names) {
  for (const name of names) {
    const row = page.locator(`[data-testid="enrol-list"] label:has-text("${name}")`).first();
    // the list shows five rows; the rest opens with «и ещё N» (the person can also search)
    if ((await row.count()) === 0 && (await page.locator('[data-testid="enrol-list-more"]').count()) > 0) await page.click('[data-testid="enrol-list-more"]');
    await row.click();
    await page.waitForTimeout(80);
  }
}
const search = async (page, text) => { await page.fill('input[aria-label="Поиск по имени или ID"]', text); await page.waitForTimeout(700); };
/** waits for the bar to say a sum (the probe has answered) */
const settled = async (page) => { await page.waitForFunction(() => { const b = document.querySelector('[data-testid="enrol-submit"]'); return b && !b.disabled; }, null, { timeout: 5000 }); };
const barText = async (page) => plain(await page.locator('[data-testid="summary-bar"]').innerText());

module.exports = { openPage, TODAY, G2, SLOT, STUDENT, PEOPLE, LONG_PEOPLE, IN_ALGEBRA, server, defaultParts, sumOf, UNDO, REWRITE, plain, OWNER, ADMIN_NO_MONEY, openDrawer, pick, search, settled, barText };
