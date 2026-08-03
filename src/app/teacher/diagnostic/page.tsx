"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Раздел «Диагностика» убран из teacher-панели.
 * Учителя используют «Экзамены → Быстрая проверка» вместо CAT-диагностики.
 * Этот redirect оставлен для обратной совместимости.
 */
export default function TeacherDiagnosticRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/teacher/exams"); }, [router]);
  return null;
}
