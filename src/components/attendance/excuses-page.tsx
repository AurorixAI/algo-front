"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
  Paperclip,
  Trash2,
  Undo2,
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
import { excuseDeadlineCell, sortExcusesByUrgency } from "@/lib/excuse-deadline";
import { applyItemChange, loadAllPending } from "@/lib/excuses-pending";
import { excuseChange } from "@/lib/excuse-conflict";
import { afterDecision, createOncePer, createQueueGuard, readFailureOutcome, STALE_LIST_TEXT, STALE_LIST_TOAST_GAP_MS, type QueueGuard } from "@/lib/queue-guard";
import { afterDeadlineMark, subjectOfItem, type ExcuseDecision, type ExcuseNoteMode } from "@/lib/excuse-decision";
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
import { AfterDeadlineChip } from "@/components/attendance/after-deadline-chip";
import { EmptyState, TableHeader, type CellAlign } from "@/components/attendance/table-chrome";
import { ExcuseDecisionDialog, type ExcuseDecisionTarget } from "@/components/attendance/excuse-decision-dialog";
import { CascadingFilter } from "@/components/ui/cascading-filter";
import { Modal } from "@/components/ui/modal";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { useToast } from "@/components/ui/toast";

const PAGE_SIZE = 50;

/**
 * Columns of the wide layout (cards below `xl`: the sidebar takes 240 px from a tablet up, so a
 * five-column row only fits from 1280 px). Pending tabs show the deadline, decided ones the decision;
 * the last column of a pending row holds «Подтвердить», «Отклонить» and «⋯» side by side.
 * The header and every row use the same template, the same horizontal padding and the same gap, so a
 * header and its cells share one left edge; cells are top-aligned, so first lines share one axis.
 */
const COLS_PENDING = "xl:grid-cols-[minmax(0,1.1fr)_104px_minmax(0,1.5fr)_208px_240px]";
const COLS_DECIDED = "xl:grid-cols-[minmax(0,1.1fr)_104px_minmax(0,1.5fr)_minmax(0,1.2fr)_40px]";

/** Ученик and Причина (free text) left, Урок and Срок / Решение centred, the actions right (see table-chrome). */
const EXCUSE_ALIGNS: CellAlign[] = ["left", "center", "left", "center", "right"];

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
  center = false,
}: {
  text: string;
  meta?: string;
  className?: string;
  metaClassName?: string;
  /** Centred on the wide table (a short data column); cards keep the text left. */
  center?: boolean;
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
      className={`block w-full cursor-default rounded text-left ${center ? "xl:text-center" : ""} enabled:cursor-pointer enabled:hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30`}
    >
      {/* A cut text keeps its whole in the tooltip: nothing is hidden for good (a click opens it in place). */}
      <span ref={textRef} title={cut && !expanded ? text : undefined} className={`block break-words ${className} ${expanded ? "" : "xl:line-clamp-2"}`}>{text}</span>
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
  /** The waiting queue is longer than the screen holds (the newest lessons are not shown). */
  const [hiddenPending, setHiddenPending] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [fileBusyId, setFileBusyId] = useState<string | null>(null);

  // Every «Подтвердить» / «Отклонить» goes through the confirmation dialog before a request is sent.
  const [dialog, setDialog] = useState<ExcuseDecisionTarget | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
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

  // The latest state for the code that runs after an await (see settleChange).
  const live = useRef({ items, total, pendingTotal, hiddenPending, tab, page });
  live.current = { items, total, pendingTotal, hiddenPending, tab, page };

  // Reads of the list and the in-place patches take turns here: a patch invalidates every read that started before it, a
  // silent read follows the last patch and every return to the window (see lib/queue-guard.ts).
  const staleToastGate = useRef(createOncePer(STALE_LIST_TOAST_GAP_MS));
  const loadRef = useRef<(silent?: boolean) => Promise<void>>(async () => {});
  const guardRef = useRef<QueueGuard | null>(null);
  if (!guardRef.current) guardRef.current = createQueueGuard({ reload: () => { void loadRef.current(true); } });
  const guard = guardRef.current;
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
    const token = guard.begin();
    // A silent read leaves the screen alone until it has an answer: no spinner, and an error panel that is already there
    // stays until a read succeeds.
    if (!silent) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const query = {
        status: tab,
        dateFrom,
        dateTo,
        groupId: filter.groupId || undefined,
        teacherId: filter.groupId ? undefined : filter.teacherId || undefined,
      } as const;
      if (tab === "pending") {
        // The waiting queue is read whole (the urgency order needs all of it); decided tabs are paged below.
        const queue = await loadAllPending<AttendanceExcuseItem>((limit, offset) => orgApi.listAttendanceExcuses({ ...query, limit, offset }));
        if (!guard.accepts(token)) return;
        setLoadError(null);
        setItems(queue.items);
        setTotal(queue.total);
        setHiddenPending(queue.hidden);
        setPendingTotal(queue.pendingTotal);
        return;
      }
      const data = await orgApi.listAttendanceExcuses({ ...query, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
      if (!guard.accepts(token)) return;
      setHiddenPending(0);
      // The last item of a later page was handled: step back instead of showing an empty page.
      if ((data.items || []).length === 0 && page > 0) {
        setPage(Math.min(page - 1, Math.max(0, Math.ceil((data.total ?? 0) / PAGE_SIZE) - 1)));
        return;
      }
      setLoadError(null);
      setItems(data.items || []);
      setTotal(data.total ?? 0);
      setPendingTotal(data.pending_total ?? 0);
    } catch (error) {
      if (!guard.accepts(token)) return;
      if (readFailureOutcome({ silent, rows: live.current.items.length }) === "keep-list") {
        // The list on screen stays; one quiet word about it, not more than once a minute.
        if (staleToastGate.current()) showToast(STALE_LIST_TEXT, "warning");
        return;
      }
      setLoadError(error instanceof Error ? error.message : "Не удалось загрузить список");
    } finally {
      if (guard.accepts(token)) setLoading(false);
    }
  }, [dateFrom, dateTo, filter.groupId, filter.teacherId, page, tab]);

  loadRef.current = load;
  useEffect(() => { void load(); }, [load]);

  // Back to the window (focus, the tab becomes visible): read the list silently - others may have decided meanwhile.
  useEffect(() => {
    const onFocus = () => guard.woke();
    const onVisible = () => { if (document.visibilityState === "visible") guard.woke(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      guard.cancel();
    };
  }, [guard]);

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
   * The server answered a decision (or a reset) with the changed item: patch the list in place, no new read of the queue.
   * The list is read again only when the answer cannot be used (no id / status, a row that is not on screen), when the open
   * tab is a page of a longer list, or when the waiting queue is cut (a freed place may belong to a hidden row).
   */
  const settleChange = async (updated: unknown) => {
    // Read the LATEST state, not the one of the render that created this closure: a dialog with several excuses sends
    // them one by one, and each answer must be patched onto the list as the previous answer left it.
    const now = live.current;
    // An older read still in flight must never overwrite what is patched here; a silent read heals the rest in a moment.
    guard.patched();
    setLoading(false);
    const patched = now.hiddenPending === 0
      ? applyItemChange<AttendanceExcuseItem>({ items: now.items, total: now.total, pendingTotal: now.pendingTotal }, updated, now.tab)
      : null;
    const emptiedLaterPage = patched !== null && patched.items.length === 0 && now.page > 0;
    if (!patched || emptiedLaterPage || (now.tab !== "pending" && now.total > PAGE_SIZE)) {
      await load(true);
      return;
    }
    live.current = { ...now, ...patched };
    setItems(patched.items);
    setTotal(patched.total);
    setPendingTotal(patched.pendingTotal);
  };

  /**
   * null when the decision was saved, else why it was not.  The dialog closes only when saved; a refusal is shown inside
   * it (the toast is for the success), so a typed note survives an error.
   * The request carries `expected_status`, the status the dialog showed: if somebody decided in the meantime the server
   * answers EXCUSE_CHANGED with the excuse as it is now - the row is patched with it, the dialog stays open with the
   * server's message and the new state, and the administrator decides again knowing what happened.
   */
  const review = async (item: { id: string; status: ExcuseReviewStatus }, decision: ExcuseDecision, noteText = ""): Promise<string | null> => {
    if (reviewing.current.has(item.id)) return "Решение уже отправляется";
    reviewing.current.add(item.id);
    markBusy(item.id, true);
    try {
      const note = noteText.trim();
      const updated = await orgApi.reviewAttendanceExcuse(item.id, { decision, expected_status: item.status, ...(note ? { note } : {}) });
      showToast(decision === "confirmed" ? "Пропуск подтверждён" : "Пропуск отклонён");
      await afterDecision(() => settleChange(updated), refreshBadge);
      return null;
    } catch (error) {
      const changed = excuseChange(error);
      if (changed) {
        // The dialog now shows the new state: a second press is a decision about THAT state.
        const fresh = changed.item as { id?: string; status?: ExcuseReviewStatus } | null;
        if (fresh && fresh.id === item.id && fresh.status) {
          setDialog((current) => (current ? { ...current, items: current.items.map((entry) => (entry.id === item.id ? { ...entry, status: fresh.status as ExcuseReviewStatus } : entry)) } : current));
        }
        await afterDecision(() => settleChange(changed.item), refreshBadge);
        return changed.message;
      }
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
      const updated = await orgApi.resetAttendanceExcuse(item.id, { expected_status: item.status });
      showToast("Решение сброшено: пропуск снова ожидает");
      await afterDecision(() => settleChange(updated), refreshBadge);
    } catch (error) {
      const changed = excuseChange(error);
      if (changed) {
        // Somebody changed it first: show the new state in the list and say so.
        await afterDecision(() => settleChange(changed.item), refreshBadge);
        showToast(changed.message, "warning");
      } else {
        showToast(error instanceof Error ? error.message : "Не удалось сбросить решение", "error");
      }
    } finally {
      markBusy(item.id, false);
    }
  };

  const openDialog = (item: AttendanceExcuseItem, decision: ExcuseDecision, noteMode: ExcuseNoteMode) => {
    setDialogError(null);
    setDialog({ items: [subjectOfItem(item, businessToday)], decision, noteMode });
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
      : { key: "attach", label: "Прикрепить справку", icon: Paperclip, onSelect: () => pickFile(item) };
    const reject: RowMenuItem = { key: "reject", label: "Отклонить…", icon: XCircle, danger: true, onSelect: () => openDialog(item, "rejected", "optional") };
    const confirmWithNote: RowMenuItem = { key: "confirm-note", label: "Подтвердить с примечанием…", icon: MessageSquare, onSelect: () => openDialog(item, "confirmed", "required") };
    const reset: RowMenuItem = { key: "reset", label: "Сбросить решение", icon: Undo2, onSelect: () => void resetDecision(item) };

    // IA audit F6 / d4: the menu has at most three items - the decision with a note, the certificate, the reset.  «Подтвердить» and
    // «Отклонить» are buttons of the row; the journal and the card of the student are links of the row, not menu items.
    if (item.status === "pending") return [confirmWithNote, attach];
    if (item.status === "confirmed") return [reject, reset, attach];
    return [confirmWithNote, reset, attach];
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "pending", label: `Ожидают (${pendingTotal})` },
    { key: "confirmed", label: "Подтверждено" },
    { key: "rejected", label: "Отклонено" },
  ];
  const pendingTab = tab === "pending";
  const cols = pendingTab ? COLS_PENDING : COLS_DECIDED;
  // Waiting excuses: the deadline that has passed first, then the nearest - over the whole queue (see lib/excuses-pending.ts).
  const rows = useMemo(
    () => (pendingTab ? sortExcusesByUrgency(items, businessToday) : items),
    [items, pendingTab, businessToday],
  );
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
              aligns={EXCUSE_ALIGNS}
            />
            <ul className="space-y-2.5 xl:space-y-0 xl:divide-y xl:divide-slate-100">
              {rows.map((item) => {
                const busy = busyIds.has(item.id);
                const uploading = uploadingId === item.id;
                const deadline = pendingTab ? excuseDeadlineCell(item, businessToday) : null;
                const lateMark = pendingTab ? null : afterDeadlineMark(item);
                const teacherShort = shortPersonName(item.teacher?.name) || "—";
                const decisionDetail = excuseDecisionDetail(item, businessToday.slice(0, 4));
                return (
                  <li
                    key={item.id}
                    className={`relative flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3.5 xl:grid xl:items-start xl:gap-x-3 xl:gap-y-0 xl:rounded-none xl:border-0 xl:bg-transparent xl:px-4 xl:py-3 ${cols}`}
                  >
                    {/* Ученик: the name leads, id and group are secondary */}
                    <div className={`min-w-0 ${pendingTab || tab === "rejected" ? "" : "pr-8 xl:pr-0"}`}>
                      <Link
                        href={`${studentProfileBasePath}/${item.student.id}`}
                        className="block min-w-0 break-words text-sm font-semibold leading-5 text-slate-900 hover:text-primary-700 xl:line-clamp-2"
                        title="Открыть карточку ученика"
                      >
                        {item.student.full_name}
                      </Link>
                      <p className="break-words text-xs text-slate-500 xl:truncate" title={item.group.name}>
                        {[item.student.display_id, item.group.name].filter(Boolean).join(" · ")}
                      </p>
                    </div>

                    {/* Урок */}
                    <div className="min-w-0 text-xs text-slate-500 xl:text-center xl:text-sm">
                      <p className="xl:truncate xl:leading-5">
                        <span className="font-medium text-slate-800">{lessonShortLabel(item.lesson_date)}</span>
                        <span className="xl:hidden"> · {teacherShort}</span>
                      </p>
                      <p className="hidden truncate text-xs text-slate-500 xl:block" title={item.teacher?.name || undefined}>{teacherShort}</p>
                      <Link href={excuseJournalHref(groupsBasePath, item)} data-testid="excuse-journal-link" className="text-xs font-semibold text-primary-700 hover:underline">Журнал</Link>
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

                    {/* Срок / Решение: centred under its header, the chip too */}
                    {pendingTab ? (
                      <div className="min-w-0 xl:text-center">
                        {deadline && (
                          <>
                            <div className="flex min-w-0 xl:-my-px xl:justify-center">
                              <span className={`${CHIP_BASE_CLASS} ${CHIP_TONE_CLASS[deadline.tone]}`} title={deadline.title}>
                                {deadline.headline}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500">{deadline.sub}</p>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="min-w-0 xl:text-center">
                        <p className="break-words text-xs text-slate-700 xl:text-sm xl:leading-5" title={formatDateTimeRu(item.reviewed_at) || undefined}>
                          {excuseDecisionLabel(item) || "—"}
                        </p>
                        {decisionDetail && <ExpandableText text={decisionDetail} className="text-xs text-slate-500" center />}
                        {lateMark && <div className="mt-1 flex xl:justify-center"><AfterDeadlineChip mark={lateMark} /></div>}
                      </div>
                    )}

                    {/* Действия */}
                    {/* On a phone the decided cards keep the «⋯» in the corner instead of a row of its own */}
                    <div className={`flex items-center justify-end gap-1.5 xl:-my-1.5 ${pendingTab || tab === "rejected" ? "mt-1" : "absolute right-2 top-2 xl:static"}`}>
                      {pendingTab && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            aria-label={`Подтвердить: ${item.student.full_name}`}
                            onClick={() => openDialog(item, "confirmed", "none")}
                            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 xl:flex-none"
                          >
                            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            Подтвердить
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            aria-label={`Отклонить: ${item.student.full_name}`}
                            onClick={() => openDialog(item, "rejected", "optional")}
                            className="flex h-8 flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 xl:flex-none"
                          >
                            Отклонить
                          </button>
                        </>
                      )}
                      {tab === "rejected" && (
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={`Подтвердить: ${item.student.full_name}`}
                          onClick={() => openDialog(item, "confirmed", "none")}
                          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-600 bg-white px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 xl:flex-none"
                        >
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
      {!loading && !loadError && pendingTab && hiddenPending > 0 && (
        <p className="text-sm text-slate-500" data-testid="pending-hidden">
          Показаны самые давние {rows.length} из {total}: остальные появятся, когда эти будут обработаны.
        </p>
      )}
      {!loading && !loadError && !pendingTab && total > PAGE_SIZE && (
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
      <ExcuseDecisionDialog target={dialog} busy={dialogBusy} error={dialogError} onClose={closeDialog} onSubmit={submitDialog} />

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
