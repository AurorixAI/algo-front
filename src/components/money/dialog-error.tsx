"use client";

import { type PeriodClosedInfo } from "@/lib/closed-period";
import { Notice } from "@/components/ui/notice";
import { PeriodClosedNotice } from "./period-closed-notice";

/**
 * R3 m7: the failure under the form of a money dialog: a closed month is the sentence of the server with the way out («Переоткрыть месяц»), any other failure is a red line in the words
 * `text` gives it; nothing at all when there is no failure.  `onReopened` runs after the month was reopened (the dialog asks again).
 */
export function DialogError({ error, closed, text, onReopened, aboveLessonPanel = false }: {
  error: unknown;
  closed: PeriodClosedInfo | null;
  text: (error: unknown) => string;
  onReopened: () => void;
  aboveLessonPanel?: boolean;
}) {
  if (closed) return <PeriodClosedNotice info={closed} aboveLessonPanel={aboveLessonPanel} onReopened={onReopened} />;
  if (error === null || error === undefined) return null;
  return <Notice variant="error" compact>{text(error)}</Notice>;
}
