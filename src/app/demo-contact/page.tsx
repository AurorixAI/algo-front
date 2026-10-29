import { NarrowPage } from "@/components/onboarding/onboarding-shell";
import { GlassCard } from "@/components/ui/glass-card";
import { NOINDEX } from "@/lib/noindex";

export const metadata = { title: "Заявка на демо — ALGO", ...NOINDEX };
// the e-mail is a RUNTIME variable of the container (one image on every domain): read per request, not at build
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>".]{2,}$/;

/**
 * The answer of the old `/request-demo` and `/register` when there is no landing to send a visitor to (the runtime variable
 * SITE_URL is empty or names this very host: a redirect would loop).  K3 P2.
 */
export default function DemoContactPage() {
  const email = (process.env.SUPPORT_EMAIL ?? "").trim();
  return (
    <NarrowPage>
      <GlassCard className="p-6 text-center" data-testid="demo-contact">
        <h1 className="text-xl font-semibold text-slate-900 mb-2">Заявка на демо</h1>
        <p className="text-slate-600">
          Напишите нам — менеджер ALGO свяжется с вами и покажет платформу на примере вашего центра.
        </p>
        {EMAIL.test(email) && (
          <p className="mt-4">
            <a href={`mailto:${email}`} className="text-primary-600 font-medium hover:underline">
              {email}
            </a>
          </p>
        )}
      </GlassCard>
    </NarrowPage>
  );
}
