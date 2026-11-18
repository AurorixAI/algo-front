// Money-2 fix 7: the answers of the server for «the student comes back the day of the leaving» (`leave_undo`) and the common start of the tests of the windows of enrolment.
const F = require("./money2-fixture.cjs");

const UNDO_TEXT = "Ученика убрали сегодня — возвращаем как было: индивидуальная цена 300 000 сум. Долг снова за учеником: прощение отменилось при уходе — простите заново, если нужно";
const undoOf = (undone = true, text = UNDO_TEXT) => (undone ? { undone: true, text, restored: [{ code: "individual_price", text: "Индивидуальная цена 300 000 сум возвращена" }], forgiveness_cancelled: { amount: 120000 } } : null);
const isDry = (request) => /dry_run=true/.test(request.query);

/** The window of a student with NO groups / with groups: the dry run of `mode=add` of `gt` answers `leave_undo` (and `past_balances` when given). */
function modalServer({ undone = true, pastBalances = [], names = F.LONG, immediate = null } = {}) {
  return F.baseServer((request) => (request.method === "GET" && request.path === "/auth/org/groups/gt/pay-from-default"
    ? { json: { today: "2026-11-06", first_lesson: "2026-11-09", default_pay_from: "2026-11-09", text: "Оплата с 09.11.2026 — первое занятие группы с сегодня" } }
    : request.method === "POST" && request.path === "/auth/org/groups/gt/students/st1"
    ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: isDry(request), billing: immediate && request.body && request.body.pay_from ? { pay_from: request.body.pay_from, explicit: true, default_pay_from: "2026-11-09", first_lesson: "2026-11-09", text: "Оплата с выбранного дня", immediate } : null, leave_undo: undoOf(undone), past_balances: pastBalances } } : null), names);
}

/** The drawer of the group page (`money-b.entry.tsx` -> `addDrawer`): the students `st9` (comes back the day of the leaving) and `st8` (an ordinary one). */
const STUDENT = (id, last, first = "Ученик") => ({ id, first_name: first, last_name: last, full_name: `${last} ${first}`, class_level: 7, status: "new", group_id: null, current_group_id: null, groups_count: 0 });
function drawerServer(undoneIds, extra = () => null, long = false, balancesBy = {}) {
  return (request) => {
    const own = extra(request);
    if (own) return own;
    if (request.method === "GET" && request.path === "/auth/org/groups") return { json: [{ id: "g2", name: long ? "7-Б Геометрия, углублённая программа подготовки к олимпиаде (вторник и пятница)" : "7-Б Геометрия" }] };
    if (request.method === "GET" && request.path === "/auth/org/students") return { json: { items: [STUDENT("st9", long ? "Новоиспечённый-Подкрепляющийся" : "Новый", long ? "Мухаммадаминхужа" : "Ученик"), STUDENT("st8", "Второй")], total: 2 } };
    if (request.method === "GET" && request.path === "/auth/org/groups/g2/pay-from-default") return { json: { today: "2026-11-06", first_lesson: "2026-11-09", default_pay_from: "2026-11-09", text: "Оплата с 09.11.2026 — первое занятие группы с сегодня" } };
    const one = /^\/auth\/org\/groups\/g2\/students\/(st\d)$/.exec(request.path);
    if (request.method === "POST" && one) return { json: { student_id: one[1], group_id: "g2", status: "added", dry_run: isDry(request), billing: null, leave_undo: undoOf(undoneIds.includes(one[1])) } };
    // fix 8 (server MONEY2_FIX_STAGE7 M1/M4): the BULK answer carries `leave_undo` and `past_balances` in the row of each student
    if (request.method === "POST" && request.path === "/auth/org/groups/g2/students/bulk") {
      const ids = (request.body && request.body.student_ids) || [];
      return { json: { group_id: "g2", added: ids.length, skipped: 0, skipped_details: [], warnings: [], dry_run: isDry(request), students: ids.map((id) => ({ student_id: id, group_id: "g2", status: "added", billing: null, leave_undo: undoOf(undoneIds.includes(id)), past_balances: balancesBy[id] || [] })) } };
    }
    return null;
  };
}
const bulkProbes = (calls) => calls.filter((c) => c.method === "POST" && /\/students\/bulk$/.test(c.path) && isDry(c));
const singleProbes = (calls) => calls.filter((c) => c.method === "POST" && /\/students\/st\d$/.test(c.path) && isDry(c));
const plainText = (text) => String(text ?? "").replace(/[\s\u00a0]+/g, " ").trim();
/** What a person SEES inside the element: the text without the `sr-only` copies (the words of a «?» are read by screen readers but are not on the screen). */
const shown = async (locator) => plainText(await locator.evaluate((el) => { const copy = el.cloneNode(true); copy.querySelectorAll(".sr-only").forEach((node) => node.remove()); return copy.textContent; }));
/** The words inside the «?» of the element (the text a screen reader gets with `aria-describedby`). */
const hintsOf = async (locator) => (await locator.locator(".sr-only").allTextContents()).map(plainText);
module.exports = { shown, hintsOf, plainText, STUDENT, bulkProbes, singleProbes, F, UNDO_TEXT, undoOf, isDry, modalServer, drawerServer };
