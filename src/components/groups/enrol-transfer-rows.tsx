"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/radio";
import { transferWordsOf, CARRIED_NONE_TEXT } from "@/lib/dry-run";
import { ENROL_HERE_ADD_LABEL, ENROL_HERE_TRANSFER_LABEL } from "@/lib/enrol-labels";
import { EFFECTS_LOADING_TEXT, EFFECTS_RETRY_LABEL, effectsFailureText } from "@/lib/money-effects";
import { isStaleRefusal, refusedInWords, REFRESH_LABEL, type EffectsPreview } from "@/lib/money-preview";
import { ExceptionRow } from "./enrol-exceptions";
import type { GroupJoinMode } from "@/lib/api";

export interface EnrolTransferStudent {
  id: string;
  name: string;
  from: string;
  /** the server-side hint of a student who is in several groups (only for the mode «Перевести сюда») */
  hint?: string | null;
}

/** The words of the server about the money of the move, in the row of the student they are about: plain muted text, no frame and no title.  A skeleton of one line while it is asked; a failure says it and offers «Повторить». */
function Words({ preview, lines, none, onRetry }: { preview: EffectsPreview; lines: string[]; none: boolean; onRetry: () => void }) {
  if (preview.status === "idle") return null;
  if (preview.status === "loading") {
    return (
      <div data-testid="transfer-preview" data-state="loading" aria-busy="true" role="status" aria-label={EFFECTS_LOADING_TEXT} className="mt-2 space-y-1.5">
        <span className="sr-only">{EFFECTS_LOADING_TEXT}</span>
        <div className="h-3.5 w-3/4 animate-pulse rounded bg-slate-200" />
      </div>
    );
  }
  if (preview.status === "failed") {
    return (
      <div data-testid="transfer-preview" data-state="failed" role="alert" className="mt-2 space-y-1.5">
        <p className="text-sm font-medium text-amber-900">{effectsFailureText(preview.error)}</p>
        {isStaleRefusal(preview.error)
          ? <Button type="button" data-testid="transfer-preview-refresh" onClick={() => window.location.reload()} variant="secondary" size="sm">{REFRESH_LABEL}</Button>
          : !refusedInWords(preview.error) && <Button type="button" data-testid="transfer-preview-retry" onClick={onRetry} variant="secondary" size="sm">{EFFECTS_RETRY_LABEL}</Button>}
      </div>
    );
  }
  const shown = none ? [CARRIED_NONE_TEXT] : lines;
  if (shown.length === 0) return null;
  return (
    <div data-testid="transfer-preview" data-state="ready" className="mt-1.5 space-y-0.5 text-xs text-slate-600">
      <ul data-testid={none ? "transfer-carried-none" : "transfer-carried"} className="space-y-0.5">
        {shown.map((text, index) => <li key={`${index}-${text}`} className="[overflow-wrap:anywhere]">{text}</li>)}
      </ul>
    </div>
  );
}

/**
 * Students who are in another group (Money-2, frame 5): ONE switch «Перевести сюда / Оставить в обеих» for all of them (the server's rule is one mode per request) and a row per student with the place he is
 * in now and the server's words about the money of his move right under it.  One student - the switch stands in his own row.
 */
export function EnrolTransferRows({ students, mode, onMode, preview, onRetry }: { students: readonly EnrolTransferStudent[]; mode: GroupJoinMode; onMode: (next: GroupJoinMode) => void; preview: EffectsPreview; onRetry: () => void }) {
  const words = preview.status === "ready" ? transferWordsOf(preview.answer) : { byStudent: new Map<string, string[]>(), none: false };
  const single = students.length === 1;
  const hintOf = (student: EnrolTransferStudent): ReactNode => (mode === "transfer" && student.hint
    ? <p className="mt-1 text-xs text-warning-800" data-testid="student-many-groups-hint">{student.name} — {student.hint}</p>
    : null);
  const switcher = (
    <div className="mt-2">
      <SegmentedControl
        ariaLabelledBy="enrol-transfer-label"
        testId="enrol-mode"
        value={mode}
        onChange={(next) => onMode(next as GroupJoinMode)}
        options={[{ value: "transfer", label: ENROL_HERE_TRANSFER_LABEL }, { value: "add", label: ENROL_HERE_ADD_LABEL }]}
        className="inline-grid grid-flow-col auto-cols-max"
        buttonClassName="px-3 font-medium"
      />
    </div>
  );
  // the words about nobody in particular stand under the last row; with several students and a failure the one message stands there too
  const general = words.byStudent.get("") ?? [];
  const lonely = (id: string) => (single ? [...(words.byStudent.get(id) ?? []), ...general] : words.byStudent.get(id) ?? []);
  if (single) {
    const only = students[0];
    return (
      <ExceptionRow tone="info" testId="enrol-transfer-choice">
        <span id="enrol-transfer-label">
          <span className="font-semibold text-slate-900">{only.name}</span>
          <span className="text-slate-600"> сейчас в «{only.from}»</span>
        </span>
        {switcher}
        {hintOf(only)}
        <Words preview={preview} lines={lonely(only.id)} none={words.none} onRetry={onRetry} />
      </ExceptionRow>
    );
  }
  return (
    <>
      <ExceptionRow tone="info" testId="enrol-transfer-choice">
        <span id="enrol-transfer-label" className="font-semibold text-slate-900">Ученики из других групп</span>
        {switcher}
      </ExceptionRow>
      {students.map((student) => (
        <ExceptionRow key={student.id} tone="muted" testId="enrol-transfer-student">
          <span className="font-semibold text-slate-900">{student.name}</span>
          <span className="text-slate-600"> сейчас в «{student.from}»</span>
          {hintOf(student)}
          {preview.status === "ready" && <Words preview={preview} lines={words.byStudent.get(student.id) ?? []} none={false} onRetry={onRetry} />}
        </ExceptionRow>
      ))}
      {preview.status === "ready" && (general.length > 0 || words.none) && (
        <ExceptionRow tone="muted" testId="enrol-transfer-general"><Words preview={preview} lines={general} none={words.none} onRetry={onRetry} /></ExceptionRow>
      )}
      {(preview.status === "loading" || preview.status === "failed") && (
        <ExceptionRow tone="muted" testId="enrol-transfer-state"><Words preview={preview} lines={[]} none={false} onRetry={onRetry} /></ExceptionRow>
      )}
    </>
  );
}
