import type { Metadata } from "next";
import { DemoRequestPage } from "@/components/onboarding/demo-request-page";

export const metadata: Metadata = {
  title: "Запросить демо — ALGO",
  description: "Доступ к ALGO — по приглашению. Оставьте заявку, и мы покажем платформу на примере вашего центра.",
};

export default function RequestDemoRoute() {
  return <DemoRequestPage />;
}
