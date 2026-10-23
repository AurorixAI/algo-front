"use client";

import { Select } from "@/components/ui/select";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { orgApi, authApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { Settings, Building2, Save, CheckCircle, Shield, Key, Wallet, ClipboardCheck, Banknote, Loader2, LucideIcon } from "lucide-react";
import {
  ATTENDANCE_SCOPE_KEYS,
  BILLING_DAY_RANGE,
  billingDayHint,
  DEFAULT_PAYMENT_SETTINGS,
  diffPaymentSettings,
  EXCUSE_DEADLINE_DAYS_RANGE,
  EXCUSE_DEADLINE_LESSONS_RANGE,
  EXPIRING_DAYS_RANGE,
  EXPIRING_LESSONS_RANGE,
  FIXED_DAY_HINT,
  LESSONS_PER_PAYMENT_RANGE,
  PAYMENT_MODELS,
  paymentModelOf,
  paymentModelPatch,
  paymentsScopeKeys,
  validatePaymentSettings,
  type PaymentModel,
  type PaymentSettings,
  type PaymentSettingsScope,
} from "@/lib/payments";
import {
  DEFAULT_DIVISOR,
  DEFAULT_PAYROLL_SETTINGS,
  DIVISOR_RANGE,
  PAYROLL_PACKAGE_TEXT,
  lineAmount,
  parseDivisor,
  payrollFormulaText,
  type PayrollSettings,
} from "@/lib/payroll";
import { ACCOUNTING_START_MIN, accountingStartImpactLines, accountingStartOpeningsToReview, formatMoney, isIsoDate } from "@/lib/payments";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { OpeningsChecklist } from "@/components/payments/openings-widgets";
import { openingsHref } from "@/lib/openings";
import { CANCELLED_LESSON_TEXT, REGIME_HINT, regimeChanges, regimeImpactLines } from "@/lib/payments-logica";
import { buildDivisorBody, DIVISOR_FROM_LABEL, DIVISOR_HELP, divisorChangeText, divisorFor, divisorHistoryRows, divisorMonthTitle } from "@/lib/payroll-logica";
import { formatBusinessDate } from "@/lib/business-time";
import { monthOfDate as payrollMonthOf, rateMonthOptions } from "@/lib/payroll";
import { daysWord, lessonsWord } from "@/lib/plural";
import { effectiveRole } from "@/lib/role-home";
import {
  parseSettingsSection,
  reconcileDraft,
  SETTINGS_SECTIONS,
  settingsSectionHref,
  visibleSettingsSections,
  type SettingsSection as SectionKey,
} from "@/lib/settings-sections";
import { DateInput } from "@/components/ui/date-input";
import { Radio } from "@/components/ui/radio";
import { NumberInput } from "@/components/ui/number-input";

interface SettingsSectionProps {
  title: string;
  description: string;
  icon: LucideIcon;
  children: React.ReactNode;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  saveText?: string;
  disabledSave?: boolean;
}

function SettingsSection({
  title, description, icon: Icon, children,
  onSave, saving, saved, saveText = "Сохранить", disabledSave = false
}: SettingsSectionProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      aria-labelledby="settings-section-title"
      className="min-w-0 space-y-5"
    >
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100 shadow-sm shrink-0">
            <Icon className="w-5 h-5 text-slate-600" />
          </div>
          <h2 id="settings-section-title" className="text-lg font-bold text-slate-900">{title}</h2>
        </div>
        <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-5 sm:p-8">
        <div className="space-y-6">
          {children}

          <div className="pt-6 mt-6 border-t border-slate-100 flex items-center justify-end">
            <button
              onClick={onSave}
              disabled={saving || disabledSave || saved}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-all ${
                saved
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-slate-900 text-white hover:bg-slate-800 shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              }`}
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : saved ? (
                <CheckCircle className="w-4 h-4 text-emerald-600" />
              ) : null}
              {saved ? "Сохранено" : saving ? "Сохранение..." : saveText}
            </button>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

const inputClasses = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium text-slate-900";
const labelClasses = "block text-sm font-semibold text-slate-700 mb-1.5";

const numberInputClasses = `${inputClasses} !w-24`;

type SaveState = { saving: boolean; saved: boolean; error: string | null };
const IDLE_SAVE: SaveState = { saving: false, saved: false, error: null };

/**
 * The payment settings are one record on the server but two sections on the screen («Оплаты»,
 * «Посещаемость»).  The draft lives here, so switching sections never loses typing, and each section
 * saves only its own fields.
 */
function usePaymentSettingsDraft(enabled: boolean) {
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(enabled ? "loading" : "unavailable");
  const [loaded, setLoaded] = useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);
  const [form, setForm] = useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);
  const [saves, setSaves] = useState<Record<PaymentSettingsScope, SaveState>>({ payments: IDLE_SAVE, attendance: IDLE_SAVE });
  const refreshSummary = usePaymentsSummary((state) => state.refresh);

  useEffect(() => {
    if (!enabled) { setStatus("unavailable"); return; }
    let cancelled = false;
    orgApi.getPaymentSettings()
      .then((data) => {
        if (cancelled) return;
        const next = { ...DEFAULT_PAYMENT_SETTINGS, ...data };
        setLoaded(next);
        setForm(next);
        setStatus("ready");
      })
      .catch(() => { if (!cancelled) setStatus("unavailable"); });
    return () => { cancelled = true; };
  }, [enabled]);

  const patch = (scope: PaymentSettingsScope, next: Partial<PaymentSettings>) => {
    setSaves((previous) => ({ ...previous, [scope]: IDLE_SAVE }));
    setForm((previous) => ({ ...previous, ...next }));
  };

  const setSave = (scope: PaymentSettingsScope, state: SaveState) =>
    setSaves((previous) => ({ ...previous, [scope]: state }));

  const save = async (scope: PaymentSettingsScope) => {
    const problem = validatePaymentSettings(form, scope);
    if (problem) { setSave(scope, { saving: false, saved: false, error: problem }); return; }
    // Only the fields this section shows: a hidden leftover (the other model's size, say) is not sent.
    const keys = scope === "payments" ? paymentsScopeKeys(paymentModelOf(form)) : ATTENDANCE_SCOPE_KEYS;
    const changes = diffPaymentSettings(loaded, form, keys);
    const flashSaved = () => {
      setSave(scope, { saving: false, saved: true, error: null });
      setTimeout(() => setSaves((previous) => ({ ...previous, [scope]: { ...previous[scope], saved: false } })), 3000);
    };
    if (Object.keys(changes).length === 0) { flashSaved(); return; }
    setSave(scope, { saving: true, saved: false, error: null });
    try {
      const updated = await orgApi.updatePaymentSettings(changes);
      const next = { ...DEFAULT_PAYMENT_SETTINGS, ...updated };
      setLoaded(next);
      // Only this section's fields are taken from the answer: what the other section has typed stays.
      setForm((previous) => {
        const merged: Record<string, unknown> = { ...previous, updated_by: next.updated_by, updated_at: next.updated_at };
        for (const key of keys) merged[key] = next[key];
        return merged as unknown as PaymentSettings;
      });
      flashSaved();
      void refreshSummary(true, { recheck: true });
    } catch (e: any) {
      setSave(scope, { saving: false, saved: false, error: e.message || "Ошибка сохранения" });
    }
  };

  return { status, form, loaded, saves, patch, save };
}

type PaymentSettingsDraft = ReturnType<typeof usePaymentSettingsDraft>;

/**
 * «Зарплата»: one number - the divisor of the formula.  Read when the section is first opened (the owner's
 * route; nobody else sees the section), saved on its own button.
 */
function usePayrollSettingsDraft(enabled: boolean) {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<PayrollSettings>(DEFAULT_PAYROLL_SETTINGS);
  const [text, setText] = useState(String(DEFAULT_DIVISOR));
  /** F7: the divisor acts from the 1st of a month (`YYYY-MM`; `2020-01` = from the very start); the current month by default. */
  const [validFrom, setValidFromState] = useState(() => payrollMonthOf(formatBusinessDate()));
  const [save, setSave] = useState<SaveState>(IDLE_SAVE);
  const touched = useRef(false);

  useEffect(() => {
    if (!enabled || status === "ready") return;
    let cancelled = false;
    setStatus("loading");
    orgApi.getPayrollSettings()
      .then((data) => {
        if (cancelled) return;
        setLoaded(data);
        // what the owner has already typed is not overwritten by a late answer
        if (!touched.current) setText(String(data.divisor));
        setStatus("ready");
      })
      .catch(() => { if (!cancelled) setStatus("unavailable"); });
    return () => { cancelled = true; };
    // `status` is read only to skip a second request once the answer is in
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, attempt]);

  const change = (value: string) => {
    touched.current = true;
    setSave(IDLE_SAVE);
    setText(value.replace(/\D/g, "").slice(0, 2));
  };
  const setValidFrom = (month: string) => { touched.current = true; setSave(IDLE_SAVE); setValidFromState(month); };

  const submit = async () => {
    const parsed = parseDivisor(text);
    if (parsed.value === null) { setSave({ saving: false, saved: false, error: parsed.error }); return; }
    setSave({ saving: true, saved: false, error: null });
    try {
      const updated = await orgApi.setPayrollDivisor(buildDivisorBody(parsed.value, validFrom));
      setLoaded(updated);
      setText(String(updated.divisor));
      setSave({ saving: false, saved: true, error: null });
      setTimeout(() => setSave((previous) => ({ ...previous, saved: false })), 3000);
    } catch (e: any) {
      setSave({ saving: false, saved: false, error: e.message || "Ошибка сохранения" });
    }
  };

  return { status, loaded, text, save, change, submit, validFrom, setValidFrom, retry: () => setAttempt((n) => n + 1) };
}

type PayrollSettingsDraft = ReturnType<typeof usePayrollSettingsDraft>;

function NumberField({
  id, label, value, range, onChange, suffix,
}: {
  id: string;
  label: string;
  value: number;
  range: { min: number; max: number };
  onChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClasses}>{label}</label>
      <div className="flex items-center gap-2">
        <NumberInput
          id={id}
          min={range.min}
          max={range.max}
          value={Number.isNaN(value) ? "" : String(value)}
          onChange={(next) => onChange(next === "" ? NaN : Number(next))}
          wrapperClassName="w-24"
          className={inputClasses}
        />
        {suffix && <span className="text-sm text-slate-600">{suffix}</span>}
      </div>
    </div>
  );
}

/** «Оплаты»: how the center counts the paid period and whether administrators may enter payments. */
function PaymentsSettingsSection({ draft }: { draft: PaymentSettingsDraft }) {
  const { form, loaded, saves } = draft;
  const accountingChanged = Boolean(form.accounting_start_date) && form.accounting_start_date !== loaded.accounting_start_date;
  const [impact, setImpact] = useState<{ date: string; lines: string[]; toReview: number; error: string | null } | null>(null);
  // What a new start of the accounting changes (the dry run of the server): asked once the owner stops typing the date.
  useEffect(() => {
    const date = form.accounting_start_date;
    if (!accountingChanged || !date || !isIsoDate(date)) { setImpact(null); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      orgApi.previewPaymentSettings({ accounting_start_date: date })
        .then((answer) => { if (!cancelled) setImpact({ date, lines: accountingStartImpactLines(answer.impact), toReview: accountingStartOpeningsToReview(answer.impact), error: null }); })
        // The server refuses a date later than the earliest payment («Есть оплаты до этой даты: …») or before 2020: its sentence goes under the field.
        .catch((cause) => { if (!cancelled) setImpact({ date, lines: [], toReview: 0, error: cause instanceof Error ? cause.message : "Не удалось проверить дату" }); });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [accountingChanged, form.accounting_start_date]);
  const state = saves.payments;
  const model = paymentModelOf(form);
  // F12: a new mode starts for each student from the start of his next period; the dry run says whom it touches and when.
  const regimeDiff = regimeChanges(diffPaymentSettings(loaded, form, paymentsScopeKeys(model)) as Record<string, unknown>);
  const regimeKey = JSON.stringify(regimeDiff);
  const regimeChanged = Object.keys(regimeDiff).length > 0;
  const [regime, setRegime] = useState<{ key: string; lines: string[]; error: string | null } | null>(null);
  useEffect(() => {
    if (!regimeChanged) { setRegime(null); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      orgApi.previewPaymentSettings(regimeDiff)
        .then((answer) => { if (!cancelled) setRegime({ key: regimeKey, lines: regimeImpactLines(answer.regime_impact), error: null }); })
        .catch((cause) => { if (!cancelled) setRegime({ key: regimeKey, lines: [], error: cause instanceof Error ? cause.message : "Не удалось проверить последствия" }); });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
    // `regimeDiff` is a new object on every render; its key stands for the content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regimeChanged, regimeKey]);
  const patch = (next: Partial<PaymentSettings>) => draft.patch("payments", next);
  const choose = (key: PaymentModel) => patch(paymentModelPatch(key));

  return (
    <SettingsSection
      title="Оплаты"
      description={`Как центр считает оплаченный период, с какого дня ведётся учёт и кто может вносить оплаты. Внесённые оплаты не меняются: сумма долга и аванса пересчитывается по новым настройкам. ${CANCELLED_LESSON_TEXT}`}
      icon={Wallet}
      onSave={() => void draft.save("payments")}
      saving={state.saving}
      saved={state.saved}
    >
      <fieldset>
        <legend className={labelClasses}>Как считать оплату</legend>
        <div className="grid grid-cols-1 gap-3 2xl:grid-cols-3">
          {PAYMENT_MODELS.map((option) => (
            <label
              key={option.key}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 ${model === option.key ? "border-primary-400 bg-primary-50/60" : "border-slate-200 hover:bg-slate-50"}`}
            >
              <Radio
                name="payments-model"
                checked={model === option.key}
                onChange={() => choose(option.key)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900">{option.title}</span>
                <span className="block text-xs text-slate-500">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500" data-testid="regime-hint">{REGIME_HINT}</p>
        {regimeChanged && regime && regime.key === regimeKey && regime.error && (
          <p role="alert" className="mt-1 text-xs font-medium text-rose-700">{regime.error}</p>
        )}
        {regimeChanged && regime && regime.key === regimeKey && regime.lines.length > 0 && (
          <ul role="status" className="mt-1 space-y-0.5 text-xs font-medium text-amber-800" data-testid="regime-impact">
            {regime.lines.map((line) => <li key={line}>{line}</li>)}
          </ul>
        )}
      </fieldset>

      <OpeningsChecklist paymentsBase="/owner/payments" onChangeDate={() => document.getElementById("payments-accounting-start")?.focus()} />

      <div className="space-y-2 rounded-xl bg-slate-50 px-4 py-3">
        <label htmlFor="payments-accounting-start" className={labelClasses}>Начало учёта оплат</label>
        <DateInput
          id="payments-accounting-start"
          min={ACCOUNTING_START_MIN}
          value={form.accounting_start_date ?? ""}
          onChange={(next) => patch({ accounting_start_date: next || loaded.accounting_start_date || null })}
          wrapperClassName="w-48"
          className={inputClasses}
        />
        <p className="text-xs text-slate-500">
          С этого дня центр считает деньги: до него стоимость обучения не считается, задним числом долга не будет. Не позже чем через 31 день от сегодня.
        </p>
        {impact && impact.date === form.accounting_start_date && impact.error && (
          <p role="alert" className="text-xs font-medium text-rose-700">{impact.error}</p>
        )}
        {impact && impact.date === form.accounting_start_date && impact.lines.length > 0 && (
          <ul role="status" className="space-y-0.5 text-xs font-medium text-amber-800">
            {impact.lines.map((line, index) => (
              <li key={line}>
                {line}
                {impact.toReview > 0 && index === impact.lines.length - 1 && (
                  <>{" "}<Link href={openingsHref("/owner/payments")} data-testid="accounting-start-openings-link" className="font-semibold underline">Открыть остатки</Link></>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {model === "fixed_day" && (
        <div className="space-y-2 rounded-xl bg-slate-50 px-4 py-3">
          <label htmlFor="payments-billing-day" className={labelClasses}>Единый день оплаты</label>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              id="payments-billing-day"
              value={String(Number.isNaN(form.billing_day) ? 1 : form.billing_day)}
              onChange={(e) => patch({ billing_day: Number(e.target.value) })}
              options={Array.from({ length: BILLING_DAY_RANGE.max - BILLING_DAY_RANGE.min + 1 }, (_, index) => BILLING_DAY_RANGE.min + index).map((day) => ({ value: String(day), label: String(day) }))}
              className="!w-24"
              buttonClassName="bg-slate-50 py-2.5"
            />
            <span className="text-sm text-slate-600">{billingDayHint(form.billing_day)}</span>
          </div>
          <p className="text-xs text-slate-500">{FIXED_DAY_HINT}</p>
          <p className="text-xs text-slate-400">Число от 1 до 28, чтобы период не зависел от длины месяца.</p>
        </div>
      )}

      {model === "lessons" ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <NumberField
            id="payments-lessons"
            label="Уроков в одной оплате"
            value={form.lessons_per_payment}
            range={LESSONS_PER_PAYMENT_RANGE}
            onChange={(value) => patch({ lessons_per_payment: value })}
          />
          <NumberField
            id="payments-expiring-lessons"
            label="Предупреждать, когда останется уроков"
            value={form.expiring_lessons}
            range={EXPIRING_LESSONS_RANGE}
            onChange={(value) => patch({ expiring_lessons: value })}
          />
        </div>
      ) : (
        <NumberField
          id="payments-expiring-days"
          label="Предупреждать за сколько дней до конца оплаты"
          value={form.expiring_days}
          range={EXPIRING_DAYS_RANGE}
          onChange={(value) => patch({ expiring_days: value })}
        />
      )}

      <div className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
        <div>
          <p id="payments-admin-label" className="text-sm font-semibold text-slate-900">Администратор может вносить оплаты</p>
          <p className="mt-0.5 text-xs text-slate-500">Администратор увидит суммы оплат; зарплата остаётся скрытой.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={form.admin_can_manage}
          aria-labelledby="payments-admin-label"
          onClick={() => patch({ admin_can_manage: !form.admin_can_manage })}
          className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${form.admin_can_manage ? "bg-primary-600" : "bg-slate-300"}`}
        >
          <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.admin_can_manage ? "translate-x-5" : ""}`} />
        </button>
      </div>

      {state.error && (
        <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm font-medium text-rose-700">{state.error}</p>
      )}
    </SettingsSection>
  );
}

/** «Посещаемость»: until when an excused absence can be confirmed.  Both rules stay: a center may still have old packages. */
function AttendanceSettingsSection({ draft }: { draft: PaymentSettingsDraft }) {
  const { form, saves } = draft;
  const state = saves.attendance;
  const patch = (next: Partial<PaymentSettings>) => draft.patch("attendance", next);

  return (
    <SettingsSection
      title="Посещаемость"
      description="До какого срока можно подтвердить уважительный пропуск, прежде чем у ученика закончится оплата."
      icon={ClipboardCheck}
      onSave={() => void draft.save("attendance")}
      saving={state.saving}
      saved={state.saved}
    >
      <div className="space-y-5 text-sm text-slate-700">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="payments-excuse-days" className="font-semibold text-slate-700">Оплата по месяцам: за</label>
            <NumberInput
              id="payments-excuse-days"
              min={EXCUSE_DEADLINE_DAYS_RANGE.min}
              max={EXCUSE_DEADLINE_DAYS_RANGE.max}
              value={Number.isNaN(form.excuse_deadline_days) ? "" : String(form.excuse_deadline_days)}
              onChange={(next) => patch({ excuse_deadline_days: next === "" ? NaN : Number(next) })}
              wrapperClassName="w-24"
              className={inputClasses}
            />
            <span>{daysWord(form.excuse_deadline_days)} до конца оплаты</span>
          </div>
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="payments-excuse-lessons" className="font-semibold text-slate-700">Пакет уроков: когда осталось</label>
            <NumberInput
              id="payments-excuse-lessons"
              min={EXCUSE_DEADLINE_LESSONS_RANGE.min}
              max={EXCUSE_DEADLINE_LESSONS_RANGE.max}
              value={Number.isNaN(form.excuse_deadline_lessons) ? "" : String(form.excuse_deadline_lessons)}
              onChange={(next) => patch({ excuse_deadline_lessons: next === "" ? NaN : Number(next) })}
              wrapperClassName="w-24"
              className={inputClasses}
            />
            <span>{lessonsWord(form.excuse_deadline_lessons)}</span>
          </div>
        </div>
        <p className="text-xs text-slate-500">Каждое правило действует для учеников со своим способом оплаты: по месяцам или пакетом уроков.</p>
      </div>

      {state.error && (
        <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm font-medium text-rose-700">{state.error}</p>
      )}
    </SettingsSection>
  );
}

/** «Зарплата»: the divisor of the payroll formula, with the formula in words and a worked example. */
function PayrollSettingsSection({ draft }: { draft: PayrollSettingsDraft }) {
  const parsed = parseDivisor(draft.text);
  const divisor = parsed.value ?? draft.loaded.divisor;
  // The partner's own numbers: 450 000 per month, 50 %, 11 lessons.
  const example = lineAmount({ fee: 450_000, percentHundredths: 5000, divisor, lessons: 11 });
  // nothing to save: the same divisor from the month it already acts from (or from the current month, which is where it is now)
  const history = draft.loaded.history ?? [];
  const inForce = divisorFor(history, draft.validFrom, draft.loaded.divisor);
  const unchanged = parsed.value !== null && parsed.value === inForce;
  const rows = divisorHistoryRows(history);
  const months = rateMonthOptions(formatBusinessDate());

  return (
    <SettingsSection
      title="Зарплата"
      description="Как считается зарплата преподавателей. Настройка влияет на новые расчёты: сохранённые ведомости не меняются."
      icon={Banknote}
      onSave={() => void draft.submit()}
      saving={draft.save.saving}
      saved={draft.save.saved}
      disabledSave={draft.status !== "ready" || unchanged}
    >
      {draft.status === "loading" || draft.status === "idle" ? (
        <div className="flex h-24 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary-500" /></div>
      ) : draft.status === "unavailable" ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm font-medium text-rose-700">
          Не удалось загрузить настройки зарплаты.
          <button type="button" onClick={draft.retry} className="rounded-lg border border-rose-200 bg-white px-3 py-1 text-rose-700 hover:bg-rose-100">Повторить</button>
        </div>
      ) : (
        <>
          <div>
            <label htmlFor="payroll-divisor" className={labelClasses}>Делитель</label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                id="payroll-divisor"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={draft.text}
                aria-invalid={Boolean(draft.save.error) || parsed.value === null}
                aria-describedby="payroll-divisor-help"
                onChange={(event) => draft.change(event.target.value)}
                className={numberInputClasses}
              />
              <span className="text-sm text-slate-600">от {DIVISOR_RANGE.min} до {DIVISOR_RANGE.max}, по умолчанию {DEFAULT_DIVISOR}</span>
            </div>
          </div>

          <div>
            <label htmlFor="payroll-divisor-from" className={labelClasses}>{DIVISOR_FROM_LABEL}</label>
            <Select
              id="payroll-divisor-from"
              value={draft.validFrom}
              onChange={(event) => draft.setValidFrom(event.target.value)}
              options={months.map((option) => ({ value: option.value, label: option.value === draft.validFrom ? divisorMonthTitle(option.value) : option.label }))}
              className="!w-60"
              buttonClassName="py-2.5"
            />
            <p className="mt-1.5 text-xs text-slate-500" data-testid="divisor-change">{divisorChangeText(parsed.value, draft.validFrom, inForce)}</p>
            <p className="mt-0.5 text-xs text-slate-500">{DIVISOR_HELP}</p>
          </div>

          {rows.length > 0 && (
            <div>
              <p className={labelClasses}>История делителя</p>
              <ul className="space-y-1 text-sm text-slate-700" data-testid="divisor-history">
                {rows.map((row) => <li key={row.key} className="tabular-nums">{row.text}</li>)}
              </ul>
            </div>
          )}

          <div id="payroll-divisor-help" className="space-y-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">{payrollFormulaText(divisor)}</p>
            <p>
              Например: {formatMoney(450_000)} × 50 % ÷ {divisor} × 11 уроков = <span className="font-semibold">{formatMoney(example)}</span>.
            </p>
            <p className="text-xs text-slate-500">{PAYROLL_PACKAGE_TEXT}</p>
            <p className="text-xs text-slate-500">Сумма строки округляется до целого сума (половина — вверх), итог — сумма строк.</p>
          </div>
        </>
      )}

      {draft.save.error && (
        <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm font-medium text-rose-700">{draft.save.error}</p>
      )}
    </SettingsSection>
  );
}

/** Left menu on a computer, scrolling tabs on a phone; the section is in the address (`?section=`). */
function SectionNav({ sections, active, onSelect }: { sections: SectionKey[]; active: SectionKey; onSelect: (key: SectionKey) => void }) {
  const items = SETTINGS_SECTIONS.filter((section) => sections.includes(section.key));
  return (
    <nav aria-label="Разделы настроек" className="min-w-0 md:sticky md:top-6 md:self-start">
      <ul className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 md:flex-col md:overflow-visible md:bg-transparent md:p-0">
        {items.map(({ key, label }) => (
          <li key={key} className="shrink-0 md:shrink">
            <a
              href={settingsSectionHref(key)}
              aria-current={active === key ? "page" : undefined}
              onClick={(event) => { event.preventDefault(); onSelect(key); }}
              className={`block whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors md:px-4 md:py-2.5 ${
                active === key
                  ? "bg-white text-slate-900 shadow-sm md:bg-slate-900 md:text-white"
                  : "text-slate-500 hover:text-slate-800 md:hover:bg-slate-100"
              }`}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function OwnerSettingsPage() {
  // The page reads `?section=`, so it needs a Suspense boundary above it.
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary-500" /></div>}>
      <OwnerSettingsContent />
    </Suspense>
  );
}

function OwnerSettingsContent() {
  const { org, user } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // /owner/* is for the owner only (N13 P1.5); the check stays as a second line behind the layout guard.
  const isOwner = effectiveRole(user) === "owner";
  const paymentSettings = usePaymentSettingsDraft(isOwner);

  // A section the user may not see is not offered; the payment sections wait for the server to confirm the right.
  const sections = visibleSettingsSections({ isOwner, paymentSettingsReadable: paymentSettings.status !== "unavailable" });
  const requestedSection = searchParams?.get("section");
  const section = parseSettingsSection(requestedSection, sections);
  const payrollSettings = usePayrollSettingsDraft(isOwner && section === "payroll");
  const waitingForPaymentSettings = isOwner
    && paymentSettings.status === "loading"
    && (requestedSection === "payments" || requestedSection === "attendance");
  const selectSection = (key: SectionKey) => {
    router.replace(`${pathname}${settingsSectionHref(key)}`, { scroll: false });
  };

  // Forms
  const [orgForm, setOrgForm] = useState({ name: "", city: "", phone: "" });
  const [profileForm, setProfileForm] = useState({ first_name: "", last_name: "", language: "ru" });
  const [passwordForm, setPasswordForm] = useState({ old_password: "", new_password: "", confirm: "" });

  // Loading States
  const [savingOrg, setSavingOrg] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Success States
  const [savedOrg, setSavedOrg] = useState(false);
  const [savedProfile, setSavedProfile] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // A form is filled from the store, but never over unsaved typing: the session sync replaces `user` whenever
  // the tab gets focus, and saving one section changes only that section's record.
  // The organisation is stored at sign-in; a session restored from the cookies alone (cleared site data, another device, the e2e
  // sign-in) has `org: null`, and the form would stay empty — a blank name that a «Сохранить» would then try to write.  Read it once.
  useEffect(() => {
    if (org) return;
    let alive = true;
    orgApi.get().then((loaded) => {
      if (alive && loaded) useAuthStore.setState((state) => (state.org ? {} : { org: loaded }));
    }).catch(() => { /* the form stays empty; the next visit tries again */ });
    return () => { alive = false; };
  }, [org]);
  const orgBase = useRef<typeof orgForm | null>(null);
  const profileBase = useRef<typeof profileForm | null>(null);
  useEffect(() => {
    if (!org) return;
    const next = { name: org.name || "", city: org.city || "", phone: org.phone || "" };
    const base = orgBase.current;
    orgBase.current = next;
    setOrgForm((draft) => reconcileDraft(draft, base, next));
  }, [org]);
  useEffect(() => {
    if (!user) return;
    const next = { first_name: user.first_name || "", last_name: user.last_name || "", language: user.language || "ru" };
    const base = profileBase.current;
    profileBase.current = next;
    setProfileForm((draft) => reconcileDraft(draft, base, next));
  }, [user]);

  const handleSaveOrg = async () => {
    setSavingOrg(true);
    try {
      const updated = await orgApi.update(orgForm);
      useAuthStore.setState((state) => ({
        org: { ...state.org, ...(updated ?? orgForm) },
      }));
      setSavedOrg(true);
      setTimeout(() => setSavedOrg(false), 3000);
    } catch (e: any) {
      alert(e.message || "Ошибка сохранения");
    } finally {
      setSavingOrg(false);
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const updated = await authApi.updateProfile(profileForm);
      useAuthStore.setState((state) => ({
        user: { ...state.user, ...(updated ?? profileForm) },
      }));
      setSavedProfile(true);
      setTimeout(() => setSavedProfile(false), 3000);
    } catch (e: any) {
      alert(e.message || "Ошибка сохранения");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (passwordForm.new_password !== passwordForm.confirm) {
      setPasswordMsg({ type: 'error', text: "Новые пароли не совпадают" });
      return;
    }
    if (passwordForm.new_password.length < 6) {
      setPasswordMsg({ type: 'error', text: "Пароль должен содержать минимум 6 символов" });
      return;
    }
    setSavingPassword(true);
    setPasswordMsg(null);
    try {
      await authApi.changePassword(passwordForm.old_password, passwordForm.new_password);
      setPasswordMsg({ type: 'success', text: "Пароль успешно изменён" });
      setPasswordForm({ old_password: "", new_password: "", confirm: "" });
      setTimeout(() => setPasswordMsg(null), 4000);
    } catch (e: any) {
      setPasswordMsg({ type: 'error', text: e.message || "Ошибка смены пароля" });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto pb-12">
      <div className="mb-6 md:mb-8">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">Настройки</h1>
        <p className="text-slate-500 mt-1 font-medium">Управляйте данными организации и вашим личным профилем</p>
      </div>

      <div className="flex flex-col gap-4 md:grid md:grid-cols-[220px_minmax(0,1fr)] md:items-start md:gap-8">
        <SectionNav sections={sections} active={section} onSelect={selectSection} />

        <div className="min-w-0 rounded-3xl border border-slate-200/50 bg-white/50 p-3 shadow-sm sm:p-6 lg:p-8">
          {waitingForPaymentSettings && (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary-500" /></div>
          )}

          {!waitingForPaymentSettings && section === "organization" && (
            <SettingsSection
              title="Организация"
              description="Общие данные вашей организации. Они будут отображаться в приглашениях, отчетах и квитанциях."
              icon={Building2}
              onSave={handleSaveOrg}
              saving={savingOrg}
              saved={savedOrg}
            >
              <div>
                <label htmlFor="owner-settings-nazvanie-organizatsii" className={labelClasses}>Название организации</label>
                <input
                  id="owner-settings-nazvanie-organizatsii"
                  value={orgForm.name}
                  onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                  className={inputClasses}
                  placeholder="Например, Школа Алгоритмики"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="owner-settings-gorod" className={labelClasses}>Город</label>
                  <input
                    id="owner-settings-gorod"
                    value={orgForm.city}
                    onChange={(e) => setOrgForm({ ...orgForm, city: e.target.value })}
                    className={inputClasses}
                    placeholder="Москва"
                  />
                </div>
                <div>
                  <label htmlFor="owner-settings-telefon" className={labelClasses}>Телефон</label>
                  <input
                    id="owner-settings-telefon"
                    value={orgForm.phone}
                    onChange={(e) => setOrgForm({ ...orgForm, phone: e.target.value })}
                    className={inputClasses}
                    placeholder="+7 (999) 000-00-00"
                  />
                </div>
              </div>
            </SettingsSection>
          )}

          {!waitingForPaymentSettings && section === "payments" && <PaymentsSettingsSection draft={paymentSettings} />}
          {!waitingForPaymentSettings && section === "attendance" && <AttendanceSettingsSection draft={paymentSettings} />}
          {section === "payroll" && <PayrollSettingsSection draft={payrollSettings} />}

          {!waitingForPaymentSettings && section === "profile" && (
          <SettingsSection
            title="Профиль"
            description="Ваши личные данные. Имя и фамилия будут видны другим сотрудникам организации."
            icon={Settings}
            onSave={handleSaveProfile}
            saving={savingProfile}
            saved={savedProfile}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label htmlFor="owner-settings-imya" className={labelClasses}>Имя</label>
                <input
                  id="owner-settings-imya"
                  value={profileForm.first_name}
                  onChange={(e) => setProfileForm({ ...profileForm, first_name: e.target.value })}
                  className={inputClasses}
                />
              </div>
              <div>
                <label htmlFor="owner-settings-familiya" className={labelClasses}>Фамилия</label>
                <input
                  id="owner-settings-familiya"
                  value={profileForm.last_name}
                  onChange={(e) => setProfileForm({ ...profileForm, last_name: e.target.value })}
                  className={inputClasses}
                />
              </div>
            </div>
            <div>
              <label htmlFor="owner-settings-yazyk-interfeysa" className={labelClasses}>Язык интерфейса</label>
              <Select
                id="owner-settings-yazyk-interfeysa"
                value={profileForm.language}
                onChange={(e) => setProfileForm({ ...profileForm, language: e.target.value })}
                options={[{ value: "ru", label: "Русский" }, { value: "en", label: "English" }]}
                buttonClassName="py-2.5"
              />
            </div>
          </SettingsSection>
          )}

          {!waitingForPaymentSettings && section === "security" && (
          <SettingsSection
            title="Безопасность"
            description="Изменение пароля для доступа к вашей учетной записи. Используйте надежный пароль."
            icon={Key}
            onSave={handleChangePassword}
            saving={savingPassword}
            saved={passwordMsg?.type === 'success'}
            saveText="Обновить пароль"
            disabledSave={!passwordForm.old_password || !passwordForm.new_password}
          >
            <div className="space-y-6">
              <div>
                <label htmlFor="owner-settings-tekuschiy-parol" className={labelClasses}>Текущий пароль</label>
                <input
                  id="owner-settings-tekuschiy-parol"
                  type="password"
                  value={passwordForm.old_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, old_password: e.target.value })}
                  className={inputClasses}
                  placeholder="••••••••"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="owner-settings-novyy-parol" className={labelClasses}>Новый пароль</label>
                  <input
                    id="owner-settings-novyy-parol"
                    type="password"
                    value={passwordForm.new_password}
                    onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                    className={inputClasses}
                    placeholder="Минимум 6 символов"
                  />
                </div>
                <div>
                  <label htmlFor="owner-settings-povtorite-parol" className={labelClasses}>Повторите пароль</label>
                  <input
                    id="owner-settings-povtorite-parol"
                    type="password"
                    value={passwordForm.confirm}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                    className={inputClasses}
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {/* Password Message */}
              {passwordMsg && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className={`flex items-center gap-2 p-3 rounded-xl text-sm font-medium ${
                    passwordMsg.type === 'success'
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                      : "bg-rose-50 text-rose-700 border border-rose-100"
                  }`}
                >
                  {passwordMsg.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                  {passwordMsg.text}
                </motion.div>
              )}
            </div>
          </SettingsSection>
          )}
        </div>
      </div>
    </div>
  );
}
