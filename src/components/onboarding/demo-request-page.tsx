"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardCheck, Compass, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { BrandMark, PublicBackdrop } from "@/components/onboarding/onboarding-shell";
import {
  COMMENT_MAX,
  EMPTY_DEMO_FORM,
  SUCCESS_STEPS,
  STUDENTS_MAX,
  buildDemoBody,
  captureSource,
  classifyDemoFailure,
  maskPhone,
  validateDemoForm,
  type DemoErrors,
  type DemoField,
  type DemoFormValues,
  type DemoSource,
} from "@/lib/demo-request";
import { onboardingApi } from "@/lib/onboarding-api";

const FIELD_ORDER: DemoField[] = ["fullName", "centreName", "city", "phone", "email", "studentsCount", "comment"];
const SOURCE_STORAGE_KEY = "algo-demo-source";

const VALUE_PROPS = [
  {
    icon: Compass,
    title: "Точная картина по каждому ученику",
    text: "Адаптивная диагностика показывает пробелы и строит путь обучения — без угадывания.",
  },
  {
    icon: ClipboardCheck,
    title: "Порядок в центре",
    text: "Группы, посещаемость, оплаты и зарплаты учителей — в одном месте вместо таблиц.",
  },
  {
    icon: ShieldCheck,
    title: "Личное подключение",
    text: "Менеджер проведёт демо и настроит платформу под ваш центр. Доступ — по приглашению.",
  },
] as const;

function readStoredSource(): DemoSource | null {
  try {
    const raw = window.sessionStorage.getItem(SOURCE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DemoSource) : null;
  } catch {
    return null;
  }
}

function storeSource(source: DemoSource) {
  try {
    window.sessionStorage.setItem(SOURCE_STORAGE_KEY, JSON.stringify(source));
  } catch {
    /* private mode: the tags still travel with this visit in memory */
  }
}

export function DemoRequestPage() {
  const [values, setValues] = useState<DemoFormValues>(EMPTY_DEMO_FORM);
  const [errors, setErrors] = useState<DemoErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");
  const [accepted, setAccepted] = useState<{ email: string } | null>(null);
  const source = useRef<DemoSource>({});
  const inFlight = useRef(false);

  useEffect(() => {
    const captured = captureSource(window.location.search, document.referrer, window.location.host, readStoredSource());
    captured.landing = window.location.pathname;
    source.current = captured;
    storeSource(captured);
  }, []);

  const set = useCallback(<K extends keyof DemoFormValues>(key: K, value: DemoFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key as DemoField];
      return next;
    });
  }, []);

  const focusField = (field: DemoField) => {
    document.getElementById(`demo-${field}`)?.focus();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    setBanner(null);
    const found = validateDemoForm(values);
    if (Object.keys(found).length) {
      setErrors(found);
      setBanner("Проверьте отмеченные поля.");
      const first = FIELD_ORDER.find((field) => found[field]);
      if (first) focusField(first);
      return;
    }
    inFlight.current = true;
    setStatus("submitting");
    try {
      await onboardingApi.submitDemoRequest(buildDemoBody(values, source.current));
      setAccepted({ email: values.email.trim() });
      setStatus("success");
    } catch (error) {
      const failure = classifyDemoFailure(error);
      setStatus("idle");
      setBanner(failure.message);
      if (failure.kind === "fields") {
        setErrors(failure.errors);
        const first = FIELD_ORDER.find((field) => failure.errors[field]);
        if (first) focusField(first);
      }
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden p-6 pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))]">
      <PublicBackdrop />
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col">
        <header className="flex items-center justify-between">
          <BrandMark />
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">
            Войти
          </Link>
        </header>

        <main className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-14">
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <span className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary-700">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Закрытый доступ
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.1] text-slate-900 md:text-5xl">
              Доступ к ALGO —{" "}
              <span className="bg-gradient-to-r from-primary-600 to-indigo-600 bg-clip-text text-transparent">по приглашению</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-7 text-slate-600">
              Мы подключаем центры лично. Оставьте заявку — покажем платформу на примере вашего центра и откроем доступ.
            </p>
            <ul className="mt-9 space-y-5">
              {VALUE_PROPS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary-100 bg-white text-primary-600 shadow-sm">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">{title}</p>
                    <p className="mt-0.5 text-sm leading-6 text-slate-500">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.08 }}>
            <GlassCard variant="elevated" className="p-6 sm:p-8">
              <AnimatePresence mode="wait" initial={false}>
                {status === "success" && accepted ? (
                  <motion.div
                    key="done"
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="py-2 text-center"
                    role="status"
                    data-testid="demo-success"
                  >
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                      <CheckCircle2 className="h-9 w-9 text-green-600" aria-hidden />
                    </div>
                    <h2 className="mt-5 text-2xl font-bold text-slate-900">Заявка принята</h2>
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">
                      Спасибо! Подтверждение отправлено на{" "}
                      <span className="font-medium text-slate-800 break-words">{accepted.email}</span>.
                    </p>
                    <ol className="mx-auto mt-6 max-w-sm space-y-3 text-left">
                      {SUCCESS_STEPS.map((step, index) => (
                        <li key={step} className="flex gap-3 text-sm leading-6 text-slate-600">
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary-700">
                            {index + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                    <Link href="/" className="mt-7 inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:underline">
                      На главную <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </motion.div>
                ) : (
                  <motion.form key="form" onSubmit={submit} noValidate initial={{ opacity: 0 }} animate={{ opacity: 1 }} aria-label="Заявка на демо">
                    <h2 className="text-xl font-bold text-slate-900">Запросить демо</h2>
                    <p className="mt-1 text-sm text-slate-500">Займёт минуту. Ответим в течение 1 рабочего дня.</p>

                    {banner && (
                      <div role="alert" className="mt-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        <span>{banner}</span>
                      </div>
                    )}

                    <div className="mt-5 space-y-4">
                      <Input
                        id="demo-fullName"
                        label="ФИО"
                        placeholder="Алишер Каримов"
                        autoComplete="name"
                        maxLength={120}
                        value={values.fullName}
                        onChange={(e) => set("fullName", e.target.value)}
                        error={errors.fullName}
                      />
                      <Input
                        id="demo-centreName"
                        label="Название центра"
                        placeholder="Учебный центр «Прогресс»"
                        autoComplete="organization"
                        maxLength={160}
                        value={values.centreName}
                        onChange={(e) => set("centreName", e.target.value)}
                        error={errors.centreName}
                      />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Input
                          id="demo-city"
                          label="Город"
                          placeholder="Ташкент"
                          autoComplete="address-level2"
                          maxLength={80}
                          value={values.city}
                          onChange={(e) => set("city", e.target.value)}
                          error={errors.city}
                        />
                        <Input
                          id="demo-phone"
                          label="Телефон"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          placeholder="+998 90 123 45 67"
                          value={values.phone}
                          onChange={(e) => set("phone", maskPhone(e.target.value))}
                          // The «+998 » prefix is part of the value: entering the field puts the caret after it, so a digit is never typed in front of it.
                          onFocus={(e) => { const field = e.currentTarget; requestAnimationFrame(() => field.setSelectionRange(field.value.length, field.value.length)); }}
                          error={errors.phone}
                        />
                      </div>
                      <Input
                        id="demo-email"
                        label="Почта"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="name@center.uz"
                        maxLength={254}
                        value={values.email}
                        onChange={(e) => set("email", e.target.value)}
                        error={errors.email}
                      />
                      <div>
                        <label htmlFor="demo-studentsCount" className="mb-1.5 block text-sm font-medium text-slate-700">
                          Сколько у вас учеников <span className="font-normal text-slate-400">— примерно, необязательно</span>
                        </label>
                        <NumberInput
                          id="demo-studentsCount"
                          value={values.studentsCount}
                          onChange={(v) => set("studentsCount", v)}
                          min={1}
                          max={STUDENTS_MAX}
                          placeholder="150"
                          invalid={Boolean(errors.studentsCount)}
                          className="bg-white/80 px-4 text-base backdrop-blur-sm"
                        />
                        {errors.studentsCount && <p className="mt-1.5 text-xs text-red-500">{errors.studentsCount}</p>}
                      </div>
                      <Textarea
                        id="demo-comment"
                        label="Комментарий"
                        placeholder="Что хотите улучшить в центре? Необязательно."
                        rows={3}
                        maxLength={COMMENT_MAX}
                        value={values.comment}
                        onChange={(e) => set("comment", e.target.value)}
                        error={errors.comment}
                      />

                      {/* The honeypot: out of sight, out of the tab order, named so that no browser autofill or password manager recognises it.
                          A person never fills it; a script that fills every field does.  The server's key for it stays `website` (API_CONTRACT §1). */}
                      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" data-testid="demo-honeypot">
                        <Input
                          id="demo-hp"
                          label="Оставьте это поле пустым"
                          name="hp_extra"
                          tabIndex={-1}
                          autoComplete="off"
                          value={values.website}
                          onChange={(e) => set("website", e.target.value)}
                        />
                      </div>

                      <Button type="submit" size="lg" className="w-full" loading={status === "submitting"} icon={<ArrowRight className="h-4 w-4" />}>
                        Отправить заявку
                      </Button>
                      <p className="text-center text-xs leading-5 text-slate-400">
                        Нажимая кнопку, вы соглашаетесь на обработку контактных данных, чтобы мы могли с вами связаться.
                      </p>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
            </GlassCard>
          </motion.section>
        </main>
      </div>
    </div>
  );
}
