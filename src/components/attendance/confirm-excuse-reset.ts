import { orgApi, type AttendanceExcuseItem } from "@/lib/api";
import { askConfirm } from "@/lib/confirm-dialog";
import { resetDecisionQuestion } from "@/lib/excuse-decision";
import { effectLines, effectLineTexts, moneyEffectsOf } from "@/lib/money-effects";

/**
 * Money-1 A3 (I-5): «Сбросить решение» asks first.  The money of THIS reset is the dry run of the server (`?dry_run=true`); the question names it, the person answers.
 * true: reset; false: the person went back.  A failure of the dry run (a closed month, a changed excuse, a dead network) is thrown - the caller words it.
 */
export async function confirmExcuseReset(excuse: { id: string; status: AttendanceExcuseItem["status"] }): Promise<boolean> {
  const block = moneyEffectsOf(await orgApi.resetAttendanceExcuse(excuse.id, { expected_status: excuse.status }, { dryRun: true }));
  return askConfirm(resetDecisionQuestion(block ? effectLineTexts(effectLines(block)) : null));
}
