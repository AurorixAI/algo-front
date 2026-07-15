"use client";

import { ComingSoon } from "@/components/ui/coming-soon";
import { FileText } from "lucide-react";

export default function NewExamPage() {
  return (
    <ComingSoon
      title="Создать экзамен"
      description="Генерация контрольных работ и быстрых проверок будет доступна в следующем обновлении."
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
