"use client";

import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { LOCK_COPY } from "@/lib/lock-copy";

interface PhaseLockBannerProps {
  /** Текст вывески. По умолчанию — единый текст про этапы подключения. */
  text?: string;
  className?: string;
}

/**
 * Аккуратная вывеска-баннер: сообщает, что раздел/модуль откроется после
 * завершения этапов подключения центра. Единый вид для всех кабинетов.
 */
export function PhaseLockBanner({ text = LOCK_COPY.sectionBanner, className }: PhaseLockBannerProps) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/70 px-4 py-3",
        className
      )}
    >
      <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
        <Lock className="w-4 h-4" />
      </div>
      <p className="text-sm text-amber-800">{text}</p>
    </div>
  );
}
