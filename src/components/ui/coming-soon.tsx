"use client";

import { motion } from "framer-motion";
import { Clock, Sparkles, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { type LucideIcon } from "lucide-react";

interface ComingSoonProps {
  title: string;
  description: string;
  icon: LucideIcon;
  features?: string[];
  color?: string;
}

export function ComingSoon({ title, description, icon: Icon, features = [], color = "primary" }: ComingSoonProps) {
  const router = useRouter();

  const colorMap: Record<string, { bg: string; iconBg: string; text: string; border: string; badge: string }> = {
    primary: {
      bg: "from-primary-50 to-blue-50",
      iconBg: "from-primary-500 to-primary-600",
      text: "text-primary-600",
      border: "border-primary-100",
      badge: "bg-primary-100 text-primary-700",
    },
    purple: {
      bg: "from-purple-50 to-indigo-50",
      iconBg: "from-purple-500 to-indigo-600",
      text: "text-purple-600",
      border: "border-purple-100",
      badge: "bg-purple-100 text-purple-700",
    },
    amber: {
      bg: "from-amber-50 to-orange-50",
      iconBg: "from-amber-500 to-orange-500",
      text: "text-amber-600",
      border: "border-amber-100",
      badge: "bg-amber-100 text-amber-700",
    },
    green: {
      bg: "from-green-50 to-emerald-50",
      iconBg: "from-green-500 to-emerald-600",
      text: "text-green-600",
      border: "border-green-100",
      badge: "bg-green-100 text-green-700",
    },
  };

  const c = colorMap[color] || colorMap.primary;

  return (
    <div className="flex-1 flex items-center justify-center p-6 min-h-[60vh]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-lg w-full text-center"
      >
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium mb-6"
        >
          <Clock className="w-3.5 h-3.5" />
          В разработке
        </motion.div>

        {/* Icon */}
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className={`w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br ${c.iconBg} flex items-center justify-center shadow-lg`}
        >
          <Icon className="w-10 h-10 text-white" />
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-2xl font-bold text-slate-900 mb-2"
        >
          {title}
        </motion.h1>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-slate-500 mb-8 max-w-md mx-auto"
        >
          {description}
        </motion.p>

        {/* Features preview */}
        {features.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className={`bg-gradient-to-br ${c.bg} rounded-2xl border ${c.border} p-6 mb-8`}
          >
            <div className="flex items-center justify-center gap-2 mb-4">
              <Sparkles className={`w-4 h-4 ${c.text}`} />
              <span className={`text-sm font-semibold ${c.text}`}>Что здесь будет</span>
            </div>
            <div className="space-y-2.5">
              {features.map((feature, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + i * 0.1 }}
                  className="flex items-center gap-3 text-left"
                >
                  <div className={`w-6 h-6 rounded-full ${c.badge} flex items-center justify-center text-xs font-bold shrink-0`}>
                    {i + 1}
                  </div>
                  <span className="text-sm text-slate-700">{feature}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Back button */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад
        </motion.button>
      </motion.div>
    </div>
  );
}
