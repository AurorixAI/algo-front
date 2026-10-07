"use client";

import { motion } from "framer-motion";
import { TrendingDown, TrendingUp, Minus, AlertTriangle, Users, Target, BarChart2 } from "lucide-react";
import { GroupStats } from "@/lib/api";
import { LEVEL_CATEGORY_META, LEVEL_TONES, type LevelCategory } from "@/lib/diagnostic-level";

interface GroupStatsPanelProps {
  stats: GroupStats;
}

export function GroupStatsPanel({ stats }: GroupStatsPanelProps) {
  const { theta_distribution: dist, total_students, diagnosed_count } = stats;
  const diagPct = total_students > 0 ? Math.round((diagnosed_count / total_students) * 100) : 0;
  const total_dist = dist.below_grade + dist.at_grade + dist.above_grade || 1;

  const levelRow = (key: LevelCategory, icon: typeof TrendingUp) => {
    const meta = LEVEL_CATEGORY_META[key];
    const tone = LEVEL_TONES[meta.tone];
    return { key, label: meta.label, count: dist[key], icon, barColor: tone.dot, textColor: tone.text, bg: tone.soft };
  };
  const levels = [
    levelRow("above_grade", TrendingUp),
    levelRow("at_grade", Minus),
    levelRow("below_grade", TrendingDown),
  ];

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-50 rounded-2xl p-4 text-center">
          <Users className="w-5 h-5 text-slate-400 mx-auto mb-1" />
          <p className="text-2xl font-bold text-slate-900">{total_students}</p>
          <p className="text-xs text-slate-500">Всего учеников</p>
        </div>
        <div className="bg-primary-50 rounded-2xl p-4 text-center">
          <Target className="w-5 h-5 text-primary-400 mx-auto mb-1" />
          <p className="text-2xl font-bold text-primary-700">{diagnosed_count}</p>
          <p className="text-xs text-primary-500">Диагностировано</p>
        </div>
        <div className="bg-slate-50 rounded-2xl p-4 text-center">
          <BarChart2 className="w-5 h-5 text-slate-400 mx-auto mb-1" />
          <p className="text-2xl font-bold text-slate-900">
            {stats.avg_theta !== null ? stats.avg_theta.toFixed(2) : "—"}
          </p>
          <p className="text-xs text-slate-500">Средний θ</p>
        </div>
      </div>

      {/* Diagnosis progress */}
      {total_students > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-slate-700">Прогресс диагностики</p>
            <p className="text-sm font-bold text-slate-900">{diagPct}%</p>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${diagPct}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-400"
            />
          </div>
          {stats.undiagnosed_count > 0 && (
            <p className="text-xs text-slate-400 mt-1">
              Ещё {stats.undiagnosed_count} {stats.undiagnosed_count === 1 ? "ученик" : "учеников"} не прошли диагностику
            </p>
          )}
        </div>
      )}

      {/* Level distribution */}
      {diagnosed_count > 0 && (
        <div>
          <p className="text-sm font-medium text-slate-700 mb-3">Распределение по уровням</p>
          <div className="space-y-3">
            {levels.map((lvl, i) => {
              const pct = Math.round((lvl.count / total_dist) * 100);
              const Icon = lvl.icon;
              return (
                <div key={lvl.key}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-lg ${lvl.bg} flex items-center justify-center`}>
                        <Icon className={`w-3.5 h-3.5 ${lvl.textColor}`} />
                      </div>
                      <span className="text-sm text-slate-700">{lvl.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${lvl.textColor}`}>{lvl.count} чел.</span>
                      <span className="text-xs text-slate-400">({pct}%)</span>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, delay: i * 0.1, ease: "easeOut" }}
                      className={`h-full rounded-full ${lvl.barColor}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weak skills */}
      {stats.weak_skills.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-medium text-slate-700">Проблемные навыки</p>
          </div>
          <div className="space-y-2">
            {stats.weak_skills.map((skill, i) => (
              <motion.div
                key={skill}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-100 rounded-xl"
              >
                <span className="w-5 h-5 rounded-full bg-amber-200 flex items-center justify-center text-xs font-bold text-amber-700 shrink-0">
                  {i + 1}
                </span>
                <span className="text-sm text-amber-800 font-medium">{skill}</span>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {diagnosed_count === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-slate-400 text-center">
          <Target className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm font-medium">Нет данных диагностики</p>
          <p className="text-xs mt-1">Запустите диагностику для учеников группы</p>
        </div>
      )}
    </div>
  );
}
