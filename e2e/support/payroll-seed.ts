import { spawnSync } from "node:child_process";

/**
 * Wave B P4 (R3 3): a SAVED payroll sheet of a month the real calculation cannot make - it needs lessons, and a lesson of the next month cannot be held today, nor one of the past.
 * The sheet is written inside the auth container of THIS stack (the same way `support/console.ts` seeds the console); everything after that goes through the real API and screens.
 * One line with a hand-set price keeps the saved total as the target (no «fresh» calculation of a month without lessons).
 * It is saved NOW: a sheet of a PAST month is therefore saved after the end of that month - the month is CLOSED (it hands an advance on); a sheet of the current or a coming month is OPEN.
 */
const PROJECT = process.env.E2E_PROJECT || "algo-e2e";

function authContainer(): string {
  const ps = spawnSync("docker", ["compose", "-p", PROJECT, "ps", "-q", "auth"], { encoding: "utf8" });
  const id = ps.stdout.trim().split("\n")[0];
  if (!id) throw new Error(`the auth container of the ${PROJECT} stack was not found`);
  return id;
}

const SCRIPT = `import src.api.main_v2  # noqa: F401 (the application first: the modules import each other)
import sys, uuid
from datetime import date
from src.core.database import db_session
from src.models.auth import OrganizationMember, PayrollSheet
owner, teacher, month, total = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
with db_session() as db:
    org = db.query(OrganizationMember.org_id).filter(OrganizationMember.user_id == uuid.UUID(owner)).scalar()
    line = {"line_key": "m", "membership_id": str(uuid.uuid4()), "student_id": str(uuid.uuid4()), "student_name": "Ученик следующего месяца", "group_id": str(uuid.uuid4()),
            "group_name": "Группа", "lesson_type": "group", "fee_overridden": True, "amount": total, "counted": 1, "unpaid": 0, "pending_excused": 0, "written_off": 0,
            "undecided": 0, "no_pay": 0, "marks": []}
    row = PayrollSheet(org_id=org, teacher_id=uuid.UUID(teacher), period_month=date.fromisoformat(month), percent_inputs={}, divisor_default=12, lines=[line], total_amount=total,
                       source_fingerprint="e2e", revision=1, created_by=uuid.UUID(owner), updated_by=uuid.UUID(owner))
    db.add(row)
    db.commit()
    print(row.id)
`;

/** Writes the sheet (saved now) and returns its id. */
export function seedSheet(ownerUserId: string, teacherUserId: string, firstOfMonth: string, total: number): string {
  const run = spawnSync("docker", ["exec", "-i", authContainer(), "python", "-", ownerUserId, teacherUserId, firstOfMonth, String(total)], { input: SCRIPT, encoding: "utf8" });
  if (run.status !== 0) throw new Error(`the sheet was not seeded: ${(run.stderr || run.stdout).slice(-600)}`);
  return run.stdout.trim().split("\n").pop() as string;
}
