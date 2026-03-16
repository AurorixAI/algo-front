"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Brain, Users, BarChart3, Zap } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50/50 to-slate-200/50" />
        <div className="absolute -top-[20%] -left-[10%] w-[80vw] h-[80vw] bg-blue-100/60 rounded-full blur-[120px] mix-blend-multiply opacity-70" />
        <div className="absolute top-[20%] right-[10%] w-[60vw] h-[60vw] bg-indigo-100/50 rounded-full blur-[100px] mix-blend-multiply opacity-60" />
        <div className="absolute -bottom-[20%] left-[20%] w-[70vw] h-[70vw] bg-slate-200/60 rounded-full blur-[140px] mix-blend-multiply" />
      </div>

      {/* Header */}
      <header className="relative z-10 py-6 px-8">
        <nav className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white shadow-lg shadow-primary-500/30">
              <span className="text-xl font-bold">∫</span>
            </div>
            <span className="text-2xl font-bold text-slate-900">ALGO</span>
          </div>
          
          <div className="flex items-center gap-4">
            <Link 
              href="/login"
              className="px-4 py-2 text-slate-600 hover:text-slate-900 font-medium transition-colors"
            >
              Войти
            </Link>
            <Link 
              href="/register"
              className="px-5 py-2.5 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-xl font-medium shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 transition-all"
            >
              Начать бесплатно
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <main className="relative z-10 max-w-7xl mx-auto px-8 pt-20 pb-32">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-50 rounded-full text-primary-700 text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            AI-powered математическая диагностика
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold text-slate-900 leading-tight mb-6">
            Узнайте реальный
            <br />
            <span className="bg-gradient-to-r from-primary-600 to-indigo-600 bg-clip-text text-transparent">
              уровень знаний
            </span>
          </h1>
          
          <p className="text-xl text-slate-600 max-w-2xl mx-auto mb-10">
            Адаптивная диагностика на основе IRT определяет пробелы и строит 
            персонализированный путь обучения для каждого ученика
          </p>
          
          <div className="flex items-center justify-center gap-4">
            <Link 
              href="/register"
              className="group inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-2xl font-semibold text-lg shadow-xl shadow-primary-500/25 hover:shadow-2xl hover:shadow-primary-500/30 transition-all"
            >
              Попробовать бесплатно
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link 
              href="/demo"
              className="px-8 py-4 bg-white/80 backdrop-blur-sm border border-slate-200 text-slate-700 rounded-2xl font-semibold text-lg hover:bg-white hover:border-slate-300 transition-all"
            >
              Демо диагностики
            </Link>
          </div>
        </motion.div>

        {/* Features */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-32"
        >
          <div className="p-8 bg-white/90 backdrop-blur-xl rounded-3xl border border-white/60 shadow-xl">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-5">
              <Brain className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-3">IRT Диагностика</h3>
            <p className="text-slate-600">
              3-параметрическая модель Item Response Theory точно оценивает уровень каждого навыка
            </p>
          </div>
          
          <div className="p-8 bg-white/90 backdrop-blur-xl rounded-3xl border border-white/60 shadow-xl">
            <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center mb-5">
              <Users className="w-7 h-7 text-purple-600" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-3">Для всех ролей</h3>
            <p className="text-slate-600">
              Администраторы, учителя и ученики — у каждого свой интерфейс и инструменты
            </p>
          </div>
          
          <div className="p-8 bg-white/90 backdrop-blur-xl rounded-3xl border border-white/60 shadow-xl">
            <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mb-5">
              <BarChart3 className="w-7 h-7 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-3">Глубокая аналитика</h3>
            <p className="text-slate-600">
              Отслеживайте прогресс, находите паттерны ошибок и оптимизируйте обучение
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
