"use client";

import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function FilterBar({ children, onReset, canReset }: { children: ReactNode; onReset?: () => void; canReset?: boolean }) {
  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-3" role="search">
      {children}
      {onReset && (
        <Button variant="ghost" size="sm" onClick={onReset} disabled={!canReset}>
          Сбросить
        </Button>
      )}
    </div>
  );
}

export function Field({ label, width = "w-44", children }: { label: string; width?: string; children: ReactNode }) {
  return (
    <div className={width}>
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </div>
  );
}

export function SearchField({
  value, onChange, placeholder, label = "Поиск", width = "w-64",
}: { value: string; onChange: (value: string) => void; placeholder: string; label?: string; width?: string }) {
  return (
    <div className={width}>
      <Input
        aria-label={label}
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        icon={<Search className="h-4 w-4" />}
        className="py-2 text-sm"
      />
    </div>
  );
}
