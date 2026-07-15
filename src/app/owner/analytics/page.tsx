"use client";

import { ComingSoon } from "@/components/ui/coming-soon";
import { BarChart3 } from "lucide-react";

export default function OwnerAnalyticsPage() {
  return (
    <ComingSoon
      title="Аналитика организации"
      description="Этот раздел находится в разработке и будет доступен в следующем обновлении."
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
