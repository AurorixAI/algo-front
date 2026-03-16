"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Redirect page: /diagnostic/{code} → /d/{code}
 * Keeps backward compatibility with existing QR codes.
 * All confirm + welcome + testing logic is now in /d/{code}.
 */
export default function DiagnosticEntryPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;

  useEffect(() => {
    router.replace(`/d/${code}`);
  }, [code, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-blue-50">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto" />
        <p className="text-sm text-slate-500 mt-3">Перенаправление...</p>
      </div>
    </div>
  );
}
