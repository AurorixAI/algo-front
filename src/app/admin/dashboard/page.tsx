"use client";

import { ComingSoon } from "@/components/ui/coming-soon";
import { LayoutDashboard } from "lucide-react";

export default function AdminDashboardPage() {
  return (
    <ComingSoon
      title="Панель управления"
      description="Общая сводка по организации — ключевые метрики, активность и прогресс учеников."
      icon={LayoutDashboard}
      color="primary"
      features={[
        "Количество активных учеников и учителей",
        "Статистика диагностик за неделю/месяц",
        "Средний балл по организации",
        "График активности по дням",
        "Топ-5 проблемных тем",
      ]}
    />
  );
}
