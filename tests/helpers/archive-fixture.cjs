// The preflight of the archive of the walk of stage 05.11 (UX pack №6): «Архив-тест 3» with ONE lesson without a mark (вт, 3 ноября · 11:00–12:00 · Мирзаева Л.) and 8 future lessons.  The sentence
// of the money is the server's own (`group_lifecycle.cancelConsequence`).
const SERVER_SENTENCE = "Если отменить эти уроки при архивации, ученикам перерасчёта не будет, а в зарплату преподавателей они не войдут. Если уроки были — сначала отметьте посещаемость";

function impact(over = {}) {
  return {
    groupId: "g1", groupName: "Архив-тест 3", status: "active", canArchive: false, examService: "ok",
    blockers: [{ code: "MISSED_LESSONS", count: 1, cancelConsequence: SERVER_SENTENCE, lessons: [{ lessonId: "l1", lessonDate: "2026-11-03", startTime: "11:00", endTime: "12:00", teacherName: "Мирзаева Л." }] }],
    autoActions: [{ code: "STOP_FUTURE_LESSONS", count: 8 }], warnings: [],
    ...over,
  };
}

function archiveServer(over = {}) {
  return (request) => {
    if (request.method === "GET" && request.path === "/auth/org/groups/g1/archive-impact") return { json: impact(over) };
    if (request.method === "POST" && request.path === "/auth/org/groups/g1/archive") return { json: { id: "g1", status: "archived", cancelledMissedLessons: 1 } };
    return null;
  };
}

module.exports = { SERVER_SENTENCE, impact, archiveServer };
