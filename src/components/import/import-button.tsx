"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { ImportModal } from "./import-modal";

interface ImportButtonProps {
  onImported?: () => void;
  className?: string;
  variant?: "solid" | "outline";
}

export function ImportButton({ onImported, className = "", variant = "outline" }: ImportButtonProps) {
  const [open, setOpen] = useState(false);
  const base = "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95";
  const styles = variant === "solid"
    ? "bg-primary-600 text-white hover:bg-primary-700 shadow-sm shadow-primary-600/20"
    : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50";
  return (
    <>
      <button onClick={() => setOpen(true)} className={`${base} ${styles} ${className}`}>
        <Upload className="w-4 h-4" />
        Импорт
      </button>
      <ImportModal open={open} onClose={() => setOpen(false)} onImported={onImported} />
    </>
  );
}
