/**
 * Money-1 R3 #15: what an action of the money of a student does to the packs and the saved sheets is shown BEFORE the button is pressed - the server answers the same request
 * with `?dry_run=true` (no `Idempotency-Key`, nothing is written).  Pure: the keys and the bodies of those asks, and the words of a transfer's «что переедет».
 */
import { CARRY_OVER_CODE, PAID_DAYS_CARRIED_CODE, TRANSFER_BALANCE_CODE } from "./payments";
import { tidyMoneyText } from "./money-format";

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
      if (!message || (onlyMoney && code !== CARRY_OVER_CODE && code !== TRANSFER_BALANCE_CODE && code !== PAID_DAYS_CARRIED_CODE)) continue;
      const studentId = typeof entry?.student_id === "string" && entry.student_id ? entry.student_id : undefined;
      const key = `${code}|${studentId ?? ""}|${message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const tidy = tidyMoneyText(message);
      lines.push(studentId ? { code, message: tidy, studentId } : { code, message: tidy });
    }
  };
  take(source.carried, false);
  take(source.warnings, true);
  const text = typeof source.carry_after?.text === "string" ? source.carry_after.text.trim() : "";
  if (text && !lines.some((line) => line.code === TRANSFER_BALANCE_CODE)) lines.push({ code: TRANSFER_BALANCE_CODE, message: tidyMoneyText(text) });
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

export interface ClosingPriceLine {
  /** The student of a bulk transfer; absent for a single one. */
  studentId?: string;
  /** The sentence of the server as it came («У ученика индивидуальная цена 300 000 сум в группе «Алгебра 7»: в новой группе она не действует — будет цена группы 400 000 сум»). */
  text: string;
}

/**
 * Money-1 V: an individual price does not follow the student into the new group - the dry run of the transfer says so in `closing_prices[].text` (a single transfer: at the top; a bulk one:
 * `students[].closing_prices`).  One line per price in the server's own words (the price is never worked out here); a bulk transfer puts the name before the line when `names` knows it.
 * A role without the right to money gets no such field: no lines, the transfer goes on.
 */
export function closingPricesOf(answer: unknown, names?: ReadonlyMap<string, string> | null): ClosingPriceLine[] {
  const source = (answer ?? {}) as { closing_prices?: unknown; students?: unknown };
  const lines: ClosingPriceLine[] = [];
  const take = (raw: unknown, studentId?: string) => {
    if (!Array.isArray(raw)) return;
    for (const item of raw) {
      const text = typeof (item as { text?: unknown } | null)?.text === "string" ? ((item as { text: string }).text).trim() : "";
      if (!text) continue;
      const name = studentId ? names?.get(studentId) : undefined;
      lines.push({ ...(studentId ? { studentId } : {}), text: tidyMoneyText(name ? `${name}: ${text}` : text) });
    }
  };
  take(source.closing_prices);
  if (Array.isArray(source.students)) {
    for (const student of source.students as Array<{ student_id?: unknown; closing_prices?: unknown } | null>) {
      take(student?.closing_prices, typeof student?.student_id === "string" ? student.student_id : undefined);
    }
  }
  return lines;
}

/** How many lines of the warnings stand open before «и ещё N». */
export const CLOSING_PRICES_SHOWN = 5;
