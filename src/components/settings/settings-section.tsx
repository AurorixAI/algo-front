"use client";

import { motion } from "framer-motion";
import { CheckCircle, type LucideIcon } from "lucide-react";

export interface SettingsSectionProps {
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

/** The frame of one section of the settings: the icon and the title, the description, the card with the fields and the one «Сохранить» (it moved out of the page so that the new sections and their tests share it). */
export function SettingsSection({
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
