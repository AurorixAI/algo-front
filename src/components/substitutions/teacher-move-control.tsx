"use client";

import { useEffect } from "react";
import type { Lesson } from "@/lib/api";
import { businessWallTimeToInstant, formatIsoDateLabel } from "@/lib/business-time";
import { useAuthStore } from "@/lib/store";
import { useNow } from "@/lib/use-now";
import { lessonStartMs, teacherMoveControl } from "@/lib/substitutions";
import { LessonActionSheet } from "@/components/groups/lesson-action-sheet";

/** The lesson the control moves (the fields of the teacher's schedule occurrence). */
export interface MovableLesson {
  groupId: string;
  groupName: string;
  lessonId: string;
  lessonDate: string;
  startTime: string;
  endTime: string;
  room?: string | null;
  format?: "offline" | "online";
  topic?: string | null;
}

/**
 * P1.1 on the lesson panel of the teacher: «Перенести урок» on his own future lesson - the dialog is the administrator's one
 * (`LessonActionSheet`, date / time / room / reason and the live check of the busy time).  In the last hour before the start the button gives way to
 * the hint (the server says `MOVE_TOO_LATE`); «Не смогу провести» stays next to it.
 */
export function TeacherMoveControl({
  lesson,
  lessonTeacherId,
  isSubstitution,
  lessonStatus,
  open,
  onOpenChange,
  onKind,
  onDialogChange,
  onMoved,
}: {
  lesson: MovableLesson;
  lessonTeacherId?: string | null;
  isSubstitution?: boolean;
  lessonStatus: string | null | undefined;
  /** The dialog is opened from the «⋯» menu of the panel (the page holds the state); this control keeps the dialog itself. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the control is now: `button` = the menu offers «Перенести урок», `late` = the menu shows it off with the reason, `none` = no item. */
  onKind?: (kind: "none" | "button" | "late") => void;
  /** The page holds its own Escape key while a dialog is above it. */
  onDialogChange?: (open: boolean) => void;
  /** After the lesson was moved (the toast text; the page shows it - this control goes away with the panel): the panel closes and the schedule is read again. */
  onMoved: (text: string) => void;
}) {
  const { user } = useAuthStore();
  const now = useNow(30_000, true);
  const control = teacherMoveControl({
    role: user?.org_role ?? user?.role ?? null,
    userId: user?.id,
    lessonTeacherId,
    isSubstitution,
    lessonStatus,
    startsAtMs: lessonStartMs(lesson.lessonDate, lesson.startTime, businessWallTimeToInstant),
    nowMs: now,
  });
  const kind = control.kind;
  useEffect(() => { onKind?.(kind); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  // The page's Escape key leaves the panel alone while the dialog is above it; «closed» is told one tick later, after the same key press has passed the page's own listener.
  useEffect(() => {
    if (open) { onDialogChange?.(true); return undefined; }
    const timer = window.setTimeout(() => onDialogChange?.(false), 0);
    return () => window.clearTimeout(timer);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // the page's Escape key must not stay held when the control goes away (the panel closes, the lesson changes) with the dialog open
  useEffect(() => () => { window.setTimeout(() => onDialogChange?.(false), 0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sheetLesson: Lesson = {
    id: lesson.lessonId, date: lesson.lessonDate, startTime: lesson.startTime, endTime: lesson.endTime, room: lesson.room, format: lesson.format, topic: lesson.topic ?? undefined,
  };
  // an open dialog is never taken away by the clock: crossing the 60-minute line makes the SERVER answer MOVE_TOO_LATE in the dialog, with its own words
  return (
    <LessonActionSheet
      moveOnly
      aboveLessonPanel
      lesson={open ? sheetLesson : null}
      groupId={lesson.groupId}
      title={lesson.groupName || "Урок"}
      subtitle={`${formatIsoDateLabel(lesson.lessonDate, { weekday: "short", day: "numeric", month: "long" })} · ${lesson.startTime}–${lesson.endTime}`}
      teacherLine={null}
      actions={["reschedule"]}
      onClose={() => onOpenChange(false)}
      onChanged={(text) => { onOpenChange(false); onMoved(text); }}
      onRefresh={() => { onOpenChange(false); onMoved(""); }}
    />
  );
}
