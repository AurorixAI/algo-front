/**
 * R3 M2 (I-6): a TRANSFER of a student to another group carries his paid days and advance over - it moves money, so it is for the owner and for an administrator with the money
 * right.  Everybody else adds: the student stays in his group and is written into the second one too (the server refuses a transfer of such a person with 403 `MONEY_RIGHT_REQUIRED`).
 * The window says what «Добавить» does in that case - he will pay in both groups - because that is the part nobody sees.  Pure: no React, no network.
 */
import type { GroupJoinMode } from "./api";

/** The mode that goes to the server: the choice of the person when he may move money, otherwise «add». */
export function effectiveEnrolMode(chosen: GroupJoinMode, moneyRight: boolean): GroupJoinMode {
  return moneyRight ? chosen : "add";
}

export const ENROL_TRANSFER_NEEDS_RIGHT = "Перевести с переносом оплат может владелец или администратор с правом на деньги";

/** «Иванов Иван уже в группе 7-А. «Добавить» запишет его во вторую группу — оплата будет в обеих. Перевести …» */
export function secondGroupLine(student: { name: string; from: string }): string {
  return `${student.name} уже в группе ${student.from}. «Добавить» запишет его во вторую группу — оплата будет в обеих. ${ENROL_TRANSFER_NEEDS_RIGHT}`;
}
