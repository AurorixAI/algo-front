/**
 * Money-1 R3 #15: what an action of the money of a student does to the packs and the saved sheets is shown BEFORE the button is pressed - the server answers the same request
 * with `?dry_run=true` (no `Idempotency-Key`, nothing is written).  Pure: the keys and the bodies of those asks, and the words of a transfer's «что переедет».
 */
import { CARRY_OVER_CODE, TRANSFER_BALANCE_CODE } from "./payments";

/** A dry run of a cancel needs a reason too (the server checks it like the real one); the person has not typed it yet. */
export const DRY_RUN_REASON = "Проверка последствий";

export interface CarriedLine {
  code: string;
  message: string;
  /** The student the line is about (a bulk transfer names them; a single transfer has no such field). */
  studentId?: string;
}

/**
 * What a transfer (dry or real) says about the money, in the words of the server.  A single transfer carries it in `carried[]` (and in `warnings[]`); a BULK one only in `warnings[]` with the
 * `student_id`; `carry_after.text` is the same sentence of the balance (the last resort).  The sentence of the balance («Перенесено 640 000 сум; аванс останется 640 000 сум. Со следующего дня
 * начислят ещё 350 000 сум…») starts with what arrived, so the older «Остаток денег 640 000 сум перенесён в «…»» of the same student is not said next to it (rule 87).  When several students are
 * transferred, `names` (id → name) puts the name before each of their lines.
 */
export function carriedOf(answer: unknown, names?: ReadonlyMap<string, string> | null): CarriedLine[] {
  const source = (answer ?? {}) as { carried?: unknown; warnings?: unknown; carry_after?: { text?: unknown } | null };
  const lines: CarriedLine[] = [];
  const seen = new Set<string>();
  const take = (raw: unknown, onlyMoney: boolean) => {
    if (!Array.isArray(raw)) return;
    for (const item of raw) {
      const entry = item as { code?: unknown; message?: unknown; student_id?: unknown } | null;
      const message = typeof entry?.message === "string" ? entry.message.trim() : "";
      const code = String(entry?.code ?? "");
      if (!message || (onlyMoney && code !== CARRY_OVER_CODE && code !== TRANSFER_BALANCE_CODE)) continue;
      const studentId = typeof entry?.student_id === "string" && entry.student_id ? entry.student_id : undefined;
      const key = `${code}|${studentId ?? ""}|${message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(studentId ? { code, message, studentId } : { code, message });
    }
  };
  take(source.carried, false);
  take(source.warnings, true);
  const text = typeof source.carry_after?.text === "string" ? source.carry_after.text.trim() : "";
  if (text && !lines.some((line) => line.code === TRANSFER_BALANCE_CODE)) lines.push({ code: TRANSFER_BALANCE_CODE, message: text });
  // the sentence of the balance already says what arrived
  const balanceOf = new Set(lines.filter((line) => line.code === TRANSFER_BALANCE_CODE).map((line) => line.studentId ?? ""));
  const shown = lines.filter((line) => !(line.code === CARRY_OVER_CODE && balanceOf.has(line.studentId ?? "")));
  const students = new Set(shown.map((line) => line.studentId).filter(Boolean));
  if (students.size < 2 || !names) return shown;
  return shown.map((line) => {
    const name = line.studentId ? names.get(line.studentId) : undefined;
    return name ? { ...line, message: `${name}: ${line.message}` } : line;
  });
}

export const CARRIED_NONE_TEXT = "Деньги не изменятся: в прошлой группе у ученика нет оплат и долга.";

/**
 * One sentence of the server about a transfer as ROWS (re-audit В2: «абзац 15 px, а не строки»): its parts divided by «; » are lines of their own («…пойдут на остаток месяца» / «аванс останется 360 000 сум»).
 * The words are the server's; only the line breaks are ours.
 */
export function carriedRows(message: string): string[] {
  const parts = message.split(/;\s+/).map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [message];
}
