"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Check, Clock3, MapPin, Users, X } from "lucide-react";
import { orgApi, type Group, type ScheduleOccurrence } from "@/lib/api";
import { formatBusinessDate, formatIsoDateLabel } from "@/lib/business-time";

type ScheduledExamSelection = {
  group: Group;
  occurrence: ScheduleOccurrence;
};

type ScheduleExamModalProps = {
  examTitle: string;
  groups: Group[];
  initialGroupId?: string | null;
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
 * The only UI that opens a public exam lobby. It deliberately makes the
 * teacher select a concrete schedule occurrence instead of guessing from a
 * recurring group schedule.
 */
export function ScheduleExamModal({
  examTitle,
  groups,
  initialGroupId,
  onClose,
  onSubmit,
}: ScheduleExamModalProps) {
  const [groupId, setGroupId] = useState(initialGroupId || "");
  const [occurrences, setOccurrences] = useState<ScheduleOccurrence[]>([]);
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState("");
  const [loadingLessons, setLoadingLessons] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === groupId) || null,
    [groupId, groups],
  );
  const groupOccurrences = useMemo(
    () => occurrences.filter((item) => item.groupId === groupId),
    [groupId, occurrences],
  );
  const selectedOccurrence = useMemo(
    () => groupOccurrences.find((item) => `${item.occurrenceDate}_${item.id}` === selectedOccurrenceId) || null,
    [groupOccurrences, selectedOccurrenceId],
  );

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

  // This dialog may be opened from a layout that has its own scrolling or a
  // transformed ancestor. Rendering through ``body`` guarantees that the
  // backdrop covers the complete viewport rather than only the page column.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
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
    <div className="fixed inset-0 z-[200] flex min-h-[100dvh] items-center justify-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label="Назначить экзамен на занятие">
      <button aria-label="Закрыть" className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} disabled={submitting} />
      <section className="relative my-auto w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="bg-gradient-to-r from-primary-600 to-violet-600 p-5 text-white">
          <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 hover:bg-white/20" aria-label="Закрыть">
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3 pr-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20"><CalendarDays className="h-5 w-5" /></div>
            <div>
              <p className="text-xs font-medium text-white/75">Назначить на занятие</p>
              <h2 className="mt-0.5 truncate text-sm font-bold">{examTitle}</h2>
            </div>
          </div>
        </header>

        <div className="space-y-4 p-5">
          <p className="text-sm leading-6 text-slate-600">
            Выберите группу и конкретное ближайшее занятие. После подтверждения откроется лобби и будет создан код для учеников.
          </p>

          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Группа</p>
            <div className="grid max-h-36 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setGroupId(group.id)}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors ${group.id === groupId ? "border-primary-500 bg-primary-50 ring-2 ring-primary-500/15" : "border-slate-200 hover:bg-slate-50"}`}
                >
                  <span className="flex min-w-0 items-center gap-2"><Users className="h-4 w-4 shrink-0 text-indigo-500" /><span className="truncate text-sm font-semibold text-slate-800">{group.name}</span></span>
                  {group.id === groupId && <Check className="h-4 w-4 shrink-0 text-primary-600" />}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Занятие</p>
            {loadingLessons ? (
              <div className="rounded-xl border border-slate-200 px-3 py-4 text-sm text-slate-500">Загружаем ближайшие занятия…</div>
            ) : !selectedGroup ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-400">Сначала выберите группу.</div>
            ) : groupOccurrences.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">В ближайшие 42 дня у этой группы нет занятий в расписании.</div>
            ) : (
              <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                {groupOccurrences.map((item) => {
                  const itemId = `${item.occurrenceDate}_${item.id}`;
                  const selected = itemId === selectedOccurrenceId;
                  return (
                    <button
                      key={itemId}
                      type="button"
                      onClick={() => setSelectedOccurrenceId(itemId)}
                      className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-colors ${selected ? "border-primary-500 bg-primary-50 ring-2 ring-primary-500/15" : "border-slate-200 hover:bg-slate-50"}`}
                    >
                      <span className="min-w-0"><span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Clock3 className="h-4 w-4 text-primary-600" />{occurrenceLabel(item)}</span><span className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" />{item.format === "online" ? "Онлайн" : item.room || "Кабинет не указан"}{item.isRescheduled ? " · перенесённое занятие" : ""}</span></span>
                      {selected && <Check className="h-4 w-4 shrink-0 text-primary-600" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">{error}</p>}

          <footer className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">Отмена</button>
            <button type="button" disabled={!selectedOccurrence || submitting} onClick={handleSubmit} className="rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50">
              {submitting ? "Назначаем…" : "Назначить и открыть лобби"}
            </button>
          </footer>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export type { ScheduledExamSelection };
