"use client";

import { ComingSoon } from "@/components/ui/coming-soon";
import { BarChart3 } from "lucide-react";

export default function OwnerAnalyticsPage() {
  return (
    <ComingSoon
      title="Аналитика организации"
      description="Модуль откроется после завершения 1-2 этапа подключения центра."
      icon={BarChart3}
      color="purple"
      features={[
        "Рейтинг эффективности преподавателей (θ)",
        "Бизнес-показатели и отток (Retention/Churn)",
        "Анализ наполняемости и рентабельности групп",
      ]}
    />
  );
}
