"use client";

import { ComingSoon } from "@/components/ui/coming-soon";
import { BarChart3 } from "lucide-react";

export default function TeacherAnalyticsPage() {
  return (
    <ComingSoon
      title="Аналитика"
      description="Подробная аналитика по вашим ученикам — пробелы, прогресс и рекомендации."
      icon={BarChart3}
      color="purple"
      features={[
        "Индивидуальный профиль каждого ученика",
        "Карта пробелов по навыкам (skill gap map)",
        "Рекомендации по темам для повторения",
        "Сравнение результатов до и после занятий",
        "Отчёт для родителей",
      ]}
    />
  );
}
