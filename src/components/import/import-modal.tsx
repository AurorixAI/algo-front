"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import {
  X, Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle,
  Loader2, GraduationCap, UserSquare2, Check, ArrowRight, ArrowLeft,
} from "lucide-react";
import {
  orgApi, ImportPreviewResult, ImportCommitResult, ImportCounts,
} from "@/lib/api";
import { pluralRu } from "@/lib/payments";
import { useScrollLock } from "@/components/ui/modal";

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported?: () => void; // called after a successful commit (refresh lists)
}

type Step = "upload" | "review" | "done";

export function ImportModal({ open, onClose, onImported }: ImportModalProps) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (open) {
      setStep("upload"); setFile(null); setBusy(false); setError(null);
      setPreview(null); setResult(null); setDragging(false);
    }
  }, [open]);
  useScrollLock(open);

  const handleDownloadTemplate = async () => {
    try {
      const blob = await orgApi.downloadImportTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "algo_import_template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message || "Не удалось скачать шаблон");
    }
  };

  const pickFile = (f: File | null) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".xlsx")) {
      setError("Нужен файл .xlsx (Excel). Скачайте наш шаблон.");
      return;
    }
    setError(null);
    setFile(f);
  };

  const runPreview = async () => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const pv = await orgApi.importPreview(file);
      setPreview(pv);
      setStep("review");
    } catch (e: any) {
      setError(e.message || "Ошибка проверки файла");
    } finally {
      setBusy(false);
    }
  };

  const runCommit = async () => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const res = await orgApi.importCommit(file);
      setResult(res);
      if (res.ok) {
        setStep("done");
        onImported?.();
      } else {
        // Data changed between preview and commit — show the fresh issues.
        setPreview((p) => (p ? { ...p, ok: false, issues: res.issues, counts: res.counts } : p));
        setError("Файл не прошёл повторную проверку — см. ошибки ниже.");
      }
    } catch (e: any) {
      setError(e.message || "Ошибка импорта");
    } finally {
      setBusy(false);
    }
  };

  if (!mounted) return null;

  const content = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] touch-none"
            onClick={busy ? undefined : onClose}
          />
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="bg-white rounded-[24px] shadow-2xl border border-slate-100 w-full max-w-[620px] pointer-events-auto overflow-hidden flex flex-col max-h-[88vh]"
            >
              <div className="h-1 w-full bg-gradient-to-r from-primary-500 via-violet-400 to-emerald-400" />

              {/* Header */}
              <div className="flex items-center justify-between p-6 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary-50 to-primary-100/50 flex items-center justify-center border border-primary-100">
                    <FileSpreadsheet className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Импорт данных</h2>
                    <p className="text-xs text-slate-500">
                      {step === "upload" && "Загрузите заполненный шаблон .xlsx"}
                      {step === "review" && "Проверьте данные перед записью"}
                      {step === "done" && "Импорт завершён"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={busy ? undefined : onClose}
                  disabled={busy}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Stepper */}
              <div className="px-6 pb-2">
                <StepBar step={step} />
              </div>

              {/* Body */}
              <div className="px-6 py-3 overflow-y-auto overscroll-contain">
                {step === "upload" && (
                  <UploadStep
                    file={file}
                    dragging={dragging}
                    setDragging={setDragging}
                    inputRef={inputRef}
                    pickFile={pickFile}
                    onDownloadTemplate={handleDownloadTemplate}
                  />
                )}
                {step === "review" && preview && (
                  <ReviewStep preview={preview} />
                )}
                {step === "done" && result && (
                  <DoneStep result={result} />
                )}

                {error && (
                  <div className="mt-4 p-3 bg-red-50/80 border border-red-200 rounded-xl text-sm text-red-600 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{error}</span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-6 pt-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between gap-3">
                <div className="text-xs text-slate-400">
                  {step === "review" && preview && (
                    <span>{preview.issues.filter(i => i.level === "error").length} ошибок · {preview.issues.filter(i => i.level === "warning").length} предупреждений</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {step === "upload" && (
                    <>
                      <button onClick={onClose} className="px-5 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition-colors">Отмена</button>
                      <button
                        onClick={runPreview}
                        disabled={!file || busy}
                        className="px-6 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition-all shadow-sm shadow-primary-600/20 active:scale-95 flex items-center gap-2"
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                        Далее
                      </button>
                    </>
                  )}
                  {step === "review" && (
                    <>
                      <button onClick={() => { setStep("upload"); setError(null); }} disabled={busy} className="px-5 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition-colors flex items-center gap-2 disabled:opacity-40">
                        <ArrowLeft className="w-4 h-4" /> Назад
                      </button>
                      <button
                        onClick={runCommit}
                        disabled={!preview?.ok || busy}
                        className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-sm shadow-emerald-600/20 active:scale-95 flex items-center gap-2"
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        Подтвердить импорт
                      </button>
                    </>
                  )}
                  {step === "done" && (
                    <button onClick={onClose} className="px-6 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 transition-all active:scale-95">Готово</button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}

// ── Stepper bar ─────────────────────────────────────────────────────────────
function StepBar({ step }: { step: Step }) {
  const idx = step === "upload" ? 0 : step === "review" ? 1 : 2;
  const labels = ["Загрузка", "Проверка", "Готово"];
  return (
    <div className="flex items-center gap-2">
      {labels.map((label, i) => (
        <div key={label} className="flex items-center gap-2 flex-1">
          <div className={`flex items-center gap-2 ${i <= idx ? "text-primary-600" : "text-slate-300"}`}>
            <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${i < idx ? "bg-primary-600 text-white" : i === idx ? "bg-primary-100 text-primary-700 ring-2 ring-primary-500" : "bg-slate-100 text-slate-400"}`}>
              {i < idx ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span className="text-xs font-medium hidden sm:inline">{label}</span>
          </div>
          {i < labels.length - 1 && <div className={`h-0.5 flex-1 rounded ${i < idx ? "bg-primary-500" : "bg-slate-100"}`} />}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: upload ──────────────────────────────────────────────────────────
function UploadStep({ file, dragging, setDragging, inputRef, pickFile, onDownloadTemplate }: {
  file: File | null; dragging: boolean; setDragging: (v: boolean) => void;
  inputRef: React.RefObject<HTMLInputElement>; pickFile: (f: File | null) => void;
  onDownloadTemplate: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Download template card */}
      <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-primary-50/60 border border-primary-100">
        <div className="flex items-start gap-3">
          <Download className="w-5 h-5 text-primary-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Шаг 1 — скачайте шаблон</p>
            <p className="text-xs text-slate-500 mt-0.5">Две вкладки: Группы и Ученики. Заполните и загрузите обратно.</p>
          </div>
        </div>
        <button onClick={onDownloadTemplate} className="shrink-0 px-4 py-2 bg-white border border-primary-200 text-primary-700 rounded-xl text-sm font-semibold hover:bg-primary-50 transition-colors">
          Скачать .xlsx
        </button>
      </div>

      {/* Dropzone */}
      <div>
        <p className="text-sm font-semibold text-slate-800 mb-1.5">Шаг 2 — загрузите заполненный файл</p>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0] ?? null); }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${dragging ? "border-primary-400 bg-primary-50/50" : "border-slate-200 hover:border-slate-300 bg-slate-50/50"}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <div className="flex items-center justify-center gap-3 text-slate-800">
              <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
              <div className="text-left">
                <p className="text-sm font-semibold">{file.name}</p>
                <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(0)} КБ · нажмите, чтобы заменить</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-500">
              <Upload className="w-8 h-8 text-slate-400" />
              <p className="text-sm font-medium">Перетащите файл сюда или нажмите для выбора</p>
              <p className="text-xs text-slate-400">Только .xlsx, до 5 МБ</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 2: review ──────────────────────────────────────────────────────────
function CountPill({ icon, label, created, existing }: { icon: React.ReactNode; label: string; created: number; existing: number }) {
  return (
    <div className="flex-1 p-3 rounded-2xl bg-slate-50 border border-slate-100">
      <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-1">{icon}{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-emerald-600">+{created}</span>
        {existing > 0 && <span className="text-xs text-slate-400">{existing} уже есть</span>}
      </div>
    </div>
  );
}

function ReviewStep({ preview }: { preview: ImportPreviewResult }) {
  const c: ImportCounts = preview.counts;
  const errors = preview.issues.filter(i => i.level === "error");
  const warnings = preview.issues.filter(i => i.level === "warning");
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <CountPill icon={<UserSquare2 className="w-3.5 h-3.5" />} label="Ученики" created={c.students_new} existing={c.students_existing} />
        <CountPill icon={<GraduationCap className="w-3.5 h-3.5" />} label="Группы" created={c.groups_new} existing={c.groups_existing} />
      </div>

      {preview.ok ? (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> Ошибок нет — можно импортировать.
        </div>
      ) : (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Есть ошибки — исправьте файл и загрузите снова.
        </div>
      )}

      {(errors.length > 0 || warnings.length > 0) && (
        <div className="max-h-52 overflow-y-auto rounded-2xl border border-slate-100 divide-y divide-slate-50">
          {errors.map((iss, i) => (
            <div key={`e${i}`} className="flex items-start gap-2 p-2.5 text-xs bg-red-50/40">
              <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-red-500" />
              <span className="text-slate-600"><b className="text-slate-800">{iss.sheet}</b> строка {iss.row}{iss.field ? ` · ${iss.field}` : ""}: {iss.message}</span>
            </div>
          ))}
          {warnings.map((iss, i) => (
            <div key={`w${i}`} className="flex items-start gap-2 p-2.5 text-xs bg-amber-50/40">
              <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span className="text-slate-600"><b className="text-slate-800">{iss.sheet}</b> строка {iss.row}{iss.field ? ` · ${iss.field}` : ""}: {iss.message}</span>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

// ── Step 3: done ──────────────────────────────────────────────────────────────
function DoneStep({ result }: { result: ImportCommitResult }) {
  const c = result.counts;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
        <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
        <div>
          <p className="text-sm font-bold text-emerald-800">Импорт выполнен</p>
          <p className="text-xs text-emerald-700 mt-0.5">
            Добавлено: {c.students_new} {pluralRu(c.students_new, ["ученик", "ученика", "учеников"])}, {c.groups_new} {pluralRu(c.groups_new, ["группа", "группы", "групп"])}.
          </p>
        </div>
      </div>
    </div>
  );
}
