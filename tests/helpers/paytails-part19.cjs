// PAY-TAILS Б11.48 (part 19): the page of a group with the roster of the REAL answer of the server (`tests/fixtures/paytails/part19/group_detail_with_pause.json`, a byte copy of
// `paytails-r7/answers/`, head of the server f6784a3: two students, the first on a running pause until 30.11.2026, the second without one; both rows carry `membership_id`)
// and a small server of the pauses of those two memberships.  Nothing in an answer is moved: the page clock stands on the day of the world of the answer (24.11.2026).
const fs = require("node:fs");
const path = require("node:path");
const X = require("./money-b-fixture.cjs");
const { contract } = require("./paytails-part16.cjs");

const GROUP_FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", "paytails", "part19", "group_detail_with_pause.json"), "utf8"));
const WORLD = "2026-11-24";
const [ON_PAUSE, FREE] = GROUP_FIXTURE.students;
const OWNER = { role: "owner", org_role: "owner" };
const ADMIN_MONEY = { role: "admin", org_role: "admin", payments_access: true };
const ADMIN_NO_MONEY = { role: "admin", org_role: "admin", payments_access: false };
const TEACHER = { role: "teacher", org_role: "teacher" };

/**
 * The server of the page: `GET /groups/g1` is the answer (a function of the state: after a pause is written the row changes as the server's would);
 * the pauses of the two memberships; `create` / `end` / `void` answer by the real probes of part 16.
 * `mutate` false: the roster never changes (a test of the items of the menu only).
 */
function groupServer({ answer = GROUP_FIXTURE, withoutMembershipId = false, ending = "pause_probe_end_today", voiding = "pause_probe_void_running" } = {}) {
  const students = answer.students.map((student) => ({ ...student }));
  const pauses = { [ON_PAUSE.membership_id]: [{ ...contract("pause_probe_void_running").pause, membership_id: ON_PAUSE.membership_id, voided_at: null, void_reason: null }], [FREE.membership_id]: [] };
  const rowOf = (membershipId) => students.find((student) => student.membership_id === membershipId);
  const server = (request) => {
    if (request.method === "GET" && request.path === "/auth/org/groups/g1") {
      return { json: { ...answer, students: students.map((student) => { if (!withoutMembershipId) return student; const { membership_id, ...rest } = student; return rest; }) } };
    }
    if (request.path === "/auth/org/payments/summary") return { json: X.SUMMARY };
    if (request.path === "/auth/org/payments/status") return { json: { items: [], total: 0 } };
    const list = request.path.match(/^\/auth\/org\/memberships\/([^/]+)\/pauses$/);
    const dry = /dry_run=true/.test(request.query);
    if (list && request.method === "GET") return { json: pauses[list[1]] ?? [] };
    if (list && request.method === "POST") {
      const answerOf = contract("pause_probe_create_week");
      const pause = { ...answerOf.pause, membership_id: list[1] };
      if (!dry) { pauses[list[1]] = [pause]; Object.assign(rowOf(list[1]), { on_pause: true, paused_until: pause.last_day }); }
      return { json: { ...answerOf, pause, dry_run: dry } };
    }
    const one = request.path.match(/^\/auth\/org\/pauses\/([^/]+)(\/void)?$/);
    if (one && (request.method === "PATCH" || (request.method === "POST" && one[2]))) {
      const answerOf = contract(one[2] ? voiding : ending);
      if (!dry) {
        const membershipId = Object.keys(pauses).find((id) => pauses[id].some((pause) => pause.id === one[1]));
        if (membershipId) { pauses[membershipId] = []; Object.assign(rowOf(membershipId), { on_pause: false, paused_until: null }); }
      }
      return { json: { ...answerOf, dry_run: dry } };
    }
    return null;
  };
  server.pauses = pauses;
  server.students = students;
  return server;
}

module.exports = { GROUP_FIXTURE, WORLD, ON_PAUSE, FREE, OWNER, ADMIN_MONEY, ADMIN_NO_MONEY, TEACHER, groupServer };
