import type { Metadata } from "next";
import { ConfirmEmailPage } from "@/components/onboarding/confirm-email-page";

export const metadata: Metadata = {
  title: "Подтвердить новый адрес — ALGO",
  // A one-time link: nothing about it belongs in a search index or a referrer header.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ConfirmEmailRoute({ params }: { params: { token: string } }) {
  return <ConfirmEmailPage token={params.token} />;
}
