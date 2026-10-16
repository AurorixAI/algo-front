"use client";

import { Bell, Search, Globe } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FloatingPanel } from "@/components/ui/floating-panel";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

type Locale = "ru" | "uz" | "en";

export function Header({ title, subtitle }: HeaderProps) {
  const [locale, setLocale] = useState<Locale>("ru");
  const [showLangMenu, setShowLangMenu] = useState(false);
  const langTriggerRef = useRef<HTMLButtonElement>(null);

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
              ref={langTriggerRef}
              type="button"
              aria-haspopup="true"
              aria-expanded={showLangMenu}
              aria-label="Язык интерфейса"
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <span className="text-base">{currentLang?.flag}</span>
              <span className="text-sm font-medium text-slate-600">{currentLang?.code.toUpperCase()}</span>
            </button>

            <FloatingPanel
              open={showLangMenu}
              triggerRef={langTriggerRef}
              onClose={() => setShowLangMenu(false)}
              width={160}
              label="Язык интерфейса"
              className="bg-white rounded-xl border border-slate-100 shadow-xl overflow-hidden"
            >
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
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
            </FloatingPanel>
          </div>
        </div>
      </div>
    </header>
  );
}
