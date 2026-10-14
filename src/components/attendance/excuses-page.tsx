"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import {
  DEMO_MODE,
  orgApi,
  type AttendanceExcuseFile,
  type AttendanceExcuseItem,
  type ExcuseReviewStatus,
} from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import {
  checkExcuseFile,
  EXCUSE_FILE_MAX_BYTES,
  EXCUSE_FILE_MAX_COUNT,
  EXCUSE_IMAGE_JPEG_QUALITY,
  EXCUSE_IMAGE_MAX_SIDE,
  fitWithin,
  formatDateRu,
  formatDateTimeRu,
  formatFileSize,
  monthLabelRu,
  monthOf,
  monthRangeOf,
  REVIEW_NOTE_MAX,
  shiftMonth,
} from "@/lib/attendance-excuses";
import { createRequestSequence } from "@/lib/request-sequence";
import { useExcuseBadge } from "@/lib/excuse-badge";
import { CascadingFilter } from "@/components/ui/cascading-filter";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

const PAGE_SIZE = 50;

/** Same columns for the header row and every entry on wide screens. */
const GRID_COLUMNS = "xl:grid xl:grid-cols-[104px_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,1.3fr)] xl:gap-x-4";

type Tab = ExcuseReviewStatus;

const STATUS_BADGE: Record<ExcuseReviewStatus, { label: string; className: string }> = {
  pending: { label: "Ожидает", className: "border-amber-300 bg-amber-50 text-amber-800" },
  confirmed: { label: "Подтверждён", className: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  rejected: { label: "Отклонён", className: "border-rose-300 bg-rose-50 text-rose-700" },
};

/** Shrink a photo so the longer side is at most 1600 px and re-encode it as JPEG. */
async function downscaleToJpeg(file: File): Promise<{ blob: Blob; name: string }> {
  let bitmap: ImageBitmap | HTMLImageElement;
  let width: number;
  let height: number;
  let cleanup = () => {};
  try {
    if (typeof createImageBitmap === "function") {
      // "from-image" applies the EXIF rotation of phone photos.
      const decoded = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
      bitmap = decoded;
      width = decoded.width;
      height = decoded.height;
      cleanup = () => decoded.close();
    } else {
      throw new Error("no createImageBitmap");
    }
  } catch {
    const url = URL.createObjectURL(file);
    cleanup = () => URL.revokeObjectURL(url);
    const image = new window.Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("decode"));
      image.src = url;
    });
    bitmap = image;
    width = image.naturalWidth;
    height = image.naturalHeight;
  }
  try {
    const size = fitWithin(width, height, EXCUSE_IMAGE_MAX_SIDE);
    if (!size.width || !size.height) throw new Error("empty");
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas");
    // JPEG has no alpha: a transparent PNG would turn black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    for (const quality of [EXCUSE_IMAGE_JPEG_QUALITY, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size > 0 && blob.size <= EXCUSE_FILE_MAX_BYTES) {
        const base = (file.name || "photo").replace(/\.[^.]+$/, "") || "photo";
        return { blob, name: `${base}.jpg` };
      }
    }
    throw new Error("too large");
  } finally {
    cleanup();
  }
}

function FileChip({
  file,
  onOpen,
  onDelete,
  busy,
}: {
  file: AttendanceExcuseFile;
  onOpen: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const isPdf = file.content_type === "application/pdf";
  return (
    <li className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs">
      {isPdf ? <FileText className="h-4 w-4 shrink-0 text-rose-500" /> : <ImageIcon className="h-4 w-4 shrink-0 text-sky-600" />}
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 truncate text-left font-medium text-slate-700 hover:text-primary-700" title="Открыть">
        {file.filename || (isPdf ? "Справка.pdf" : "Справка")}
        <span className="ml-1 font-normal text-slate-400">{formatFileSize(file.size_bytes)}</span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        aria-label="Удалить файл"
        title="Удалить файл"
        className="shrink-0 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </button>
    </li>
  );
}

export function ExcusesPage(props: { studentProfileBasePath: string }) {
  // The demo API has no excuse endpoints: show a note and request nothing.
  if (DEMO_MODE) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Раздел «Уважительные пропуски» недоступен в демонстрационном режиме.
      </div>
    );
  }
  return <ExcusesPageContent {...props} />;
}

function ExcusesPageContent({ studentProfileBasePath }: { studentProfileBasePath: string }) {
  const { showToast, toastNode } = useToast();
  // The list covers one calendar month on the business clock (Asia/Tashkent).
  const currentMonth = useMemo(() => monthOf(formatBusinessDate()), []);

  const [tab, setTab] = useState<Tab>("pending");
  const [month, setMonth] = useState(currentMonth);
  const { from: dateFrom, to: dateTo } = useMemo(() => monthRangeOf(`${month}-01`), [month]);
  const [filter, setFilter] = useState({ teacherId: "", groupId: "" });
  const [page, setPage] = useState(0);

  const [teachers, setTeachers] = useState<Array<{ id: string; first_name: string; last_name: string }>>([]);
  const [groups, setGroups] = useState<Array<{ id: string; name: string; teacher_id: string }>>([]);

  const [items, setItems] = useState<AttendanceExcuseItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [fileBusyId, setFileBusyId] = useState<string | null>(null);

  const [viewer, setViewer] = useState<{ file: AttendanceExcuseFile; url: string | null; error: string | null } | null>(null);
  const [fileToDelete, setFileToDelete] = useState<{ excuseId: string; file: AttendanceExcuseFile } | null>(null);

  const requests = useRef(createRequestSequence());
  const viewerRequests = useRef(createRequestSequence());

  // Teacher -> group directory for the cascading filter.
  useEffect(() => {
    let cancelled = false;
    Promise.all([orgApi.listMembers(), orgApi.listGroups()])
      .then(([members, groupList]) => {
        if (cancelled) return;
        setTeachers(
          (Array.isArray(members) ? members : [])
            .filter((m: any) => m.org_role === "teacher")
            .map((m: any) => {
              const [first = "", ...rest] = String(m.full_name || "").split(" ");
              return {
                id: m.user_id || m.id,
                first_name: m.first_name ?? first,
                last_name: m.last_name ?? rest.join(" "),
              };
            }),
        );
        const list: any[] = Array.isArray(groupList) ? groupList : (groupList as any)?.items || [];
        setGroups(list.map((g) => ({ id: g.id, name: g.name, teacher_id: g.teacher_id })));
      })
      .catch(() => { /* the filter just stays empty; the list itself still works */ });
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async (silent = false) => {
    const token = requests.current.next();
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const data = await orgApi.listAttendanceExcuses({
        status: tab,
        dateFrom,
        dateTo,
        groupId: filter.groupId || undefined,
        teacherId: filter.groupId ? undefined : filter.teacherId || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      if (!requests.current.isCurrent(token)) return;
      // The last item of a later page was handled: step back instead of showing an empty page.
      if ((data.items || []).length === 0 && page > 0) {
        setPage(Math.min(page - 1, Math.max(0, Math.ceil((data.total ?? 0) / PAGE_SIZE) - 1)));
        return;
      }
      setItems(data.items || []);
      setTotal(data.total ?? 0);
      setPendingTotal(data.pending_total ?? 0);
    } catch (error) {
      if (!requests.current.isCurrent(token)) return;
      setLoadError(error instanceof Error ? error.message : "Не удалось загрузить список");
    } finally {
      if (requests.current.isCurrent(token)) setLoading(false);
    }
  }, [dateFrom, dateTo, filter.groupId, filter.teacherId, page, tab]);

  useEffect(() => { void load(); }, [load]);

  // Object URL of the open certificate must not outlive the viewer.
  useEffect(() => () => { if (viewer?.url) URL.revokeObjectURL(viewer.url); }, [viewer?.url]);

  const resetPaging = () => setPage(0);
  const switchTab = (next: Tab) => { setTab(next); resetPaging(); };

  const markBusy = (id: string, on: boolean) =>
    setBusyIds((previous) => {
      const next = new Set(previous);
      if (on) next.add(id); else next.delete(id);
      return next;
    });

  const refreshBadge = () => { void useExcuseBadge.getState().refresh(true); };

  const review = async (item: AttendanceExcuseItem, decision: "confirmed" | "rejected") => {
    markBusy(item.id, true);
    try {
      const note = (notes[item.id] || "").trim();
      await orgApi.reviewAttendanceExcuse(item.id, { decision, ...(note ? { note } : {}) });
      showToast(decision === "confirmed" ? "Пропуск подтверждён" : "Пропуск отклонён");
      setNotes((previous) => { const next = { ...previous }; delete next[item.id]; return next; });
      await load(true);
      refreshBadge();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Не удалось сохранить решение", "error");
      void load(true);
    } finally {
      markBusy(item.id, false);
    }
  };

  const resetDecision = async (item: AttendanceExcuseItem) => {
    markBusy(item.id, true);
    try {
      await orgApi.resetAttendanceExcuse(item.id);
      showToast("Решение сброшено: пропуск снова ожидает");
      await load(true);
      refreshBadge();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Не удалось сбросить решение", "error");
    } finally {
      markBusy(item.id, false);
    }
  };

  // ── Files ───────────────────────────────────────────────────────────────
  const attachFile = async (item: AttendanceExcuseItem, picked: File | null | undefined) => {
    if (!picked) return;
    const check = checkExcuseFile(picked, item.files.length);
    if (!check.ok) {
      showToast(check.error || "Файл не подходит", "error");
      return;
    }
    setUploadingId(item.id);
    try {
      let blob: Blob = picked;
      let name = picked.name || "certificate";
      if (check.kind === "image") {
        try {
          const processed = await downscaleToJpeg(picked);
          blob = processed.blob;
          name = processed.name;
        } catch {
          showToast("Не удалось обработать фото. Приложите JPEG, PNG или PDF.", "error");
          return;
        }
      }
      const saved = await orgApi.uploadAttendanceExcuseFile(item.id, blob, name);
      setItems((previous) => previous.map((entry) =>
        entry.id === item.id ? { ...entry, files: [...entry.files, saved] } : entry,
      ));
      showToast("Справка приложена");
    } catch (error) {
      // 413 / 415 / 409 arrive with the server's own Russian text.
      showToast(error instanceof Error ? error.message : "Не удалось загрузить файл", "error");
    } finally {
      setUploadingId(null);
    }
  };

  const openFile = async (file: AttendanceExcuseFile) => {
    // Only the latest request may fill the viewer: a slow answer for a file that
    // was closed or replaced by another one is dropped.
    const token = viewerRequests.current.next();
    setViewer({ file, url: null, error: null });
    try {
      const blob = await orgApi.fetchAttendanceExcuseFile(file.id);
      if (!viewerRequests.current.isCurrent(token)) return;
      const typed = blob.type ? blob : new Blob([blob], { type: file.content_type });
      setViewer({ file, url: URL.createObjectURL(typed), error: null });
    } catch (error) {
      if (!viewerRequests.current.isCurrent(token)) return;
      setViewer({ file, url: null, error: error instanceof Error ? error.message : "Не удалось открыть файл" });
    }
  };

  const closeViewer = () => {
    viewerRequests.current.next(); // invalidates a request still in flight
    setViewer(null);
  };

  const deleteFile = async () => {
    if (!fileToDelete) return;
    const { excuseId, file } = fileToDelete;
    setFileBusyId(file.id);
    try {
      await orgApi.deleteAttendanceExcuseFile(file.id);
      setItems((previous) => previous.map((entry) =>
        entry.id === excuseId ? { ...entry, files: entry.files.filter((f) => f.id !== file.id) } : entry,
      ));
      setFileToDelete(null);
      showToast("Файл удалён");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Не удалось удалить файл", "error");
    } finally {
      setFileBusyId(null);
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "pending", label: `Ожидают (${pendingTotal})` },
    { key: "confirmed", label: "Подтверждено" },
    { key: "rejected", label: "Отклонено" },
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5">
      {/* Toolbar: statuses on the left, month and filter on the right */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 lg:w-fit" role="tablist">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => switchTab(key)}
              className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => { setMonth((m) => shiftMonth(m, -1)); resetPaging(); }}
              aria-label="Предыдущий месяц"
              className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-slate-950"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-[132px] px-2 text-center text-sm font-semibold text-slate-800" aria-live="polite">
              {monthLabelRu(month)}
            </div>
            <button
              type="button"
              onClick={() => { setMonth((m) => shiftMonth(m, 1)); resetPaging(); }}
              aria-label="Следующий месяц"
              className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-slate-950"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <CascadingFilter
            teachers={teachers}
            groups={groups}
            value={filter}
            onChange={(value) => { setFilter(value); resetPaging(); }}
          />
        </div>
      </div>

      {/* List */}
      <section className={!loading && !loadError && items.length > 0 ? "overflow-hidden rounded-2xl border border-slate-200 bg-white" : ""}>
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-slate-500">
            <Loader2 className="h-7 w-7 animate-spin text-primary-600" />
            Загрузка…
          </div>
        ) : loadError ? (
          <div role="alert" className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-rose-500" />
            <p className="max-w-md text-sm font-medium text-rose-800">{loadError}</p>
            <button type="button" onClick={() => void load()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Повторить</button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 py-14 text-center">
            <ClipboardCheck className="h-6 w-6 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">
              {tab === "pending" ? "Нет пропусков, ожидающих решения" : tab === "confirmed" ? "Подтверждённых пропусков нет" : "Отклонённых пропусков нет"}
            </p>
            <p className="text-xs text-slate-400">За выбранный месяц и с этими фильтрами ничего не найдено.</p>
          </div>
        ) : (
          <div>
            <div className={`hidden border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 ${GRID_COLUMNS}`}>
              <span>Дата урока</span>
              <span>Ученик</span>
              <span>Причина</span>
              <span>Справки</span>
              <span>Решение</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {items.map((item) => {
                const busy = busyIds.has(item.id);
                const badge = STATUS_BADGE[item.status];
                const atLimit = item.files.length >= EXCUSE_FILE_MAX_COUNT;
                return (
                  <li key={item.id} className={`flex flex-col gap-3 px-4 py-4 sm:px-5 xl:items-start ${GRID_COLUMNS}`}>
                    <div className="flex flex-wrap items-center gap-2 xl:block">
                      <p className="text-sm font-bold text-slate-900">{formatDateRu(item.lesson_date)}</p>
                      {tab !== "pending" && (
                        <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}>{badge.label}</span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <Link href={`${studentProfileBasePath}/${item.student.id}`} className="block break-words text-sm font-semibold text-slate-900 hover:text-primary-700" title="Открыть профиль ученика">
                        {item.student.full_name}
                      </Link>
                      {item.student.display_id && <p className="text-[11px] font-mono text-slate-400">{item.student.display_id}</p>}
                      <p className="mt-0.5 text-xs text-slate-600">{item.group.name}</p>
                      <p className="text-xs text-slate-400">{item.teacher?.name || "—"}</p>
                    </div>

                    <div className="min-w-0">
                      <p className="break-words text-sm text-slate-800">{item.reason}</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {[item.reason_by?.name, formatDateTimeRu(item.reason_at)].filter(Boolean).join(" · ")}
                      </p>
                    </div>

                    <div className="min-w-0 space-y-2">
                      {item.files.length > 0 && (
                        <ul className="space-y-1.5">
                          {item.files.map((file) => (
                            <FileChip
                              key={file.id}
                              file={file}
                              busy={fileBusyId === file.id}
                              onOpen={() => void openFile(file)}
                              onDelete={() => setFileToDelete({ excuseId: item.id, file })}
                            />
                          ))}
                        </ul>
                      )}
                      {item.files.length === 0 && <p className="text-xs text-slate-400">Справка не приложена</p>}
                      {!atLimit && (
                        <div className="flex flex-wrap gap-1.5">
                          <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 ${uploadingId === item.id ? "pointer-events-none opacity-60" : ""}`}>
                            {uploadingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                            Приложить справку
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              className="sr-only"
                              onChange={(event) => { void attachFile(item, event.target.files?.[0]); event.target.value = ""; }}
                            />
                          </label>
                          {/* Opens the camera directly on a phone; hidden on desktop where it is meaningless. */}
                          <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 md:hidden ${uploadingId === item.id ? "pointer-events-none opacity-60" : ""}`}>
                            <Camera className="h-3.5 w-3.5" />
                            Снять фото
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="sr-only"
                              onChange={(event) => { void attachFile(item, event.target.files?.[0]); event.target.value = ""; }}
                            />
                          </label>
                        </div>
                      )}
                      {atLimit && <p className="text-[11px] text-slate-400">Максимум файлов: {EXCUSE_FILE_MAX_COUNT}</p>}
                    </div>

                    <div className="min-w-0 space-y-2">
                      {item.status === "pending" ? (
                        <>
                          <input
                            value={notes[item.id] || ""}
                            onChange={(event) => setNotes((previous) => ({ ...previous, [item.id]: event.target.value }))}
                            maxLength={REVIEW_NOTE_MAX}
                            placeholder="Примечание (необязательно)"
                            aria-label="Примечание к решению"
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void review(item, "confirmed")}
                              className="flex min-w-[120px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              Подтвердить
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void review(item, "rejected")}
                              className="flex min-w-[120px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                            >
                              <X className="h-3.5 w-3.5" />
                              Отклонить
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-slate-600">
                            <span className="font-semibold">{item.status === "confirmed" ? "Подтвердил(а)" : "Отклонил(а)"}:</span>{" "}
                            {[item.reviewed_by?.name, formatDateTimeRu(item.reviewed_at)].filter(Boolean).join(", ") || "—"}
                          </p>
                          {item.review_note && <p className="break-words text-xs text-slate-500">Примечание: {item.review_note}</p>}
                          <div className="flex flex-wrap gap-2">
                          {item.status === "rejected" ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void review(item, "confirmed")}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Подтвердить
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void review(item, "rejected")}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                            >
                              <X className="h-3.5 w-3.5" />
                              Отклонить
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void resetDecision(item)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                            Сбросить решение
                          </button>
                          </div>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {/* Paging */}
      {!loading && !loadError && total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
          <span>Всего: {total}</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} aria-label="Предыдущая страница" className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
            <span>{page + 1} из {pageCount}</span>
            <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)} aria-label="Следующая страница" className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {/* Certificate viewer */}
      <Modal
        open={viewer !== null}
        title={viewer?.file.filename || "Справка"}
        description={viewer ? formatFileSize(viewer.file.size_bytes) : undefined}
        onClose={closeViewer}
        maxWidthClassName="max-w-[760px]"
        footer={
          viewer?.url ? (
            <a href={viewer.url} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-slate-200 px-5 py-2.5 text-center text-sm font-medium text-slate-700 hover:bg-slate-50">
              Открыть в новой вкладке
            </a>
          ) : undefined
        }
      >
        <div className="pb-2">
          {viewer && !viewer.url && !viewer.error && (
            <div className="flex min-h-[200px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary-600" /></div>
          )}
          {viewer?.error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{viewer.error}</p>}
          {viewer?.url && viewer.file.content_type === "application/pdf" && (
            <iframe src={viewer.url} title="Справка" className="h-[60vh] w-full rounded-xl border border-slate-200" />
          )}
          {viewer?.url && viewer.file.content_type !== "application/pdf" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={viewer.url} alt="Справка" className="mx-auto max-h-[60vh] w-auto max-w-full rounded-xl border border-slate-200" />
          )}
        </div>
      </Modal>

      {/* Delete a certificate file */}
      <Modal
        open={fileToDelete !== null}
        title="Удалить файл справки?"
        description={fileToDelete?.file.filename || undefined}
        onClose={() => setFileToDelete(null)}
        busy={fileBusyId !== null}
        footer={
          <>
            <button type="button" onClick={() => setFileToDelete(null)} disabled={fileBusyId !== null} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Отмена</button>
            <button type="button" onClick={() => void deleteFile()} disabled={fileBusyId !== null} className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              {fileBusyId !== null && <Loader2 className="h-4 w-4 animate-spin" />}
              Удалить
            </button>
          </>
        }
      >
        <p className="pb-2 text-sm text-slate-600">Файл будет удалён без возможности восстановления.</p>
      </Modal>

      {toastNode}
    </div>
  );
}
