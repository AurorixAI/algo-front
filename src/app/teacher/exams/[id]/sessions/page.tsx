"use client";

import { ComingSoon } from "@/components/ui/coming-soon";
import { FileText } from "lucide-react";

export default function ExamSessionsPage() {
  return (
    <ComingSoon
      title="Экзамены в разработке"
      description="Результаты прохождения контрольных работ учениками будут доступны в следующем обновлении."
      icon={FileText}
      color="primary"
    />
  );
}
