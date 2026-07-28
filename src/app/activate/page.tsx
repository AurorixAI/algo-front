"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

function ActivationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const setFromTokens = useAuthStore((state) => state.setFromTokens);
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("Токен активации отсутствует в ссылке. Пожалуйста, проверьте ссылку из письма.");
      return;
    }

    let isMounted = true;
    const activeToken = token;

    async function activate() {
      try {
        const response = await authApi.activate(activeToken);
        if (!isMounted) return;

        setOrgName(response.org?.name || null);
        setStatus("success");

        // Set user auth state in store
        setFromTokens(
          response.user,
          response.tokens.access_token,
          response.tokens.refresh_token,
          response.org
        );
      } catch (err: any) {
        if (!isMounted) return;
        setStatus("error");
        setErrorMsg(err.message || "Не удалось активировать аккаунт. Возможно, ссылка устарела или уже была использована.");
      }
    }

    activate();

    return () => {
      isMounted = false;
    };
  }, [token, setFromTokens]);

  // Countdown timer for automatic redirect on success
  useEffect(() => {
    if (status !== "success") return;

    if (countdown <= 0) {
      router.push("/admin/students");
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [status, countdown, router]);

  return (
    <GlassCard variant="elevated" className="p-8">
      {status === "loading" && (
        <div className="text-center py-8 space-y-6">
          <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
            <Loader2 className="w-12 h-12 text-primary-600 animate-spin" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-slate-900">Активация аккаунта</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              Пожалуйста, подождите. Мы проверяем ваши учетные данные и активируем организацию.
            </p>
          </div>
        </div>
      )}

      {status === "success" && (
        <div className="text-center py-6 space-y-6">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
          >
            <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
          </motion.div>

          <div className="space-y-2">
            <h3 className="text-xl font-bold text-slate-900">Успешно активировано!</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              Организация {orgName ? <strong>«{orgName}»</strong> : "успешно"} зарегистрирована и активирована.
            </p>
            <p className="text-xs text-slate-400">
              Автоматический переход в личный кабинет через {countdown} сек...
            </p>
          </div>

          <Button
            onClick={() => router.push("/admin/students")}
            className="w-full mt-4"
            size="lg"
            icon={<ArrowRight className="w-4 h-4" />}
          >
            Перейти в кабинет
          </Button>
        </div>
      )}

      {status === "error" && (
        <div className="text-center py-6 space-y-6">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
          >
            <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center">
              <XCircle className="w-10 h-10 text-red-600" />
            </div>
          </motion.div>

          <div className="space-y-2">
            <h3 className="text-xl font-bold text-slate-900">Ошибка активации</h3>
            <p className="text-sm text-red-600 max-w-sm mx-auto bg-red-50/50 p-3 rounded-lg border border-red-100">
              {errorMsg}
            </p>
          </div>

          <Button
            onClick={() => router.push("/login")}
            className="w-full mt-4"
            size="lg"
            variant="secondary"
          >
            Вернуться ко входу
          </Button>
        </div>
      )}
    </GlassCard>
  );
}

export default function ActivatePage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background decorations */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[80vw] h-[80vw] bg-blue-100/60 rounded-full blur-[120px] mix-blend-multiply opacity-70" />
        <div className="absolute top-[20%] right-[10%] w-[60vw] h-[60vw] bg-indigo-100/50 rounded-full blur-[100px] mix-blend-multiply opacity-60" />
        <div className="absolute -bottom-[20%] left-[20%] w-[70vw] h-[70vw] bg-slate-200/60 rounded-full blur-[140px] mix-blend-multiply" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <Link href="/" className="inline-flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white shadow-lg shadow-primary-500/30">
              <span className="text-2xl font-bold">∫</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-900">ALGO</h1>
          </Link>
          <p className="text-slate-500 text-sm">Подтверждение учетной записи</p>
        </motion.div>

        {/* Card containing content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Suspense
            fallback={
              <GlassCard variant="elevated" className="p-8">
                <div className="text-center py-8 space-y-6">
                  <Loader2 className="w-12 h-12 text-primary-600 animate-spin mx-auto animate-pulse" />
                  <h3 className="text-xl font-bold text-slate-900">Загрузка...</h3>
                </div>
              </GlassCard>
            }
          >
            <ActivationContent />
          </Suspense>
        </motion.div>
      </div>
    </div>
  );
}
