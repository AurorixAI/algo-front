import type { Metadata } from "next";
import { ForgotPasswordPage } from "@/components/onboarding/forgot-password-page";

export const metadata: Metadata = {
  title: "Забыли пароль — ALGO",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordRoute() {
  return <ForgotPasswordPage />;
}
