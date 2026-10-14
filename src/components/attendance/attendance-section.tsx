"use client";

import { Suspense, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ExcusesPage } from "@/components/attendance/excuses-page";
import { OpenLessonsView } from "@/components/attendance/open-lessons-view";
import { useExcuseBadge } from "@/lib/excuse-badge";

interface SectionTab {
  key: string;
  label: string;
  /** Optional counter shown in the tab. */
  count?: number;
  content: ReactNode;
}

interface AttendanceSectionProps {
  /** Where a student profile lives for this role. */
  studentProfileBasePath: string;
  /** Where group pages live for this role (the journal of a lesson opens there). */
  groupsBasePath: string;
}

function AttendanceSectionContent({ studentProfileBasePath, groupsBasePath }: AttendanceSectionProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pending = useExcuseBadge((state) => state.pending);
  const openLessons = useExcuseBadge((state) => state.openLessons);

  // A new tab is one more entry here.
  const tabs: SectionTab[] = [
    { key: "excuses", label: "Пропуски", count: pending, content: <ExcusesPage studentProfileBasePath={studentProfileBasePath} /> },
    { key: "open", label: "Незакрытые уроки", count: openLessons, content: <OpenLessonsView groupsBasePath={groupsBasePath} /> },
  ];

  const requested = searchParams?.get("tab");
  const active = tabs.find((tab) => tab.key === requested) ?? tabs[0];

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Посещаемость</h1>
        <p className="text-sm text-slate-500">Журнал по всем группам: что требует действий администратора</p>
      </div>

      {tabs.length > 1 && (
      <div className="flex w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-0.5 sm:w-fit sm:p-1" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active.key === tab.key}
            onClick={() => router.replace(`?tab=${tab.key}`, { scroll: false })}
            className={`flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-lg px-2 py-2 text-[13px] font-medium transition-all sm:flex-none sm:gap-2 sm:px-4 sm:text-sm ${
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
      )}

      <div role="tabpanel">{active.content}</div>
    </div>
  );
}

/** "Посещаемость": a section with tabs; the path differs by role only in the profile link base. */
export function AttendanceSection(props: AttendanceSectionProps) {
  return (
    <Suspense
      fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary-500" /></div>}
    >
      <AttendanceSectionContent {...props} />
    </Suspense>
  );
}
