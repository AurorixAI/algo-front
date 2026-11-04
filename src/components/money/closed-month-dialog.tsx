"use client";

import { useState, type ReactNode } from "react";
import type { PeriodClosedInfo } from "@/lib/closed-period";
import { Modal } from "@/components/ui/modal";
import { PeriodClosedNotice } from "./period-closed-notice";

/**
 * R3 m4: «месяц закрыт» told to a person who asked for an action that has no window of its own (the question of «Сбросить решение» is the platform's confirm): the sentence of the server
 * and - for the money right - «Переоткрыть месяц» of exactly that teacher and month, the same notice every other window has.  After the reopening `retry` runs the action again.
 */
export function useClosedMonthDialog(aboveLessonPanel = false): { show: (info: PeriodClosedInfo, retry: () => void) => void; node: ReactNode } {
  const [shown, setShown] = useState<{ info: PeriodClosedInfo; retry: () => void } | null>(null);
  const node = (
    <Modal open={shown !== null} title="Месяц закрыт" onClose={() => setShown(null)} maxWidthClassName="max-w-md" aboveLessonPanel={aboveLessonPanel}
      footer={<button type="button" onClick={() => setShown(null)} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100">Закрыть</button>}>
      {shown && <PeriodClosedNotice info={shown.info} aboveLessonPanel={aboveLessonPanel} onReopened={() => { const again = shown.retry; setShown(null); again(); }} />}
    </Modal>
  );
  return { show: (info, retry) => setShown({ info, retry }), node };
}
