"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PauseCircle } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import { formerStayHasPauses } from "@/lib/membership-learning";
import { livePauses, type PauseOut } from "@/lib/payments-logica";
import { PauseDialog } from "@/components/payments/pause-dialog";
import { Button } from "@/components/ui/button";

export const FORMER_PAUSES_LABEL = "Паузы";

/**
 * PAY-TAILS Б11.50 Э7: the entry to the window of the pauses of a FORMER stay (left, transferred, archived) from the history of enrolments of the card.  The list of the pauses is read by the same request as for an
 * active stay; the action shows only while there is a pause with locked days (a leaving / transfer cut it) or one that is not over; the window opens with `active = false` (no form of a new pause).  The right is
 * that of «Пауза…» - the caller renders this only for the owner and an administrator with the money right.
 */
export function FormerStayPauses({ membershipId, groupName, studentName, onNotify, onChanged }: {
  membershipId: string;
  groupName: string;
  studentName: string;
  onNotify?: (text: string, type?: "success" | "error" | "warning") => void;
  onChanged?: () => void;
}) {
  const today = useMemo(() => formatBusinessDate(), []);
  const [pauses, setPauses] = useState<PauseOut[]>([]);
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    try { setPauses(livePauses(await orgApi.listPauses(membershipId))); } catch { setPauses([]); }
  }, [membershipId]);
  useEffect(() => { void load(); }, [load]);
  if (!formerStayHasPauses(pauses, today) && !open) return null;
  return (
    <>
      <Button type="button" variant="ghost" size="sm" data-testid="former-pauses" aria-label={`${FORMER_PAUSES_LABEL}: ${groupName}`} onClick={() => setOpen(true)} className="min-h-8 text-primary-700 hover:text-primary-800">
        <PauseCircle className="h-3.5 w-3.5" />
        {FORMER_PAUSES_LABEL}
      </Button>
      {open && (
        <PauseDialog
          open
          active={false}
          membershipId={membershipId}
          studentName={studentName}
          groupName={groupName}
          onClose={() => setOpen(false)}
          onChanged={(_row, text) => { onNotify?.(text, "success"); void load(); onChanged?.(); }}
        />
      )}
    </>
  );
}
