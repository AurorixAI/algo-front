"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Copy } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { buttonClass } from "@/lib/button-style";
import { useToast } from "@/components/ui/toast";
import { COPY_FAILED_TEXT, examLinkHere } from "@/lib/exam-link";
import { copyText } from "@/lib/use-copy";

/**
 * «Экзамен назначен!» - the answer after an exam is bound to a lesson.  ONE dialog for the library «Назначить» and for the group page
 * «Добавить экзамен -> Из библиотеки -> Выбрать» (E-C, decision 11: the same action gives the same result).
 */
export interface SuccessAssignModalProps {
  result: { access_code?: string | null; url?: string | null; group_name?: string | null; exam_id: string; /** «чт, 5 ноября · 10:00–11:00» - the lesson the lobby is opened on */ lesson_label?: string | null };
  returnHref: string;
  onClose: () => void;
}

export function SuccessAssignModal({ result, returnHref, onClose }: SuccessAssignModalProps) {
  const [copied, setCopied] = useState(false);
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
    <>
      <Modal
        open
        title="Экзамен назначен!"
        description={result.group_name ? <>Для группы <span className="font-semibold text-slate-800">{result.group_name}</span></> : undefined}
        onClose={onClose}
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={onClose} className="max-md:min-h-11">Закрыть</Button>
            <Link
              href={`/teacher/exams/${result.exam_id}?return_to=${encodeURIComponent(returnHref)}`}
              className={`${buttonClass({ variant: "primary" })} max-md:min-h-11`}
            >
              В Hub экзамена
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </>
        )}
      >
        <div className="space-y-4 pb-2">
          {result.lesson_label && (
            <p data-testid="assigned-lesson" className="text-sm text-slate-600">Занятие: <span className="font-semibold text-slate-800">{result.lesson_label}</span></p>
          )}
          {result.access_code && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600">Код доступа для учеников:</p>
              <div className="flex items-center justify-between rounded-control border border-slate-200 bg-slate-50 p-3">
                <span className="font-mono text-xl font-bold tracking-widest text-slate-900">{result.access_code}</span>
                <Button variant="ghost" size="icon" onClick={handleCopy} title="Скопировать ссылку" aria-label="Скопировать ссылку">
                  {copied ? <Check className="h-4 w-4 text-success-700" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
      {toastNode}
    </>
  );
}
