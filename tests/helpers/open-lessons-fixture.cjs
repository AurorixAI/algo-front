// «Уроки без отметки» of the walk of stage 05.11 (UX pack №7 / №17): Лола Мирзаева has 2 lessons of October (one of them a substitution) and 1 of November; MIXED has a lesson that is going on among them.
const lesson = (over) => ({ actionType: "missed", groupId: "g1", groupName: "Геометрия 8 (пн/чт)", classLevel: 8, lessonId: "l1", lessonDate: "2026-10-22", subject: "Геометрия", startTime: "18:00", endTime: "19:00", markedCount: 0, rosterCount: 8, remainingCount: 8,
  teacherId: "11111111-2222-3333-4444-555555555555", teacherName: "Лола Мирзаева", isSubstitution: false, ...over });
const WALK = { total: 3, since: "2026-09-01", months: [
  { month: "2026-10", title: "Октябрь 2026", count: 2, missed: 2, inProgress: 0, items: [lesson({ isSubstitution: true }), lesson({ lessonId: "l2", lessonDate: "2026-10-19" })] },
  { month: "2026-11", title: "Ноябрь 2026", count: 1, missed: 1, inProgress: 0, items: [lesson({ lessonId: "l3", groupName: "Архив-тест 3", lessonDate: "2026-11-03", startTime: "11:00", endTime: "12:00" })] },
] };
const MIXED = { total: 2, since: "2026-09-01", months: [{ month: "2026-10", title: "Октябрь 2026", count: 2, missed: 1, inProgress: 1, items: [lesson({}), lesson({ lessonId: "l2", actionType: "in_progress", lessonDate: "2026-10-19", markedCount: 3, remainingCount: 5 })] }] };
const openLessonsServer = (data = WALK) => (request) => (request.path === "/auth/org/attendance/open-actions/by-month" ? { json: data } : null);

module.exports = { lesson, WALK, MIXED, openLessonsServer };
