"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  ArrowLeft,
  ArrowRight,
  Send,
  Copy,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import QRCode from "qrcode.react";
import { orgApi } from "@/lib/api";
import { formatUzPhone, isValidUzPhone } from "@/lib/phone";

type Step = 1 | 2;

export default function NewStudentPage() {
  const [step, setStep] = useState<Step>(1);
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [diagnosticCode, setDiagnosticCode] = useState<string>("");
  const [formData, setFormData] = useState({
    name: "",
    phone: "+998 ",
    grade: "",
    expectedLevel: "",
    comment: "",
  });

  const grades = [
    { value: "5", label: "5 класс" },
    { value: "6", label: "6 класс" },
    { value: "7", label: "7 класс" },
    { value: "8", label: "8 класс" },
    { value: "9", label: "9 класс" },
    { value: "10", label: "10 класс" },
    { value: "11", label: "11 класс" },
  ];

  const levels = [
    { value: "A", label: "A — Отличник (уверенно решает сложные задачи)" },
    { value: "B", label: "B — Хорошист (справляется с большинством)" },
    { value: "C", label: "C — Средний (есть пробелы)" },
    { value: "D", label: "D — Слабый (серьёзные трудности)" },
  ];

  const diagnosticLink = diagnosticCode
    ? `${window.location.origin}/d/${diagnosticCode}`
    : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(diagnosticLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateStudent = async () => {
    setIsSubmitting(true);
    setApiError(null);
    try {
      // Split name into first_name / last_name
      const nameParts = formData.name.trim().split(/\s+/);
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || firstName;

      // Build comment with level info
      const levelLabel = levels.find((l) => l.value === formData.expectedLevel)?.label;
      const commentParts: string[] = [];
      if (levelLabel) commentParts.push(`Уровень: ${levelLabel}`);
      if (formData.comment.trim()) commentParts.push(formData.comment.trim());
      const comment = commentParts.join(". ") || undefined;

      // 1. Create student
      const student = await orgApi.createStudent({
        first_name: firstName,
        last_name: lastName,
        class_level: parseInt(formData.grade),
        student_phone: formData.phone.trim(),
        comment,
      });

      // 2. Create diagnostic invite
      const diagnostic = await orgApi.createDiagnostic({
        student_id: student.id,
        class_level: parseInt(formData.grade),
        diagnostic_type: "initial",
      });

      setDiagnosticCode(diagnostic.code);
      setStep(2);
    } catch (err: any) {
      setApiError(err.message || "Ошибка при создании ученика");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setDiagnosticCode("");
    setApiError(null);
    setFormData({ name: "", phone: "+998 ", grade: "", expectedLevel: "", comment: "" });
  };

  const whatsappUrl = diagnosticLink
    ? `https://wa.me/?text=${encodeURIComponent(`Пройдите диагностику по математике: ${diagnosticLink}`)}`
    : "#";
  const telegramUrl = diagnosticLink
    ? `https://t.me/share/url?url=${encodeURIComponent(diagnosticLink)}&text=${encodeURIComponent("Пройдите диагностику по математике")}`
    : "#";

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Новый ученик</h1>
      <p className="text-slate-500 mb-6">Регистрация и запуск диагностики</p>
          {/* Back button */}
          <Link href="/admin/diagnostics">
            <Button variant="ghost" size="sm" className="mb-6" icon={<ArrowLeft className="w-4 h-4" />}>
              Назад
            </Button>
          </Link>

          {/* Step 1: Student Info */}
          {step === 1 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <GlassCard variant="elevated" className="p-8">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-slate-900">Информация об ученике</h2>
                  <p className="text-sm text-slate-500">Заполните данные для регистрации</p>
                </div>

                {apiError && (
                  <div className="flex items-center gap-2 p-3 mb-5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{apiError}</span>
                  </div>
                )}

                <div className="space-y-5">
                  <Input
                    label="Имя и фамилия"
                    placeholder="Алия Каримова"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />

                  <Input
                    label="Телефон ученика"
                    placeholder="+998 XX XXX XX XX"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: formatUzPhone(e.target.value) })}
                  />

                  <Select
                    label="Класс обучения"
                    placeholder="Выберите класс"
                    options={grades}
                    value={formData.grade}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                  />

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-3">
                      Предварительная оценка уровня (со слов)
                    </label>
                    <div className="space-y-2">
                      {levels.map((level) => (
                        <label
                          key={level.value}
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            formData.expectedLevel === level.value
                              ? "border-primary-500 bg-primary-50"
                              : "border-slate-200 hover:border-slate-300 bg-white/50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="level"
                            value={level.value}
                            checked={formData.expectedLevel === level.value}
                            onChange={(e) => setFormData({ ...formData, expectedLevel: e.target.value })}
                            className="w-4 h-4 text-primary-600"
                          />
                          <span className="text-sm text-slate-700">{level.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Комментарий (опционально)
                    </label>
                    <textarea
                      placeholder="Хочет подготовиться к олимпиаде..."
                      value={formData.comment}
                      onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl bg-white/80 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all resize-none h-24"
                    />
                  </div>

                  <Button
                    onClick={handleCreateStudent}
                    className="w-full"
                    size="lg"
                    loading={isSubmitting}
                    icon={isSubmitting ? undefined : <ArrowRight className="w-4 h-4" />}
                    disabled={!formData.name || !formData.grade || !isValidUzPhone(formData.phone) || isSubmitting}
                  >
                    {isSubmitting ? "Создание..." : "Создать и получить ссылку"}
                  </Button>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* Step 2: QR Code & Link */}
          {step === 2 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <GlassCard variant="elevated" className="p-8">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-green-100 flex items-center justify-center">
                    <Check className="w-8 h-8 text-green-600" />
                  </div>
                  <h2 className="text-xl font-semibold text-slate-900">Диагностика готова!</h2>
                  <p className="text-sm text-slate-500">
                    Ученик: <span className="font-medium text-slate-700">{formData.name}</span> ({formData.grade} класс)
                  </p>
                </div>

                <div className="flex flex-col md:flex-row gap-8 items-center justify-center mb-8">
                  {/* QR Code */}
                  <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100">
                    <QRCode value={diagnosticLink} size={160} />
                  </div>

                  {/* Link */}
                  <div className="flex-1 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                        Ссылка для прохождения
                      </label>
                      <div className="flex gap-2">
                        <div className="flex-1 px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-mono text-slate-700 truncate">
                          {diagnosticLink}
                        </div>
                        <Button
                          variant="secondary"
                          onClick={handleCopy}
                          icon={copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                        >
                          {copied ? "Скопировано" : "Копировать"}
                        </Button>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                        <Button variant="secondary" className="w-full" icon={<Send className="w-4 h-4" />}>
                          WhatsApp
                        </Button>
                      </a>
                      <a href={telegramUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                        <Button variant="secondary" className="w-full" icon={<Send className="w-4 h-4" />}>
                          Telegram
                        </Button>
                      </a>
                    </div>

                    <p className="text-xs text-slate-500">
                      ⏱️ Код действителен 7 дней • 1 попытка
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    onClick={handleReset}
                    className="flex-1"
                  >
                    Добавить ещё
                  </Button>
                  <Link href="/admin/diagnostics" className="flex-1">
                    <Button className="w-full">
                      К диагностикам
                    </Button>
                  </Link>
                </div>
              </GlassCard>
            </motion.div>
          )}
    </div>
  );
}
