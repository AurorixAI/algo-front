// Two students of one group for a saved sheet of 120 834 sum: the sheet with NO lines has no caption of the table (re-audit С1), so a test of the caption needs a table.
const mark = (date) => ({ date, lesson_id: `l${date}`, mark: 1, state: "counted", divisor: 12 });
const line = (id, name, counted, amount) => ({ membership_id: id, student_id: id, student_name: name, display_id: null, group_id: "g1", group_name: "Алгебра 7А", lesson_type: "group", lesson_time: null,
  monthly_fee: 500000, source_fee: 500000, percent: "50", divisor: 12, marks: [mark("2026-11-03")], counted, unpaid: 0, pending_excused: 0, include_unpaid: false, amount, warnings: [] });
const lines = [line("a", "Алиева Нигора", 4, 80000), line("b", "Назаров Фаррух", 3, 40834)];
const groups = [{ group_id: "g1", group_name: "Алгебра 7А", lesson_type: "group", lesson_time: "17:00", percent: "50", dates: [{ date: "2026-11-03", lesson_id: "l2026-11-03" }], line_count: 2, counted: 7, unpaid: 0, total_amount: 120834 }];
module.exports = { lines, groups };
