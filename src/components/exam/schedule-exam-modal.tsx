"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Check, Clock3, MapPin, Users, X } from "lucide-react";
import { orgApi, type Group, type ScheduleOccurrence } from "@/lib/api";
import { businessTimeMinutes, formatBusinessDate, formatIsoDateLabel } from "@/lib/business-time";
import { bindableLessons, occurrenceKey, selectionLost } from "@/lib/exam-lessons";
import { createRequestSequence } from "@/lib/request-sequence";
import { useNow } from "@/lib/use-now";
import { useScrollLock } from "@/components/ui/modal";

type ScheduledExamSelection = {
  group: Group;
  occurrence: ScheduleOccurrence;
};

type ScheduleExamModalProps = {
  examTitle: string;
  groups: Group[];
  initialGroupId?: string | null;
  deliveryMode?: "online" | "print";
  /** A lobby may be safely moved before any student session exists. */
  intent?: "schedule" | "reschedule";
  onClose: () => void;
  onSubmit: (selection: ScheduledExamSelection) => Promise<void>;
};

function addDays(isoDate: string, days: number): string {
  const value = new Date(`${isoDate}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function occurrenceLabel(item: ScheduleOccurrence): string {
  const date = formatIsoDateLabel(item.occurrenceDate, {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
  return `${date} · ${item.startTime}–${item.endTime}`;
}

/**
 * Binds an exam to one exact scheduled occurrence. Online delivery opens its
 * lobby afterwards; print delivery freezes the printable package instead.
 */
export function ScheduleExamModal({
  examTitle,
  groups,
  initialGroupId,
  deliveryMode = "online",
  intent = "schedule",
  onClose,
  onSubmit,
}: ScheduleExamModalProps) {
  const isPrintDelivery = deliveryMode === "print";
  const isReschedule = intent === "reschedule";
  const [groupId, setGroupId] = useState(initialGroupId || "");
  const [occurrences, setOccurrences] = useState<ScheduleOccurrence[]>([]);
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState("");
  const [loadingLessons, setLoadingLessons] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Attendance statuses of the chosen group's lessons: a completed / cancelled lesson can never open the exam.
  const [statuses, setStatuses] = useState<{ groupId: string; map: Record<string, string> } | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusNonce, setStatusNonce] = useState(0);
  // The dialog may stay open while a lesson ends: the list is re-filtered by the clock, not only when it opens.
  const clock = useNow(30_000);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === groupId) || null,
    [groupId, groups],
  );
  const statusesReady = statuses?.groupId === groupId;
  const groupOccurrences = useMemo(
    () => {
      if (!statusesReady || !statuses) return [];
      const at = new Date(clock);
      return bindableLessons(
        occurrences.filter((item) => item.groupId === groupId),
        { businessDate: formatBusinessDate(at), nowMinutes: businessTimeMinutes(at), statuses: statuses.map },
      );
    },
    [clock, groupId, occurrences, statuses, statusesReady],
  );
  const selectedOccurrence = useMemo(
    () => groupOccurrences.find((item) => occurrenceKey(item) === selectedOccurrenceId) || null,
    [groupOccurrences, selectedOccurrenceId],
  );
  // The lesson picked a moment ago was completed / cancelled / went over while the dialog stayed open.
  const selectionGone = statusesReady && selectionLost(selectedOccurrenceId, groupOccurrences);

  useEffect(() => {
    let cancelled = false;
    const dateFrom = formatBusinessDate();
    setLoadingLessons(true);
    setError(null);
    orgApi.getScheduleOccurrences({ dateFrom, dateTo: addDays(dateFrom, 42) })
      .then((items) => {
        if (!cancelled) setOccurrences(Array.isArray(items) ? items : []);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || "Не удалось загрузить ближайшие занятия");
      })
      .finally(() => {
        if (!cancelled) setLoadingLessons(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setSelectedOccurrenceId("");
  }, [groupId]);

  // Latest-read-wins: the first read of a group, the clock/focus refreshes and a group switch never overwrite each other.
  const statusReads = useRef(createRequestSequence());
  useEffect(() => {
    setStatuses(null);
    setStatusError(null);
    if (!groupId) return undefined;
    const token = statusReads.current.next();
    const dateFrom = formatBusinessDate();
    orgApi.getGroupAttendance(groupId, { dateFrom, dateTo: addDays(dateFrom, 42) })
      .then((attendance) => {
        if (statusReads.current.isCurrent(token)) setStatuses({ groupId, map: attendance?.statuses ?? {} });
      })
      .catch((err: Error) => {
        if (statusReads.current.isCurrent(token)) setStatusError(err.message || "Не удалось проверить статус занятий");
      });
    return () => { statusReads.current.next(); };
  }, [groupId, statusNonce]);

  // A lesson the teacher completes in another tab, or one that is cancelled, must leave the list while the dialog is
  // open: re-read the statuses on every clock tick and when the window gets focus back.  A failed refresh keeps the
  // last known statuses (the clock filter still works); only the first read of a group reports an error.
  const refreshStatuses = useRef<() => void>(() => {});
  useEffect(() => {
    refreshStatuses.current = () => {
      if (!groupId || !statusesReady) return;
      const token = statusReads.current.next();
      const dateFrom = formatBusinessDate();
      orgApi.getGroupAttendance(groupId, { dateFrom, dateTo: addDays(dateFrom, 42) })
        .then((attendance) => {
          if (statusReads.current.isCurrent(token)) setStatuses({ groupId, map: attendance?.statuses ?? {} });
        })
        .catch(() => { /* keep what is known */ });
    };
  });
  useEffect(() => { refreshStatuses.current(); }, [clock]);
  useEffect(() => {
    const onFocus = () => refreshStatuses.current();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // This dialog may be opened from a layout that has its own scrolling or a transformed ancestor.  Rendering through
  // ``body`` guarantees that the backdrop covers the complete viewport rather than only the page column; the page
  // scroll is locked by the shared hook (it is mounted only while the dialog is open).
  useScrollLock(true);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, submitting]);

  const handleSubmit = async () => {
    if (!selectedGroup || !selectedOccurrence) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ group: selectedGroup, occurrence: selectedOccurrence });
    } catch (err: any) {
      setError(err?.message || "Не удалось назначить экзамен на занятие");
      setSubmitting(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex h-[100dvh] w-screen items-center justify-center overflow-y-auto p-4 sm:p-6" role="dialog" aria-modal="true" aria-label={isPrintDelivery ? "Подготовить печатный комплект" : "Назначить экзамен на занятие"}>
      <button aria-label="Закрыть" className="absolute inset-0 z-0 h-full w-full bg-slate-950/60 backdrop-blur-sm" onClick={onClose} disabled={submitting} />
      <section className="relative z-10 my-auto w-full max-w-2xl overflow-hidden rounded-[28px] bg-white shadow-[0_32px_100px_rgba(15,23,42,0.35)] ring-1 ring-black/5">
        <header className="relative overflow-hidden bg-gradient-to-br from-primary-600 via-primary-600 to-violet-600 px-6 py-6 text-white sm:px-7 sm:py-7">
          <div className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/3 h-32 w-72 rounded-full bg-violet-300/20 blur-2xl" />
          <button type="button" onClick={onClose} disabled={submitting} className="absolute right-5 top-5 z-20 rounded-xl p-2 text-white/85 transition-colors hover:bg-white/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-50" aria-label="Закрыть">
            <X className="h-4 w-4" />
          </button>
          <div className="relative flex items-center gap-3.5 pr-10">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20 shadow-inner"><CalendarDays className="h-5 w-5" /></div>
            <div>
              <p className="text-xs font-semibold tracking-wide text-white/70">{isPrintDelivery ? "ПОДГОТОВКА ПЕЧАТНОГО КОМПЛЕКТА" : isReschedule ? "ПЕРЕНОС ПРОВЕДЕНИЯ" : "НАЗНАЧЕНИЕ НА ЗАНЯТИЕ"}</p>
              <h2 className="mt-1 truncate text-lg font-bold tracking-tight">{examTitle}</h2>
            </div>
          </div>
        </header>

        <div className="space-y-6 bg-gradient-to-b from-slate-50/80 via-white to-white p-6 sm:p-7">
          <p className="max-w-xl text-sm leading-6 text-slate-600">
            {isPrintDelivery
              ? "Выберите группу и конкретное занятие. После подтверждения будет зафиксирован печатный комплект: бланки для учеников и закрытый ключ для преподавателя."
              : isReschedule
                ? "Выберите новое конкретное занятие. Старый код доступа будет закрыт, а для нового урока система создаст новый код. Задания и варианты сохранятся без изменений."
                : "Выберите группу и конкретное ближайшее занятие. После подтверждения откроется лобби и будет создан код для учеников."}
          </p>

          <div className="space-y-3">
            <div className="flex items-center gap-2.5 px-0.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-[11px] font-extrabold text-primary-700">1</span>
              <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-600">Группа</p>
              <span className="text-xs text-slate-400">Выберите класс</span>
            </div>
            <div className="grid max-h-40 grid-cols-1 gap-2 overflow-y-auto rounded-2xl bg-slate-100/80 p-2 sm:grid-cols-2">
              {groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setGroupId(group.id)}
                  className={`flex min-h-14 items-center justify-between rounded-xl px-3.5 py-3 text-left transition-all ${group.id === groupId ? "bg-white text-primary-800 shadow-sm ring-1 ring-primary-300" : "bg-white/70 text-slate-700 ring-1 ring-slate-200/70 hover:bg-white hover:shadow-xs hover:ring-slate-300"}`}
                >
                  <span className="flex min-w-0 items-center gap-2.5"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${group.id === groupId ? "bg-primary-100 text-primary-600" : "bg-white/75 text-indigo-500"}`}><Users className="h-4 w-4" /></span><span className="truncate text-sm font-bold">{group.name}</span></span>
                  {group.id === groupId && <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-600 text-white shadow-sm"><Check className="h-3.5 w-3.5" /></span>}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2.5 px-0.5">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-extrabold ${selectedGroup ? "bg-primary-100 text-primary-700" : "bg-slate-200 text-slate-500"}`}>2</span>
              <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-600">Занятие</p>
              {selectedGroup && <span className="text-xs text-slate-400">Ближайшее по расписанию</span>}
            </div>
            {loadingLessons || (selectedGroup && !statusesReady && !statusError) ? (
              <div className="rounded-2xl bg-slate-100/80 px-4 py-4 text-sm font-medium text-slate-500">Загружаем ближайшие занятия…</div>
            ) : !selectedGroup ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-4 text-sm text-slate-400">Сначала выберите группу.</div>
            ) : statusError ? (
              <div className="flex flex-col gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm text-rose-700 sm:flex-row sm:items-center sm:justify-between">
                <span>Не удалось проверить статус занятий: {statusError}</span>
                <button type="button" onClick={() => setStatusNonce((value) => value + 1)} className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200 transition-colors hover:bg-rose-100">Повторить</button>
              </div>
            ) : groupOccurrences.length === 0 ? (
              <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3.5 text-sm text-amber-800">В ближайшие 42 дня у этой группы нет подходящих занятий. Завершённые, отменённые и уже прошедшие занятия не показываются.</div>
            ) : (
              <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-2xl bg-slate-100/80 p-1.5 pr-2">
                {groupOccurrences.map((item) => {
                  const itemId = occurrenceKey(item);
                  const selected = itemId === selectedOccurrenceId;
                  return (
                    <button
                      key={itemId}
                      type="button"
                      onClick={() => setSelectedOccurrenceId(itemId)}
                      className={`flex w-full items-center justify-between rounded-xl p-3.5 text-left transition-all ${selected ? "bg-white shadow-sm ring-1 ring-primary-200" : "hover:bg-white/80"}`}
                    >
                      <span className="min-w-0"><span className="flex items-center gap-2 text-sm font-bold text-slate-800"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-primary-100 text-primary-600" : "bg-white/80 text-slate-500"}`}><Clock3 className="h-4 w-4" /></span>{occurrenceLabel(item)}</span><span className="ml-10 mt-1 flex items-center gap-1.5 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" />{item.format === "online" ? "Онлайн" : item.room || "Кабинет не указан"}{item.isRescheduled ? " · перенесённое занятие" : ""}</span></span>
                      {selected && <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-600 text-white shadow-sm"><Check className="h-3.5 w-3.5" /></span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectionGone && (
            <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">Выбранное занятие больше недоступно — выберите другое</p>
          )}

          {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">{error}</p>}

          <footer className="flex flex-col-reverse gap-2 rounded-2xl bg-slate-50 p-2.5 sm:flex-row sm:items-center sm:justify-end">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-white hover:text-slate-900">Отмена</button>
            <button type="button" disabled={!selectedOccurrence || submitting} onClick={handleSubmit} className="rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm shadow-primary-500/20 transition-all hover:from-primary-700 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
              {submitting
                ? (isPrintDelivery ? "Подготавливаем…" : isReschedule ? "Переносим…" : "Назначаем…")
                : (isPrintDelivery ? "Подготовить печатный комплект" : isReschedule ? "Перенести экзамен" : "Назначить и открыть лобби")}
            </button>
          </footer>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export type { ScheduledExamSelection };
