"use client";

import { motion } from "framer-motion";
import { Clock, RefreshCw } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { RATE_LIMIT_RETRY_LABEL, RATE_LIMIT_TITLE, canRetryNow, rateLimitText } from "@/lib/exam-rate-limit";
import { useNowUntil } from "@/lib/use-countdown";

/**
 * The calm screen for «too many attempts» (HTTP 429) while the exam page loads: amber, not red, with the countdown from
 * `Retry-After` and a button that becomes active when it is over.  `fallback` is the text for a wait that is not counted
 * (no usable Retry-After: the button is held for a default minute).
 */
export function RateLimitCard({ deadline, fallback = null, onRetry }: { deadline: number | null; fallback?: string | null; onRetry: () => void }) {
  const now = useNowUntil(deadline);
  const ready = canRetryNow(deadline, now);
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
      <GlassCard variant="panel" className="p-8 md:p-12 text-center" glow>
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center bg-amber-100 text-amber-600">
          <Clock className="w-8 h-8 text-amber-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">{RATE_LIMIT_TITLE}</h2>
        <p className="text-slate-500 mb-6" data-testid="rate-limit-text">
          {rateLimitText(deadline, now, fallback)}
        </p>
        <Button className="w-full" onClick={onRetry} disabled={!ready} icon={<RefreshCw className="w-4 h-4" />} data-testid="rate-limit-retry">
          {RATE_LIMIT_RETRY_LABEL}
        </Button>
      </GlassCard>
    </motion.div>
  );
}
