"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  ArrowRight, ArrowLeft, AlertCircle, CheckCircle, Building2, UserCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { formatUzPhone, isValidUzPhone } from "@/lib/phone";

const orgTypes = [
  { value: "private_school", label: "Частная школа" },
  { value: "tutoring_center", label: "Учебный центр" },
  { value: "tutor", label: "Репетитор" },
  { value: "university", label: "Университет" },
  { value: "other", label: "Другое" },
];

export default function RegisterPage() {
  const router = useRouter();
  const { applyOrg, isLoading, error, clearError } = useAuthStore();

  const [step, setStep] = useState(1);
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState("");
  const [phone, setPhone] = useState("+998 ");
  const [address, setAddress] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    clearError();
    setLocalError(null);

    if (password !== confirmPassword) {
      setLocalError("Пароли не совпадают");
      return;
    }
    if (password.length < 8) {
      setLocalError("Пароль должен содержать минимум 8 символов");
      return;
    }

    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || firstName;

    try {
      await applyOrg({
        org_name: orgName.trim(),
        org_type: orgType || "private_school",
        city: address.trim() || undefined,
        phone: phone.trim(),
        email: email.trim(),
        password,
        first_name: firstName,
        last_name: lastName,
      });
      // apply() only ever creates a pending application — it never issues
      // tokens or logs anyone in (an admin must approve, then the owner
      // activates via the emailed link). Always show the pending screen.
      setSuccess(true);
      setStep(3);
    } catch {
      // Error handled by store
    }
  };

  const canProceedStep1 = orgName.trim().length >= 2 && isValidUzPhone(phone);
  const canSubmit = fullName.trim() && email && password && confirmPassword;

  const displayError = localError || error;

  // Step indicator component
  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-0 mb-8">
      {[1, 2, 3].map((s, i) => (
        <div key={s} className="flex items-center">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
              s < step
                ? "bg-green-100 text-green-600"
                : s === step
                ? "bg-primary-600 text-white shadow-lg shadow-primary-600/30"
                : "bg-slate-100 text-slate-400"
            }`}
          >
            {s < step ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              s
            )}
          </div>
          {i < 2 && (
            <div
              className={`w-16 h-0.5 transition-colors duration-300 ${
                s < step ? "bg-green-300" : "bg-slate-200"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
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
          className="text-center mb-6"
        >
          <Link href="/" className="inline-flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white shadow-lg shadow-primary-500/30">
              <span className="text-2xl font-bold">∫</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-900">ALGO</h1>
          </Link>
          <p className="text-slate-500 text-sm">Платформа диагностики и обучения</p>
        </motion.div>

        {/* Step indicator */}
        <StepIndicator />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <GlassCard variant="elevated" className="p-8">
            {displayError && (
              <div className="flex items-center gap-2 p-3 mb-5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{displayError}</span>
              </div>
            )}

            <AnimatePresence mode="wait">
              {/* Step 1: Organization info */}
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-5"
                >
                  {/* Icon + heading */}
                  <div className="text-center mb-2">
                    <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-blue-50 flex items-center justify-center">
                      <Building2 className="w-7 h-7 text-blue-600" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">Данные организации</h3>
                    <p className="text-sm text-slate-500">Расскажите о вашей организации</p>
                  </div>

                  <Input
                    label="Название организации"
                    placeholder="Лицей №42 / Study Center Pro"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    autoFocus
                  />

                  <Select
                    label="Тип организации"
                    placeholder="Выберите тип"
                    options={orgTypes}
                    value={orgType}
                    onChange={(e) => setOrgType(e.target.value)}
                  />

                  <Input
                    label="Телефон"
                    placeholder="+998 XX XXX XX XX"
                    required
                    value={phone}
                    onChange={(e) => setPhone(formatUzPhone(e.target.value))}
                  />

                  <Input
                    label="Адрес (опционально)"
                    placeholder="г. Ташкент, ул. ..."
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />

                  <Button
                    onClick={() => { setLocalError(null); clearError(); setStep(2); }}
                    disabled={!canProceedStep1}
                    className="w-full"
                    size="lg"
                    icon={<ArrowRight className="w-4 h-4" />}
                  >
                    Далее
                  </Button>
                </motion.div>
              )}

              {/* Step 2: Admin account */}
              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-5"
                >
                  {/* Icon + heading */}
                  <div className="text-center mb-2">
                    <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-blue-50 flex items-center justify-center">
                      <UserCircle className="w-7 h-7 text-blue-600" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">Владелец</h3>
                    <p className="text-sm text-slate-500">Данные владельца аккаунта</p>
                  </div>

                  <Input
                    label="Ваше имя"
                    placeholder="Иван Петров"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoFocus
                  />

                  <Input
                    label="Email"
                    type="email"
                    placeholder="admin@school.uz"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />

                  <Input
                    label="Пароль"
                    type="password"
                    placeholder="Минимум 8 символов"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />

                  <Input
                    label="Подтвердите пароль"
                    type="password"
                    placeholder="Повторите пароль"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />

                  <div className="flex gap-3">
                    <Button
                      variant="secondary"
                      onClick={() => { setLocalError(null); clearError(); setStep(1); }}
                      className="flex-1"
                    >
                      Назад
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      loading={isLoading}
                      disabled={!canSubmit}
                      className="flex-1"
                      size="lg"
                      icon={<ArrowRight className="w-4 h-4" />}
                    >
                      Создать аккаунт
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Step 3: Success (Pending approval) */}
              {step === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-4"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
                  >
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircle className="w-8 h-8 text-green-600" />
                    </div>
                  </motion.div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Заявка принята</h3>
                  <p className="text-sm text-slate-500 mb-2">
                    Ваша заявка на регистрацию организации &laquo;{orgName}&raquo; успешно отправлена и ожидает подтверждения администратором.
                  </p>
                  <p className="text-sm text-slate-500 mb-6">
                    После одобрения на указанный email <strong>{email}</strong> будет отправлена ссылка для активации аккаунта.
                  </p>
                  <Button
                    onClick={() => router.push("/login")}
                    className="w-full"
                    size="lg"
                  >
                    Вернуться ко входу
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </GlassCard>
        </motion.div>

        {step < 3 && (
          <p className="text-center mt-6 text-sm text-slate-500">
            Уже есть аккаунт?{" "}
            <Link href="/login" className="text-primary-600 font-medium hover:underline">
              Войти
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
