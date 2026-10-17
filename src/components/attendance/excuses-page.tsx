"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
  Paperclip,
  Phone,
  Trash2,
  Undo2,
  UserRound,
  XCircle,
} from "lucide-react";
import {
  DEMO_MODE,
  orgApi,
  type AttendanceExcuseFile,
  type AttendanceExcuseItem,
  type ExcuseReviewStatus,
} from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import { CHIP_BASE_CLASS, CHIP_TONE_CLASS } from "@/lib/chip-tone";
import { excuseDeadlineChip } from "@/lib/excuse-deadline";
import { subjectOfItem, type ExcuseDecision, type ExcuseNoteMode } from "@/lib/excuse-decision";
import {
  excuseDecisionDetail,
  excuseDecisionLabel,
  excuseFilesLabel,
  excuseJournalHref,
  excusePickerAccept,
  lessonShortLabel,
  reasonMeta,
  shortPersonName,
} from "@/lib/excuse-row";
import { telHref } from "@/lib/phone";
import {
  checkExcuseFile,
  EXCUSE_FILE_MAX_BYTES,
  EXCUSE_FILE_MAX_COUNT,
  EXCUSE_IMAGE_JPEG_QUALITY,
  EXCUSE_IMAGE_MAX_SIDE,
  fitWithin,
  formatDateTimeRu,
  formatFileSize,
  monthLabelRu,
  monthOf,
  monthRangeOf,
  shiftMonth,
} from "@/lib/attendance-excuses";
import { createRequestSequence } from "@/lib/request-sequence";
import { useExcuseBadge } from "@/lib/excuse-badge";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { EmptyState, TableHeader } from "@/components/attendance/table-chrome";
import { ExcuseDecisionDialog, type ExcuseDecisionTarget } from "@/components/attendance/excuse-decision-dialog";
import { CascadingFilter } from "@/components/ui/cascading-filter";
import { Modal } from "@/components/ui/modal";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { useToast } from "@/components/ui/toast";

const PAGE_SIZE = 50;

/**
 * Columns of the wide layout (cards below `xl`: the sidebar takes 240 px from a tablet up, so a
 * five-column row only fits from 1280 px). Pending tabs show the deadline, decided ones the decision.
 * The header and every row use the same template, the same horizontal padding and the same gap, so a
 * header and its cells share one left edge; cells are top-aligned, so first lines share one axis.
 */
const COLS_PENDING = "xl:grid-cols-[minmax(0,1.45fr)_104px_minmax(0,1.55fr)_176px_184px]";
const COLS_DECIDED = "xl:grid-cols-[minmax(0,1.45fr)_104px_minmax(0,1.55fr)_minmax(0,1.3fr)_40px]";

type Tab = ExcuseReviewStatus;

const EMPTY_TEXT: Record<Tab, string> = {
  pending: "Нет пропусков, ожидающих решения",
  confirmed: "Подтверждённых пропусков нет",
  rejected: "Отклонённых пропусков нет",
};

const EMPTY_HINT: Record<Tab, string> = {
  pending: "Пропуски, которые преподаватели отметят уважительными, появятся здесь для решения.",
  confirmed: "Здесь будут пропуски, которые вы подтвердили за выбранный месяц.",
  rejected: "Здесь будут пропуски, которые вы отклонили за выбранный месяц.",
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

/**
 * A text that a card (< xl) shows in full and the wide table cuts to two lines. When something is cut
 * off the whole cell is a toggle (click, Enter, Space; `aria-expanded`) that shows the rest and the
 * optional muted `meta` line; when everything fits it is plain text.
 */
function ExpandableText({
  text,
  meta,
  className = "text-sm text-slate-800",
  metaClassName = "text-xs text-slate-500",
}: {
  text: string;
  meta?: string;
  className?: string;
  metaClassName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [cut, setCut] = useState(false);
  const textRef = useRef<HTMLSpanElement | null>(null);

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || expanded) return;
    const measure = () => setCut(element.scrollHeight > element.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, expanded]);

  const interactive = cut || expanded;
  return (
    <button
      type="button"
      disabled={!interactive}
      aria-expanded={interactive ? expanded : undefined}
      title={interactive ? (expanded ? "Свернуть" : "Показать полностью") : undefined}
      onClick={() => setExpanded((value) => !value)}
      className="block w-full cursor-default rounded text-left enabled:cursor-pointer enabled:hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30"
    >
      <span ref={textRef} className={`block break-words ${className} ${expanded ? "" : "xl:line-clamp-2"}`}>{text}</span>
      {meta && <span className={`block ${metaClassName} ${expanded ? "" : "xl:hidden"}`}>{meta}</span>}
    </button>
  );
}

export function ExcusesPage(props: { studentProfileBasePath: string; groupsBasePath: string }) {
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

function ExcusesPageContent({ studentProfileBasePath, groupsBasePath }: { studentProfileBasePath: string; groupsBasePath: string }) {
  const router = useRouter();
  const { showToast, toastNode } = useToast();
  // The list covers one calendar month on the business clock (Asia/Tashkent).
  const currentMonth = useMemo(() => monthOf(formatBusinessDate()), []);
  const businessToday = formatBusinessDate();

  const [tab, setTab] = useState<Tab>("pending");
  const [month, setMonth] = useState(currentMonth);
  const { from: dateFrom, to: dateTo } = useMemo(() => monthRangeOf(`${month}-01`), [month]);
  const [filter, setFilter] = useState({ teacherId: "", groupId: "" });
  const [page, setPage] = useState(0);

  const [teachers, setTeachers] = useState<Array<{ id: string; first_name: string; last_name: string; full_name?: string }>>([]);
  const [groups, setGroups] = useState<Array<{ id: string; name: string; teacher_id: string }>>([]);

  const [items, setItems] = useState<AttendanceExcuseItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [fileBusyId, setFileBusyId] = useState<string | null>(null);

  // Every «Подтвердить» / «Отклонить» goes through the confirmation dialog before a request is sent.
  const [dialog, setDialog] = useState<ExcuseDecisionTarget | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  // How the centre bills decides whether the dialog speaks about the student's package; only a user who may see
  // payments knows it (the summary the layout already keeps), otherwise the package sentence is left out.
  const billingMode = usePaymentsSummary((state) => (state.available ? state.periodMode : null));
  // Excuses whose decision is on its way: a second click (or the dialog after the row button) sends nothing.
  const reviewing = useRef<Set<string>>(new Set());

  const [viewer, setViewer] = useState<{ excuseId: string; file: AttendanceExcuseFile; url: string | null; error: string | null } | null>(null);
  const [fileToDelete, setFileToDelete] = useState<{ excuseId: string; file: AttendanceExcuseFile } | null>(null);

  // A finger as the main pointer (phone, tablet): the picker lists photos only, so Android offers the camera.
  const [coarsePointer, setCoarsePointer] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(pointer: coarse)");
    const sync = () => setCoarsePointer(query.matches);
    sync();
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, []);

  const requests = useRef(createRequestSequence());
  const viewerRequests = useRef(createRequestSequence());
  // One hidden picker for the whole list: the menu item of a row points it at that row's excuse.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetId = useRef<string | null>(null);

  // Teacher -> group directory for the cascading filter.
  useEffect(() => {
    let cancelled = false;
    Promise.all([orgApi.listMembers(), orgApi.listGroups()])
      .then(([members, groupList]) => {
        if (cancelled) return;
        setTeachers(
          (Array.isArray(members) ? members : [])
            .filter((m: any) => m.org_role === "teacher")
            .map((m: any) => ({
              id: m.user_id || m.id,
              first_name: m.first_name ?? "",
              last_name: m.last_name ?? "",
              full_name: m.full_name,
            })),
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

  /**
   * null when the decision was saved, else why it was not.  The dialog closes only when saved; a refusal is shown inside
   * it (the toast is for the success), so a typed note survives an error.
   */
  const review = async (item: { id: string }, decision: ExcuseDecision, noteText = ""): Promise<string | null> => {
    if (reviewing.current.has(item.id)) return "Решение уже отправляется";
    reviewing.current.add(item.id);
    markBusy(item.id, true);
    try {
      const note = noteText.trim();
      await orgApi.reviewAttendanceExcuse(item.id, { decision, ...(note ? { note } : {}) });
      showToast(decision === "confirmed" ? "Пропуск подтверждён" : "Пропуск отклонён");
      await load(true);
      refreshBadge();
      return null;
    } catch (error) {
      void load(true);
      return error instanceof Error ? error.message : "Не удалось сохранить решение";
    } finally {
      reviewing.current.delete(item.id);
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

  const openDialog = (item: AttendanceExcuseItem, decision: ExcuseDecision, noteMode: ExcuseNoteMode) => {
    setDialogError(null);
    setDialog({ items: [subjectOfItem(item)], decision, noteMode });
  };
  const closeDialog = () => { setDialog(null); setDialogError(null); };
  const submitDialog = async (note: string) => {
    if (!dialog) return;
    setDialogError(null);
    // One by one, stopping at the first failure: the dialog stays open so a typed note survives an error.
    for (const item of dialog.items) {
      const error = await review(item, dialog.decision, note);
      if (error) { setDialogError(error); return; }
    }
    closeDialog();
  };

  // ── Files ───────────────────────────────────────────────────────────────
  const pickFile = (item: AttendanceExcuseItem) => {
    uploadTargetId.current = item.id;
    fileInputRef.current?.click();
  };

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

  const onFilePicked = (picked: File | null | undefined) => {
    const target = items.find((entry) => entry.id === uploadTargetId.current);
    uploadTargetId.current = null;
    if (target) void attachFile(target, picked);
  };

  const openFile = async (excuseId: string, file: AttendanceExcuseFile) => {
    // Only the latest request may fill the viewer: a slow answer for a file that
    // was closed or replaced by another one is dropped.
    const token = viewerRequests.current.next();
    setViewer({ excuseId, file, url: null, error: null });
    try {
      const blob = await orgApi.fetchAttendanceExcuseFile(file.id);
      if (!viewerRequests.current.isCurrent(token)) return;
      const typed = blob.type ? blob : new Blob([blob], { type: file.content_type });
      setViewer({ excuseId, file, url: URL.createObjectURL(typed), error: null });
    } catch (error) {
      if (!viewerRequests.current.isCurrent(token)) return;
      setViewer({ excuseId, file, url: null, error: error instanceof Error ? error.message : "Не удалось открыть файл" });
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

  // The files of the excuse that is open in the viewer (they change when one is deleted or added elsewhere).
  const viewerFiles = viewer ? (items.find((entry) => entry.id === viewer.excuseId)?.files ?? [viewer.file]) : [];
  const viewerIndex = viewer ? Math.max(0, viewerFiles.findIndex((file) => file.id === viewer.file.id)) : 0;
  const stepViewer = (delta: number) => {
    if (!viewer) return;
    const next = viewerFiles[viewerIndex + delta];
    if (next) void openFile(viewer.excuseId, next);
  };

  const menuFor = (item: AttendanceExcuseItem): RowMenuItem[] => {
    const atLimit = item.files.length >= EXCUSE_FILE_MAX_COUNT;
    const attach: RowMenuItem = atLimit
      ? { key: "attach", label: `Максимум файлов: ${EXCUSE_FILE_MAX_COUNT}`, icon: Paperclip, disabled: true, onSelect: () => undefined }
      : { key: "attach", label: "Приложить справку", icon: Paperclip, onSelect: () => pickFile(item) };
    const reject: RowMenuItem = { key: "reject", label: "Отклонить…", icon: XCircle, danger: true, onSelect: () => openDialog(item, "rejected", "optional") };
    const confirmWithNote: RowMenuItem = { key: "confirm-note", label: "Подтвердить с примечанием…", icon: MessageSquare, onSelect: () => openDialog(item, "confirmed", "required") };
    const journal: RowMenuItem = { key: "journal", label: "Открыть журнал", icon: BookOpen, onSelect: () => router.push(excuseJournalHref(groupsBasePath, item)) };
    const card: RowMenuItem = { key: "card", label: "Карточка ученика", icon: UserRound, onSelect: () => router.push(`${studentProfileBasePath}/${item.student.id}`) };
    const reset: RowMenuItem = { key: "reset", label: "Сбросить решение", icon: Undo2, onSelect: () => void resetDecision(item) };

    if (item.status === "pending") return [reject, attach, confirmWithNote, journal, card];
    if (item.status === "confirmed") return [reject, reset, attach, journal, card];
    return [
      { key: "confirm", label: "Подтвердить", icon: Check, onSelect: () => openDialog(item, "confirmed", "none") },
      confirmWithNote,
      reset,
      attach,
      journal,
      card,
    ];
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "pending", label: `Ожидают (${pendingTotal})` },
    { key: "confirmed", label: "Подтверждено" },
    { key: "rejected", label: "Отклонено" },
  ];
  const pendingTab = tab === "pending";
  const cols = pendingTab ? COLS_PENDING : COLS_DECIDED;
  const dialogBusy = dialog ? dialog.items.some((item) => busyIds.has(item.id)) : false;

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
      <section className={!loading && !loadError && items.length > 0 ? "xl:overflow-hidden xl:rounded-2xl xl:border xl:border-slate-200 xl:bg-white" : ""}>
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
          <EmptyState icon={CheckCircle2} title={EMPTY_TEXT[tab]} hint={EMPTY_HINT[tab]} />
        ) : (
          <>
            <TableHeader
              show="xl"
              gridClass={cols}
              labels={["Ученик", "Урок", "Причина", pendingTab ? "Срок" : "Решение", ""]}
            />
            <ul className="space-y-2.5 xl:space-y-0 xl:divide-y xl:divide-slate-100">
              {items.map((item) => {
                const busy = busyIds.has(item.id);
                const uploading = uploadingId === item.id;
                const phoneHref = telHref(item.student.phone);
                const chip = pendingTab ? excuseDeadlineChip(item, businessToday) : null;
                const teacherShort = shortPersonName(item.teacher?.name) || "—";
                const decisionDetail = excuseDecisionDetail(item, businessToday.slice(0, 4));
                return (
                  <li
                    key={item.id}
                    className={`relative flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3.5 xl:grid xl:items-start xl:gap-x-3 xl:gap-y-0 xl:rounded-none xl:border-0 xl:bg-transparent xl:px-4 xl:py-3 ${cols}`}
                  >
                    {/* Ученик: the name leads, id and group are secondary */}
                    <div className={`min-w-0 ${pendingTab ? "" : "pr-8 xl:pr-0"}`}>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`${studentProfileBasePath}/${item.student.id}`}
                          className="min-w-0 break-words text-sm font-semibold leading-5 text-slate-900 hover:text-primary-700 xl:truncate"
                          title="Открыть карточку ученика"
                        >
                          {item.student.full_name}
                        </Link>
                        {phoneHref && (
                          <a
                            href={phoneHref}
                            title={item.student.phone || undefined}
                            aria-label={`Позвонить: ${item.student.phone}`}
                            className="-my-1.5 hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-primary-700 xl:inline-flex"
                          >
                            <Phone className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                      <p className="break-words text-xs text-slate-500 xl:truncate" title={item.group.name}>
                        {[item.student.display_id, item.group.name].filter(Boolean).join(" · ")}
                      </p>
                      {phoneHref && (
                        <a
                          href={phoneHref}
                          title={item.student.phone || undefined}
                          className="mt-0.5 inline-flex items-center gap-1 py-0.5 text-xs tabular-nums text-primary-700 hover:underline xl:hidden"
                        >
                          <Phone className="h-3 w-3" />
                          {item.student.phone}
                        </a>
                      )}
                    </div>

                    {/* Урок */}
                    <div className="min-w-0 text-xs text-slate-500 xl:text-sm">
                      <p className="xl:truncate xl:leading-5">
                        <span className="font-medium text-slate-800">{lessonShortLabel(item.lesson_date)}</span>
                        <span className="xl:hidden"> · {teacherShort}</span>
                      </p>
                      <p className="hidden truncate text-xs text-slate-500 xl:block" title={item.teacher?.name || undefined}>{teacherShort}</p>
                    </div>

                    {/* Причина */}
                    <div className="min-w-0">
                      <ExpandableText text={item.reason} meta={reasonMeta(item)} />
                      <p className="text-xs">
                        {uploading ? (
                          <span className="inline-flex items-center gap-1 text-slate-500"><Loader2 className="h-3 w-3 animate-spin" />загрузка…</span>
                        ) : item.files.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => void openFile(item.id, item.files[0])}
                            className="text-primary-700 hover:underline"
                            title="Открыть справку"
                          >
                            {excuseFilesLabel(item.files)}
                          </button>
                        ) : (
                          <span className="text-slate-500">{excuseFilesLabel(item.files)}</span>
                        )}
                      </p>
                    </div>

                    {/* Срок / Решение: a badge keeps its left edge on the left edge of its header */}
                    {pendingTab ? (
                      <div className="flex min-w-0 xl:-my-px">
                        {chip && (
                          <span className={`${CHIP_BASE_CLASS} ${CHIP_TONE_CLASS[chip.tone]}`} title={chip.title}>
                            {chip.text}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="min-w-0">
                        <p className="break-words text-xs text-slate-700 xl:text-sm xl:leading-5" title={formatDateTimeRu(item.reviewed_at) || undefined}>
                          {excuseDecisionLabel(item) || "—"}
                        </p>
                        {decisionDetail && <ExpandableText text={decisionDetail} className="text-xs text-slate-500" />}
                      </div>
                    )}

                    {/* Действия */}
                    {/* On a phone the decided cards keep the «⋯» in the corner instead of a row of its own */}
                    <div className={`flex items-center justify-end gap-1.5 xl:-my-1.5 ${pendingTab ? "mt-1" : "absolute right-2 top-2 xl:static"}`}>
                      {pendingTab && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => openDialog(item, "confirmed", "none")}
                          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 xl:flex-none"
                        >
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Подтвердить
                        </button>
                      )}
                      <RowMenu items={menuFor(item)} label={`Действия: ${item.student.full_name}`} busy={busy || uploading} width={264} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
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

      {/* One picker for every row: images offer the camera on a phone by themselves */}
      <input
        ref={fileInputRef}
        type="file"
        accept={excusePickerAccept(coarsePointer)}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => { const picked = event.target.files?.[0]; event.target.value = ""; onFilePicked(picked); }}
      />

      {/* «Подтвердить» / «Отклонить»: who, which lesson, why, what changes - and only then the request */}
      <ExcuseDecisionDialog target={dialog} busy={dialogBusy} error={dialogError} billingMode={billingMode} onClose={closeDialog} onSubmit={submitDialog} />

      {/* Certificate viewer */}
      <Modal
        open={viewer !== null}
        title={viewer?.file.filename || "Справка"}
        description={viewer ? formatFileSize(viewer.file.size_bytes) : undefined}
        onClose={closeViewer}
        maxWidthClassName="max-w-[760px]"
        footer={
          viewer ? (
            <>
              <button
                type="button"
                onClick={() => { setFileToDelete({ excuseId: viewer.excuseId, file: viewer.file }); closeViewer(); }}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium text-rose-700 hover:bg-rose-50 sm:mr-auto"
              >
                <Trash2 className="h-4 w-4" />
                Удалить файл
              </button>
              {viewer.url && (
                <a href={viewer.url} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-slate-200 px-5 py-2.5 text-center text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Открыть в новой вкладке
                </a>
              )}
            </>
          ) : undefined
        }
      >
        <div className="pb-2">
          {viewerFiles.length > 1 && (
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-500">
              <button type="button" onClick={() => stepViewer(-1)} disabled={viewerIndex === 0} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40">
                <ChevronLeft className="h-3.5 w-3.5" />Назад
              </button>
              <span>{viewerIndex + 1} из {viewerFiles.length}</span>
              <button type="button" onClick={() => stepViewer(1)} disabled={viewerIndex >= viewerFiles.length - 1} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40">
                Вперёд<ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
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
