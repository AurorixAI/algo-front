// The 15 frames of the owner's mock-up (artifacts/design-enrol/index.html) opened on the stand: one function per frame, the SAME for the tests of the frames and for the snapshots.
// `long`: long names of the students and of the groups (frames 2, 6, 8 are looked at with them too).
const H = require("./enrol-v2.cjs");
const { server, pick, search, settled, openDrawer, openPage } = H;

const LONG_GROUP = "М11 БС, углублённая программа подготовки к олимпиаде для школьников (вторник, четверг, суббота)";
const LONG_ALGEBRA = "Алгебра 7 класс, углублённая программа подготовки к олимпиаде (понедельник, среда, пятница)";
const DEBT = { group_id: "g2", group_name: "М11 БС", membership_id: "m-same", left_on: "2026-11-19", kind: "debt", amount: 15000, same_group: true, text: "В этой группе с прошлого раза остался долг 15 000 сум" };
const DEBT_NO_SUM = (() => { const r = { ...DEBT }; delete r.amount; return r; })();

const base = (long, extra = {}) => ({
  people: long ? H.LONG_PEOPLE : H.PEOPLE,
  group: long ? { name: LONG_GROUP } : {},
  ...extra,
});
const withGroup = (long) => ({ groupName: long ? LONG_GROUP : "М11 БС" });

const FRAMES = {
  // 1 - nothing chosen
  1: async (ctx, o = {}) => openDrawer(ctx, server(base(o.long)), { width: o.width, props: withGroup(o.long) }),
  // 2 - three chosen
  2: async (ctx, o = {}) => { const run = await openDrawer(ctx, server(base(o.long)), { width: o.width, props: withGroup(o.long) }); await pick(run.page, o.long ? "Новоиспечённый" : "Каримов", "Юсупова", "Рашидов"); await settled(run.page); return run; },
  // 3 - «Изменить»: the day, an own price and its reason
  3: async (ctx, o = {}) => {
    const run = await FRAMES[2](ctx, o);
    await run.page.click('[data-testid="enrol-terms-toggle"]');
    await run.page.fill("#add-student-pay-from", "17.11.2026");
    await run.page.fill("#add-student-price-amount", "400000");
    await run.page.fill("#add-student-price-reason", "Скидка: брат и сёстры");
    await run.page.waitForTimeout(500); await settled(run.page);
    return run;
  },
  // 4 - written: the window closes, the message stays
  4: async (ctx, o = {}) => { const run = await FRAMES[2](ctx, o); await run.page.click('[data-testid="enrol-submit"]'); await run.page.waitForSelector('[role="status"]'); await run.page.waitForTimeout(400); return run; },
  // 5 - a student of another group: the choice sits in his row
  5: async (ctx, o = {}) => {
    const run = await openDrawer(ctx, server(base(o.long)), { width: o.width, props: withGroup(o.long) });
    await pick(run.page, o.long ? "Новоиспечённый" : "Каримов");
    await search(run.page, "Назаров"); await pick(run.page, "Назаров");
    await run.page.waitForSelector('[data-testid="transfer-preview"][data-state="ready"]');
    return run;
  },
  // 6 - a debt of the last time, «зачисляется обычным порядком», «вернётся как был»
  6: async (ctx, o = {}) => {
    const run = await openDrawer(ctx, server(base(o.long, { past: { st2: [DEBT] }, ordinary: ["st3"], undone: ["st6"], parts: (id, body) => (id === "st6" ? null : H.defaultParts(450000, body.pay_from || H.TODAY)) })), { width: o.width, props: withGroup(o.long) });
    await pick(run.page, o.long ? "Новоиспечённый" : "Каримов", "Юсупова", "Рашидов", "Турсунова");
    await run.page.waitForSelector('[data-testid="enrol-note-past"]'); await run.page.waitForTimeout(300); await settled(run.page);
    return run;
  },
  // 7 - the sums differ: «По ученикам»
  7: async (ctx, o = {}) => {
    const oct = [{ label: "октябрь", from: "2026-10-27", amount: 89000, lessons: 2, lessons_in_period: 9, whole: false }, { label: "ноябрь", from: "", amount: 400000, lessons: 12, lessons_in_period: 12, whole: true }];
    const parts = (id) => (id === "st3" ? [{ label: "ноябрь", from: "", amount: 150000, lessons: 5, lessons_in_period: 12, whole: false }] : oct);
    const run = await openDrawer(ctx, server(base(o.long, { group: { name: o.long ? LONG_ALGEBRA : "Алгебра 7", price: 400000, schedule: [H.SLOT(1), H.SLOT(3), H.SLOT(5)] }, parts })), { width: o.width, props: { groupName: o.long ? LONG_ALGEBRA : "Алгебра 7", groupPrice: { amount: 400000, valid_from: "2026-09-01" } } });
    await pick(run.page, o.long ? "Новоиспечённый" : "Каримов", "Юсупова", "Рашидов");
    await run.page.click('[data-testid="enrol-terms-toggle"]');
    await run.page.fill("#add-student-pay-from", "27.10.2026");
    await run.page.waitForTimeout(500); await settled(run.page);
    await run.page.click('[data-testid="enrol-terms-toggle"]');
    await run.page.click('[data-testid="enrol-by-student-toggle"]');
    return run;
  },
  // 8 - many chosen
  8: async (ctx, o = {}) => {
    const run = await openDrawer(ctx, server(base(o.long)), { width: o.width, props: withGroup(o.long) });
    for (let i = 0; i < 8; i += 1) { await run.page.locator('[data-testid="enrol-list"] label').first().click(); await run.page.waitForTimeout(60); }
    await settled(run.page); await run.page.waitForTimeout(200);
    return run;
  },
  // 9 - counting: the old sum fades
  9: async (ctx, o = {}) => {
    let asked = 0;
    const inner = server(base(o.long));
    const handler = async (r) => { if (r.method === "POST" && /students\/bulk$/.test(r.path)) { asked += 1; if (asked > 1) await new Promise((done) => setTimeout(done, 3000)); } return inner(r); };
    const run = await openDrawer(ctx, handler, { width: o.width, props: withGroup(o.long) });
    await pick(run.page, o.long ? "Новоиспечённый" : "Каримов", "Юсупова"); await settled(run.page);
    await run.page.click('[data-testid="enrol-terms-toggle"]');
    await run.page.fill("#add-student-pay-from", "17.11.2026");
    await run.page.waitForTimeout(600);
    return run;
  },
  // 10 - the group has no price
  10: async (ctx, o = {}) => {
    const run = await openDrawer(ctx, server(base(o.long, { group: { price: null, schedule: [] } })), { width: o.width, props: { ...withGroup(o.long), groupPrice: null } });
    await pick(run.page, o.long ? "Новоиспечённый" : "Каримов"); await run.page.waitForTimeout(700);
    return run;
  },
  // 11 - a role without the right to money
  11: async (ctx, o = {}) => {
    const run = await openDrawer(ctx, server(base(o.long, { past: { st2: [DEBT_NO_SUM] } })), { width: o.width, user: H.ADMIN_NO_MONEY, props: { ...withGroup(o.long), money: false } });
    await pick(run.page, o.long ? "Новоиспечённый" : "Каримов", "Юсупова"); await run.page.waitForSelector('[data-testid="enrol-note-past"]'); await run.page.waitForTimeout(300);
    return run;
  },
  // 12 - not all are written
  12: async (ctx, o = {}) => {
    const NO_PLACE = "В группе нет мест: 30 из 30. Увеличьте число мест или выберите другую группу";
    const run = await openDrawer(ctx, server(base(o.long, { writeResults: (ids) => ids.map((id) => (id === "st3" ? { student_id: id, status: "skipped", code: "GROUP_FULL", reason: NO_PLACE } : { student_id: id, status: "added" })) })), { width: o.width, props: withGroup(o.long) });
    await pick(run.page, o.long ? "Новоиспечённый" : "Каримов", "Юсупова", "Рашидов"); await settled(run.page);
    await run.page.click('[data-testid="enrol-submit"]'); await run.page.waitForSelector('[data-testid="bulk-outcome"]');
    return run;
  },
  // 13 - phone, one chosen
  13: async (ctx, o = {}) => { const run = await openDrawer(ctx, server(base(o.long)), { width: 375, props: withGroup(o.long) }); await pick(run.page, o.long ? "Новоиспечённый" : "Каримов"); await settled(run.page); return run; },
  // 14 - phone, the conditions open
  14: async (ctx, o = {}) => {
    const run = await openDrawer(ctx, server(base(o.long)), { width: 375, props: withGroup(o.long) });
    await pick(run.page, o.long ? "Новоиспечённый" : "Каримов", "Юсупова"); await settled(run.page);
    await run.page.click('[data-testid="enrol-terms-toggle"]'); await run.page.fill("#add-student-pay-from", "17.11.2026"); await run.page.waitForTimeout(500); await settled(run.page);
    return run;
  },
  // 15 - from the card of the student: the group is chosen
  15: async (ctx, o = {}) => {
    const physics = o.long ? "Физика 7 класс, углублённая программа подготовки к олимпиаде (понедельник, среда, пятница)" : "Физика 7";
    const groups = [
      { id: "g7", name: o.long ? LONG_ALGEBRA : "Алгебра 7", class_level: 7, status: "active", teacher_name: "Камол Эргашев", price_current: { amount: 400000, valid_from: "2026-09-01" }, schedule: [H.SLOT(1), H.SLOT(3), H.SLOT(5)], student_count: 20, max_students: 30 },
      { id: "gt", name: physics, class_level: 7, status: "active", teacher_name: "Лола Мирзаева", price_current: { amount: 600000, valid_from: "2026-09-01" }, schedule: [H.SLOT(1), H.SLOT(3), H.SLOT(5)], student_count: 12, max_students: 30 },
      { id: "gg", name: "Геометрия 7", class_level: 7, status: "active", teacher_name: "Камол Эргашев", price_current: { amount: 450000, valid_from: "2026-09-01" }, schedule: [H.SLOT(2, "17:30", "18:30"), H.SLOT(4, "17:30", "18:30")], student_count: 28, max_students: 30 },
      { id: "ge", name: "Английский 6", class_level: 6, status: "active", teacher_name: null, price_current: undefined, schedule: [], student_count: 0, max_students: 30 },
    ];
    const debt = { group_id: "gt", group_name: physics, membership_id: "m-gt", left_on: "2026-11-17", kind: "debt", amount: 38000, same_group: true, text: "В «Физика 7» с прошлого раза остался долг 38 000 сум" };
    const handler = server({ groups, today: "2026-11-20", pastByGroup: { gt: { st1: [debt] } }, parts: () => [{ label: "ноябрь", from: "2026-11-20", amount: 231000, lessons: 5, lessons_in_period: 13, whole: false }] });
    const run = await openPage(ctx.browser, "enrol-v2.entry.tsx", handler, { width: o.width ?? 1280, height: (o.width ?? 1280) === 375 ? 812 : 900 });
    await run.page.evaluate(([u, p]) => window.mount("card", u, p), [H.OWNER, { mode: "add", currentGroupId: "g7", currentGroupName: o.long ? LONG_ALGEBRA : "Алгебра 7", excludeGroupIds: ["g7"], sourceGroups: [{ id: "g7", name: "Алгебра 7" }], studentName: o.long ? "Мухаммадаминхужа Новоиспечённый-Подкрепляющийся" : "Анвар Каримов" }]);
    await run.page.waitForSelector('[data-testid="assign-group-card"]');
    await run.page.locator('[data-testid="assign-group-card"]:has-text("Физика")').click();
    await run.page.waitForSelector('[data-testid="enrol-note-past"]'); await run.page.waitForTimeout(500);
    await run.page.waitForFunction(() => { const b = document.querySelector('[data-testid="assign-submit"]'); return b && !b.disabled; }, null, { timeout: 5000 });
    return run;
  },
};

module.exports = { FRAMES, LONG_GROUP, LONG_ALGEBRA, DEBT };
