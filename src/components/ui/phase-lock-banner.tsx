"use client";

import { Notice } from "@/components/ui/notice";
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
  return <Notice variant="blocked" role="note" className={className}>{text}</Notice>;
}
