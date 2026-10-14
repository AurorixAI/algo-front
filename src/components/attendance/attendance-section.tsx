"use client";

import { Suspense, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ExcusesPage } from "@/components/attendance/excuses-page";
import { useExcuseBadge } from "@/lib/excuse-badge";

interface SectionTab {
  key: string;
  label: string;
  /** Optional counter shown in the tab. */
  count?: number;
  content: ReactNode;
}

function AttendanceSectionContent({ studentProfileBasePath }: { studentProfileBasePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pending = useExcuseBadge((state) => state.pending);

  // A new tab is one more entry here.
  const tabs: SectionTab[] = [
    { key: "excuses", label: "Уважительные пропуски", count: pending, content: <ExcusesPage studentProfileBasePath={studentProfileBasePath} /> },
  ];

  const requested = searchParams?.get("tab");
  const active = tabs.find((tab) => tab.key === requested) ?? tabs[0];

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Посещаемость</h1>
        <p className="text-sm text-slate-500">Журнал по всем группам: что требует действий администратора</p>
      </div>

      <div className="flex w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 sm:w-fit" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active.key === tab.key}
            onClick={() => router.replace(`?tab=${tab.key}`, { scroll: false })}
            className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              active.key === tab.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
            {tab.count ? (
              <span className="min-w-[18px] rounded-full bg-rose-500 px-1.5 text-center text-[10px] font-bold leading-[18px] text-white">
                {tab.count > 99 ? "99+" : tab.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div role="tabpanel">{active.content}</div>
    </div>
  );
}

/** "Посещаемость": a section with tabs; the path differs by role only in the profile link base. */
export function AttendanceSection({ studentProfileBasePath }: { studentProfileBasePath: string }) {
  return (
    <Suspense
      fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary-500" /></div>}
    >
      <AttendanceSectionContent studentProfileBasePath={studentProfileBasePath} />
    </Suspense>
  );
}
