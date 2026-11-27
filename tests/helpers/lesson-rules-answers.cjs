// The answers of the server for the screens of LESSON-RULES: the files are the server's OWN answers (artifacts/money1-stage/.cache/lesson-rules/answers, copied byte for byte into tests/fixtures/lessonRules).
// The world of the answers: the centre works on Thursday 26.11.2026 (the clock of a page stands on that day, no shift of dates).
const fs = require("node:fs");
const path = require("node:path");

const answer = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", "lessonRules", `${name}.json`), "utf8"));
const WORLD_DAY = "2026-11-26";
/** The teacher of the world, read from the real answer (the ids of the unload change with every run: no id is copied into a test). */
const WORLD_TEACHER_ID = answer("schedule_teacher")[0].teacherId;
const plain = (text) => String(text ?? "").replace(/[\s ]+/g, " ").trim();

/** The routes of the page «Замены»: the pending list and the history are the given answers; the rest is quiet. */
function listServer({ pending = null, decided = null, extra = null } = {}) {
  return (request) => {
    if (extra) { const out = extra(request); if (out) return out; }
    if (request.path === "/auth/org/substitutions" && /status=pending/.test(request.query)) return { json: pending ?? answer("pending_owner") };
    if (request.path === "/auth/org/substitutions" && /status=decided/.test(request.query)) return { json: decided ?? answer("history") };
    if (request.path === "/auth/org/substitutions/summary") return { json: answer("summary_owner") };
    if (request.path === "/auth/org/one-off-decisions") return { json: { items: [], total: 0 } };
    if (request.path === "/auth/org/one-off-decisions/decided") return { json: { items: [], total: 0 } };   
    if (request.path === "/auth/org/members" || request.path === "/auth/org/groups") return { json: [] };
    return null;
  };
}

module.exports = { answer, listServer, WORLD_DAY, WORLD_TEACHER_ID, plain };
