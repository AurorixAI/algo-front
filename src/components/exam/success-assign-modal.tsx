"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, CheckCircle, ChevronRight, Copy } from "lucide-react";
import { useScrollLock } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { COPY_FAILED_TEXT, examLinkHere } from "@/lib/exam-link";
import { copyText } from "@/lib/use-copy";

/**
 * «Экзамен назначен!» - the answer after an exam is bound to a lesson.  ONE dialog for the library «Назначить» and for the group page
 * «Добавить экзамен -> Из библиотеки -> Выбрать» (E-C, decision 11: the same action gives the same result).
 */
export interface SuccessAssignModalProps {
  result: { access_code?: string | null; url?: string | null; group_name?: string | null; exam_id: string };
  returnHref: string;
  onClose: () => void;
}

export function SuccessAssignModal({ result, returnHref, onClose }: SuccessAssignModalProps) {
  const [copied, setCopied] = useState(false);
  useScrollLock(true); // mounted only while the dialog is open
  const { showToast, toastNode } = useToast();
  const fullUrl = result.access_code
    ? examLinkHere(result.access_code)
    : result.url || "";

  const handleCopy = () => {
    if (!fullUrl) return;
    void copyText(fullUrl).then((ok) => {
      if (!ok) { showToast(COPY_FAILED_TEXT, "error"); return; }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200/60 p-6 space-y-5 text-center"
      >
        <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
          <CheckCircle className="w-7 h-7" />
        </div>

        <div>
          <h3 className="text-lg font-bold text-slate-900">Экзамен назначен!</h3>
          {result.group_name && (
            <p className="text-xs text-slate-500 mt-1">Для группы <span className="font-semibold text-slate-800">{result.group_name}</span></p>
          )}
        </div>

        {result.access_code && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 font-medium">Код доступа для учеников:</p>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <span className="font-mono text-xl font-bold tracking-widest text-slate-900">{result.access_code}</span>
              <button
                onClick={handleCopy}
                className="p-2 text-slate-500 hover:text-primary-600 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
                title="Скопировать ссылку"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Закрыть
          </button>
          <Link
            href={`/teacher/exams/${result.exam_id}?return_to=${encodeURIComponent(returnHref)}`}
            className="flex-1 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-primary-600 to-violet-600 hover:from-primary-700 hover:to-violet-700 rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
          >
            В Hub экзамена
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </motion.div>
      {toastNode}
    </div>
  );
}
