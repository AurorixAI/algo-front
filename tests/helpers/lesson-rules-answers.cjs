// The answers of the server for the screens of LESSON-RULES: the files are the server's OWN answers (artifacts/money1-stage/.cache/lesson-rules/answers, copied byte for byte into tests/fixtures/lessonRules).
// The world of the answers: the centre works on Thursday 26.11.2026 (the clock of a page stands on that day, no shift of dates).
const fs = require("node:fs");
const path = require("node:path");

const answer = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", "lessonRules", `${name}.json`), "utf8"));
const WORLD_DAY = "2026-11-26";
const plain = (text) => String(text ?? "").replace(/[\s ]+/g, " ").trim();

/** The routes of the page «Замены»: the pending list and the history are the given answers; the rest is quiet. */
function listServer({ pending = null, decided = null, extra = null } = {}) {
  return (request) => {
    if (extra) { const out = extra(request); if (out) return out; }
    if (request.path === "/auth/org/substitutions" && /status=pending/.test(request.query)) return { json: pending ?? answer("pending_owner") };
    if (request.path === "/auth/org/substitutions" && /status=decided/.test(request.query)) return { json: decided ?? answer("history") };
    if (request.path === "/auth/org/substitutions/summary") return { json: answer("summary_owner") };
    if (request.path === "/auth/org/one-off-decisions") return { json: { items: [], total: 0 } };
    if (request.path === "/auth/org/one-off-decisions/decided") return { json: { items: [], total: 0 } };   // the unload has no decided additional lessons: none in the world
    if (request.path === "/auth/org/members" || request.path === "/auth/org/groups") return { json: [] };
    return null;
  };
}

// NOT EXPORTED by the server (С10.7) - the two bodies below are written by hand from the contract and are the ONLY ones in the package that are not the server's own (listed in the report).
const PERIOD_CLOSED_NOT_EXPORTED = { detail: { code: "PERIOD_CLOSED", message: "Преподаватель: Эргашев К. · ноябрь закрыт (зарплата сохранена 02.12.2026). Чтобы изменить урок, переоткройте месяц (это делает владелец или администратор с доступом к деньгам).", month: "2026-11", teacherId: "85364d94-c8fb-5916-ae84-9583524e23fd", teacherName: "Эргашев К.", teacherFirstName: "Камол", teacherLastName: "Эргашев", closedOn: "2026-12-02" } };
const DECIDED_ONE_OFF_NOT_EXPORTED = { lessonId: "lesson-extra", groupId: "287049ea-7673-5f46-b17e-41e317fdd7f1", groupName: "Математика 7", lessonDate: "2026-11-24", startTime: "16:00", endTime: "17:00", purpose: "extra", title: "Дополнительный урок", teacher: { id: "85364d94-c8fb-5916-ae84-9583524e23fd", name: "Эргашев К." }, createdBy: null, studentsPresent: 7, studentsTotal: 9, payrollSheet: null, money: "paid", decidedAt: "2026-11-26T07:00:00", decidedBy: { id: "05720600-ebf6-5f54-baaf-fd04de596155", name: "Валиев Р.", role: "owner" }, canUndo: true, periodClosed: false };

module.exports = { answer, listServer, WORLD_DAY, plain, PERIOD_CLOSED_NOT_EXPORTED, DECIDED_ONE_OFF_NOT_EXPORTED };
