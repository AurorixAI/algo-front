"use client";

import { Bell, Search, Globe } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

type Locale = "ru" | "uz" | "en";

export function Header({ title, subtitle }: HeaderProps) {
  const [locale, setLocale] = useState<Locale>("ru");
  const [showLangMenu, setShowLangMenu] = useState(false);

  const languages = [
    { code: "ru" as const, name: "Русский", flag: "🇷🇺" },
    { code: "uz" as const, name: "O'zbekcha", flag: "🇺🇿" },
    { code: "en" as const, name: "English", flag: "🇬🇧" },
  ];

  const currentLang = languages.find((l) => l.code === locale);

  return (
    <header className="h-16 border-b border-slate-100 bg-white/50 backdrop-blur-md sticky top-0 z-30">
      <div className="h-full px-6 flex items-center justify-between">
        {/* Title */}
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>

        {/* Right section */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <button className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <Search className="w-5 h-5" />
          </button>

          {/* Notifications */}
          <button className="relative p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />
          </button>

          {/* Language switcher */}
          <div className="relative">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <span className="text-base">{currentLang?.flag}</span>
              <span className="text-sm font-medium text-slate-600">{currentLang?.code.toUpperCase()}</span>
            </button>

            <AnimatePresence>
              {showLangMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowLangMenu(false)} 
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="absolute right-0 top-full mt-2 w-40 bg-white rounded-xl border border-slate-100 shadow-xl overflow-hidden z-50"
                  >
                    {languages.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => {
                          setLocale(lang.code);
                          setShowLangMenu(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors",
                          locale === lang.code && "bg-primary-50 text-primary-700"
                        )}
                      >
                        <span className="text-lg">{lang.flag}</span>
                        <span className="text-sm font-medium">{lang.name}</span>
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}
