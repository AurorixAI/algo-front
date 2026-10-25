import type { Metadata } from "next";
import { SetPasswordPage } from "@/components/onboarding/set-password-page";

export const metadata: Metadata = {
  title: "Задать пароль — ALGO",
  // A one-time link: nothing about it belongs in a search index or a referrer header.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function SetPasswordRoute({ params }: { params: { token: string } }) {
  return <SetPasswordPage token={params.token} />;
}
