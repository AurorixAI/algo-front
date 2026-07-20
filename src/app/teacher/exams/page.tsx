"use client";

import { ComingSoon } from "@/components/ui/coming-soon";
import { FileText } from "lucide-react";

export default function TeacherExamsPage() {
  return (
    <ComingSoon
      title="Экзамены"
      description="Генерация контрольных работ и быстрых проверок откроется после завершения этапов подключения центра."
      icon={FileText}
      color="primary"
      features={[
        "Автоматическая генерация уникальных вариантов",
        "База готовых задач по алгебре и геометрии",
        "Anti-Cheat режим с рандомизацией чисел",
        "Анализ результатов и ответов учеников",
      ]}
    />
  );
}
