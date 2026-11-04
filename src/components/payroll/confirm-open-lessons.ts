import { askConfirm } from "@/lib/confirm-dialog";
import { gateOfConfirmRefusal, isOpenLessonsConfirm, openLessonsQuestion, type OpenLessonsGate } from "@/lib/payroll-open-lessons";

/**
 * Money-1 I-4: asked before a sheet of a month that is over is saved (the save closes the month) - the one thing the server cannot see: a failed check (`unknown`).
 * true: save; false: the owner went back.  Nothing to ask (`none`) is a yes without a window.
 */
export async function confirmUnfinishedLessons(gate: OpenLessonsGate): Promise<boolean> {
  if (gate.kind === "none") return true;
  const question = openLessonsQuestion(gate);
  return question ? askConfirm(question) : true;
}

/**
 * R3 m3: the save and the re-save of a sheet ask the owner what the SERVER asks.  `send(false)` first; when the server answers 409 `OPEN_LESSONS_CONFIRM_REQUIRED` (new unresolved lessons the
 * owner has not confirmed), the window shows its sentence and its list, and only «Сохранить всё равно» sends the same request again with `true`.  Any other failure is thrown to the caller.
 * `asking(true / false)` brackets the window, so a screen can stop showing «Сохраняем…» while the owner reads.
 * Returns `{ cancelled: true }` when the owner went back (nothing was saved).
 */
export async function sendConfirmingOpenLessons<T>(
  send: (confirmOpenLessons: boolean) => Promise<T>,
  asking: (open: boolean) => void = () => {},
): Promise<{ cancelled: false; value: T } | { cancelled: true }> {
  try {
    return { cancelled: false, value: await send(false) };
  } catch (refusal) {
    if (!isOpenLessonsConfirm(refusal)) throw refusal;
    asking(true);
    const yes = await confirmUnfinishedLessons(gateOfConfirmRefusal(refusal));
    asking(false);
    if (!yes) return { cancelled: true };
    return { cancelled: false, value: await send(true) };
  }
}
