/**
 * W1 F3 (S5): the words of «Вернуть урок» - a cancelled lesson that has not started yet is planned again.  The owner / administrator says why (it stays in the history).
 * Pure texts; the rule «who and when» is `canRestoreLesson` of `schedule-card-actions.ts`.
 */
export const RESTORE_REASON_LABEL = "Причина возврата";

/** What the return does, in one line: the lesson is planned again; the exams taken off it at the cancellation do not come back (the server says the same after the save). */
export const RESTORE_NOTE = "Урок снова станет запланированным. Экзамены, снятые с него при отмене, не вернутся — назначьте их заново.";

/** A lesson cancelled «по вине центра» may have been deducted from the students: the deduction goes away with the cancellation (it is derived, the server does not keep it). */
export const RESTORE_NOTE_CENTRE = "Урок снова станет запланированным, вычет у учеников (если он был) исчезнет. Экзамены, снятые с урока при отмене, не вернутся — назначьте их заново.";
