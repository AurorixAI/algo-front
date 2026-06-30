"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Clock,
  Users,
  User,
  Video,
  MapPin,
  MoreVertical,
  X,
} from "lucide-react";

// --- MOCK DATA ---
const DAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const START_HOUR = 8;
const END_HOUR = 20;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => i + START_HOUR);

const DATE_OPTIONS = [
  "Сегодня, 18 Июня",
  "Завтра, 19 Июня",
  "Четверг, 20 Июня",
  "Пятница, 21 Июня",
  "Суббота, 22 Июня"
];

const TIME_SLOTS = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00"
];

type EventType = "group" | "individual" | "meeting" | "other";

interface ScheduleEvent {
  id: string;
  day: number; // 0-5 (Mon-Sat)
  startHour: number; // e.g. 10.5 for 10:30
  durationHours: number; // e.g. 1.5 for 1h 30m
  title: string;
  subtitle?: string;
  type: EventType;
  color: "blue" | "indigo" | "emerald" | "amber" | "violet" | "slate" | "rose";
  location?: string;
}

const mockEvents: ScheduleEvent[] = [
  { id: "1", day: 0, startHour: 10, durationHours: 1.5, title: "Группа Olymps-Math", subtitle: "10-11 класс", type: "group", color: "blue", location: "Аудитория 1" },
  { id: "2", day: 0, startHour: 14, durationHours: 2, title: "Группа Python-Dev", subtitle: "8-9 класс", type: "group", color: "indigo", location: "Аудитория 3" },
  { id: "3", day: 1, startHour: 11, durationHours: 1.5, title: "Группа Physics-Pro", subtitle: "9-10 класс", type: "group", color: "emerald", location: "Аудитория 2" },
  { id: "4", day: 1, startHour: 15, durationHours: 1, title: "Индив. занятие", subtitle: "Арслан И.", type: "individual", color: "amber", location: "Онлайн (Zoom)" },
  { id: "5", day: 2, startHour: 10, durationHours: 1.5, title: "Группа Olymps-Math", subtitle: "10-11 класс", type: "group", color: "blue", location: "Аудитория 1" },
  { id: "6", day: 2, startHour: 14, durationHours: 2, title: "Группа Python-Dev", subtitle: "8-9 класс", type: "group", color: "indigo", location: "Аудитория 3" },
  { id: "7", day: 3, startHour: 12, durationHours: 1.5, title: "Методическое собрание", subtitle: "Весь пед. состав", type: "meeting", color: "slate", location: "Переговорная" },
  { id: "8", day: 4, startHour: 11, durationHours: 1.5, title: "Группа Physics-Pro", subtitle: "9-10 класс", type: "group", color: "emerald", location: "Аудитория 2" },
  { id: "9", day: 5, startHour: 10, durationHours: 3, title: "Интенсив", subtitle: "Подготовка к олимпиаде", type: "group", color: "violet", location: "Актовый зал" },
];

const colorMap = {
  blue: "bg-blue-50/90 text-blue-800 border-blue-200 border-l-[4px] border-l-blue-500 hover:border-blue-300 hover:shadow-md hover:shadow-blue-100",
  indigo: "bg-indigo-50/90 text-indigo-800 border-indigo-200 border-l-[4px] border-l-indigo-500 hover:border-indigo-300 hover:shadow-md hover:shadow-indigo-100",
  emerald: "bg-emerald-50/90 text-emerald-800 border-emerald-200 border-l-[4px] border-l-emerald-500 hover:border-emerald-300 hover:shadow-md hover:shadow-emerald-100",
  amber: "bg-amber-50/90 text-amber-900 border-amber-200 border-l-[4px] border-l-amber-500 hover:border-amber-300 hover:shadow-md hover:shadow-amber-100",
  violet: "bg-violet-50/90 text-violet-800 border-violet-200 border-l-[4px] border-l-violet-500 hover:border-violet-300 hover:shadow-md hover:shadow-violet-100",
  slate: "bg-slate-50/90 text-slate-800 border-slate-200 border-l-[4px] border-l-slate-500 hover:border-slate-300 hover:shadow-md hover:shadow-slate-100",
  rose: "bg-rose-50/90 text-rose-800 border-rose-200 border-l-[4px] border-l-rose-500 hover:border-rose-300 hover:shadow-md hover:shadow-rose-100",
};

const iconMap = {
  group: Users,
  individual: User,
  meeting: Video,
  other: Clock,
};

export default function TeacherSchedulePage() {
  const [view, setView] = useState<"week" | "day">("week");
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Modal custom dropdown states
  const [newEventDate, setNewEventDate] = useState(DATE_OPTIONS[0]);
  const [newEventStart, setNewEventStart] = useState("14:00");
  const [newEventEnd, setNewEventEnd] = useState("15:00");
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
  const [isStartDropdownOpen, setIsStartDropdownOpen] = useState(false);
  const [isEndDropdownOpen, setIsEndDropdownOpen] = useState(false);

  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [newEventType, setNewEventType] = useState<EventType>("group");

  useEffect(() => setMounted(true), []);

  // Block background scroll when modal or drawer is open
  useEffect(() => {
    if (selectedEvent || isAddModalOpen) {
      document.body.classList.add("overflow-hidden");
      document.documentElement.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
      document.documentElement.classList.remove("overflow-hidden");
    }
    return () => {
      document.body.classList.remove("overflow-hidden");
      document.documentElement.classList.remove("overflow-hidden");
    };
  }, [selectedEvent, isAddModalOpen]);

  // Formatting helpers
  const formatTime = (hour: number) => {
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  };

  // Navigation helpers
  const handlePrev = () => {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() - (view === "week" ? 7 : 1));
    setCurrentWeek(d);
  };

  const handleNext = () => {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() + (view === "week" ? 7 : 1));
    setCurrentWeek(d);
  };

  const handleToday = () => {
    setCurrentWeek(new Date());
  };

  const getMonday = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay() || 7;
    date.setDate(date.getDate() - day + 1);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };

  const getWeekDays = () => {
    const monday = new Date(getMonday(currentWeek));
    return DAYS.map((dayName, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const today = new Date();
      const isActualToday = 
        d.getDate() === today.getDate() && 
        d.getMonth() === today.getMonth() && 
        d.getFullYear() === today.getFullYear();
      
      return {
        name: dayName,
        date: d.getDate(),
        isToday: isActualToday
      };
    });
  };

  const isToday = () => {
    const today = new Date();
    if (view === "day") {
      return (
        currentWeek.getDate() === today.getDate() &&
        currentWeek.getMonth() === today.getMonth() &&
        currentWeek.getFullYear() === today.getFullYear()
      );
    } else {
      return getMonday(currentWeek) === getMonday(today);
    }
  };

  const getHeaderDateString = () => {
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    if (view === "day") {
      const str = currentWeek.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
      return capitalize(str);
    } else {
      const mon = new Date(getMonday(currentWeek));
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      
      const monStr = mon.getDate();
      const sunStr = sun.getDate();
      const monthStr = sun.toLocaleDateString("ru-RU", { month: "long" });
      const yearStr = sun.getFullYear();
      
      return `${monStr} — ${sunStr} ${capitalize(monthStr)}, ${yearStr}`;
    }
  };

  const HOUR_HEIGHT = 80; // px per hour

  return (
    <div className="space-y-6 w-full max-w-[1600px] mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Расписание
          </h1>
          <p className="text-slate-500 mt-1 flex items-center gap-2 font-medium ml-1">
            Ваш график занятий и мероприятий
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200/60 shadow-inner hidden sm:flex">
            <button
              onClick={() => setView("day")}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
                view === "day" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              День
            </button>
            <button
              onClick={() => setView("week")}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
                view === "week" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Неделя
            </button>
          </div>

          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors font-medium shadow-sm shadow-primary-600/20 text-sm"
          >
            <Plus className="w-4 h-4" />
            Добавить
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between bg-white px-5 py-3 rounded-2xl border border-slate-100 shadow-sm overflow-hidden relative">
        <div className="flex items-center gap-4 relative z-10">
          <div className="flex items-center gap-1">
            <button onClick={handlePrev} className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={handleNext} className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <h2 className="text-lg font-semibold text-slate-800 min-w-[200px]">
            {getHeaderDateString()}
          </h2>
        </div>
        
        <AnimatePresence>
          {!isToday() && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <button 
                onClick={handleToday}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 hover:text-slate-900 transition-colors shadow-sm"
              >
                Сегодня
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Calendar Grid (Week View) */}
      {view === "week" && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col relative z-0">
          
          {/* Header Row (Days) */}
          <div className="flex border-b border-slate-100 bg-slate-50/50">
            {/* Time column spacer */}
            <div className="w-20 shrink-0 border-r border-slate-100" />
            
            {/* Days columns */}
            {getWeekDays().map((day, i) => (
              <div key={day.name} className="flex-1 py-4 text-center border-r border-slate-100 last:border-r-0">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                  {day.name}
                </span>
                <span className={`text-xl font-bold ${day.isToday ? "text-primary-600 bg-primary-50 w-10 h-10 flex items-center justify-center rounded-full mx-auto" : "text-slate-800"}`}>
                  {day.date}
                </span>
              </div>
            ))}
          </div>

          {/* Body (Scrollable if needed, but we'll let it fill) */}
          <div className="flex relative" style={{ height: `${(END_HOUR - START_HOUR + 1) * HOUR_HEIGHT}px` }}>
            
            {/* Time Column */}
            <div className="w-20 shrink-0 border-r border-slate-100 relative bg-white z-10">
              {HOURS.map((hour) => (
                <div key={`time-${hour}`}>
                  <div 
                    className="absolute w-full flex justify-end pr-3"
                    style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px`, transform: "translateY(-50%)" }}
                  >
                    <span className="text-xs font-semibold text-slate-400">
                      {hour.toString().padStart(2, "0")}:00
                    </span>
                  </div>
                  {hour !== END_HOUR && (
                    <div 
                      className="absolute w-full flex justify-end pr-3"
                      style={{ top: `${(hour - START_HOUR + 0.5) * HOUR_HEIGHT}px`, transform: "translateY(-50%)" }}
                    >
                      <span className="text-[10px] font-medium text-slate-300">
                        30
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Grid Lines */}
            <div className="flex-1 relative bg-slate-50/30">
              {/* Horizontal lines */}
              {HOURS.map((hour) => (
                <div key={`hr-${hour}`}>
                  <div
                    className="absolute w-full border-t border-slate-100"
                    style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }}
                  />
                  {/* Half-hour dashed line */}
                  {hour !== END_HOUR && (
                    <div
                      className="absolute w-full border-t border-dashed border-slate-200"
                      style={{ top: `${(hour - START_HOUR + 0.5) * HOUR_HEIGHT}px` }}
                    />
                  )}
                </div>
              ))}

              {/* Vertical lines */}
              <div className="absolute inset-0 flex">
                {DAYS.map((day, i) => (
                  <div key={day} className="flex-1 border-r border-slate-100 last:border-r-0 relative">
                    {/* Events for this day */}
                    {mockEvents.filter(e => e.day === i).map(event => {
                      const Icon = iconMap[event.type];
                      const isCompact = event.durationHours <= 1;
                      
                      return (
                        <motion.div
                          key={event.id}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          onClick={() => setSelectedEvent(event)}
                          className={`absolute w-[calc(100%-8px)] mx-1 left-0 rounded-xl ${isCompact ? "p-2" : "p-2.5"} flex flex-col border shadow-sm transition-all cursor-pointer group hover:z-20 overflow-hidden ${colorMap[event.color]}`}
                          style={{
                            top: `${(event.startHour - START_HOUR) * HOUR_HEIGHT + 2}px`,
                            height: `${event.durationHours * HOUR_HEIGHT - 4}px`,
                          }}
                        >
                          <h3 className={`font-bold leading-tight truncate ${isCompact ? "text-[11px] sm:text-xs" : "text-sm"}`}>
                            {event.title}
                          </h3>
                          
                          {event.subtitle && !isCompact && (
                            <p className={`font-medium opacity-80 mt-0.5 truncate ${isCompact ? "text-[10px]" : "text-xs"}`}>
                              {event.subtitle}
                            </p>
                          )}
                          
                          <div className={`mt-auto ${isCompact ? "pt-1" : "pt-2"} flex flex-col gap-0.5 opacity-90 text-[10px] sm:text-[11px] font-medium`}>
                            <div className="flex items-center gap-1.5 truncate">
                              <Icon className={`${isCompact ? "w-2.5 h-2.5" : "w-3 h-3"} shrink-0`} />
                              <span className="truncate">{formatTime(event.startHour)} - {formatTime(event.startHour + event.durationHours)}</span>
                            </div>
                            {event.location && !isCompact && (
                              <div className="flex items-center gap-1.5 truncate max-w-[90%]">
                                <MapPin className={`${isCompact ? "w-2.5 h-2.5" : "w-3 h-3"} shrink-0`} />
                                <span className="truncate">{event.location}</span>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Smart Current Time Indicator (Mocked at 11:30 for Tuesday, day index 1) */}
              <div className="absolute inset-0 pointer-events-none z-30 flex">
                {DAYS.map((day, i) => (
                  <div key={`indicator-${i}`} className="flex-1 relative">
                    {i === 1 && (
                      <div 
                        className="absolute left-0 right-0 flex items-center pointer-events-none z-30"
                        style={{ top: `${(11.5 - START_HOUR) * HOUR_HEIGHT}px`, transform: "translateY(-50%)" }}
                      >
                        <div className="w-2.5 h-2.5 rounded-full bg-primary-500 shadow-[0_0_0_3px_white] ml-[-5px]" />
                        <div className="h-[2px] w-full bg-gradient-to-r from-primary-500/60 to-transparent" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Day View */}
      {view === "day" && (
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Main Timeline (Left) */}
          <div className="flex-1 w-full bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col relative z-0">
            {/* Header Row */}
            <div className="flex border-b border-slate-100 bg-slate-50/50 px-6 py-5">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Вторник, 19 Июня</h3>
                <p className="text-sm text-slate-500 mt-0.5">3 занятия сегодня</p>
              </div>
            </div>

            {/* Body */}
            <div className="flex relative" style={{ height: `${(END_HOUR - START_HOUR + 1) * HOUR_HEIGHT}px` }}>
              {/* Time Column */}
            <div className="w-24 shrink-0 border-r border-slate-100 relative bg-white z-10">
              {HOURS.map((hour) => (
                <div key={`day-time-${hour}`}>
                  <div 
                    className="absolute w-full flex justify-end pr-4"
                    style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px`, transform: "translateY(-50%)" }}
                  >
                    <span className="text-sm font-semibold text-slate-400">
                      {hour.toString().padStart(2, "0")}:00
                    </span>
                  </div>
                  {hour !== END_HOUR && (
                    <div 
                      className="absolute w-full flex justify-end pr-4"
                      style={{ top: `${(hour - START_HOUR + 0.5) * HOUR_HEIGHT}px`, transform: "translateY(-50%)" }}
                    >
                      <span className="text-xs font-medium text-slate-300">
                        30
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

              {/* Grid Lines & Events */}
              <div className="flex-1 relative bg-slate-50/20">
                {/* Horizontal lines */}
                {HOURS.map((hour) => (
                  <div key={`day-hr-${hour}`}>
                    <div
                      className="absolute w-full border-t border-slate-100"
                      style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }}
                    />
                    {hour !== END_HOUR && (
                      <div
                        className="absolute w-full border-t border-dashed border-slate-200"
                        style={{ top: `${(hour - START_HOUR + 0.5) * HOUR_HEIGHT}px` }}
                      />
                    )}
                  </div>
                ))}

                {/* Events for today (mock day 1) */}
                <div className="absolute inset-0 relative">
                  {mockEvents.filter(e => e.day === 1).map(event => {
                    const Icon = iconMap[event.type];
                    const isCompact = event.durationHours <= 1;
                    return (
                      <motion.div
                        key={event.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        onClick={() => setSelectedEvent(event)}
                        className={`absolute w-[calc(100%-24px)] mx-3 left-0 rounded-2xl ${isCompact ? "p-2" : "p-4"} flex flex-row items-center border shadow-sm transition-all cursor-pointer group hover:z-20 overflow-hidden ${colorMap[event.color]}`}
                        style={{
                          top: `${(event.startHour - START_HOUR) * HOUR_HEIGHT + 2}px`,
                          height: `${event.durationHours * HOUR_HEIGHT - 4}px`,
                        }}
                      >
                        <div className="flex items-center gap-4 w-full h-full">
                          <div className={`rounded-xl flex items-center justify-center bg-white/60 shrink-0 ${isCompact ? "w-10 h-10" : "w-12 h-12"}`}>
                            <Icon className={`${isCompact ? "w-5 h-5" : "w-6 h-6"}`} />
                          </div>
                          
                          <div className="flex-1 min-w-0 flex flex-col justify-center">
                            <h3 className={`font-bold leading-tight truncate ${isCompact ? "text-base" : "text-lg"}`}>
                              {event.title}
                            </h3>
                            {event.subtitle && !isCompact && (
                              <p className="text-sm font-medium opacity-80 mt-0.5 truncate">
                                {event.subtitle}
                              </p>
                            )}
                          </div>
                          
                          <div className={`flex flex-col items-end opacity-90 font-medium shrink-0 text-right ${isCompact ? "gap-1 text-xs" : "gap-1.5 text-sm"}`}>
                            <div className={`flex items-center gap-1.5 bg-white/60 rounded-lg ${isCompact ? "px-2 py-0.5" : "px-3 py-1"}`}>
                              <Clock className={`${isCompact ? "w-3 h-3" : "w-4 h-4"}`} />
                              {formatTime(event.startHour)} - {formatTime(event.startHour + event.durationHours)}
                            </div>
                            {event.location && !isCompact && (
                              <div className="flex items-center gap-1.5 text-xs opacity-80 mt-0.5">
                                <MapPin className="w-3.5 h-3.5" />
                                <span className="truncate">{event.location}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Modern Current Time Indicator Day View (Mocked at 11:30) */}
                <div 
                  className="absolute left-0 right-0 flex items-center pointer-events-none z-30"
                  style={{ top: `${(11.5 - START_HOUR) * HOUR_HEIGHT}px`, transform: "translateY(-50%)" }}
                >
                  <div className="w-2.5 h-2.5 rounded-full bg-primary-500 shadow-[0_0_0_4px_white] ml-[-5px]" />
                  <div className="h-[2px] w-full bg-gradient-to-r from-primary-500/60 via-primary-500/20 to-transparent" />
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar (Mini Agenda) */}
          <div className="w-full lg:w-[340px] shrink-0 space-y-6">
            {/* Quick Stats */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
              <h3 className="font-bold text-slate-900 mb-4">Сводка на сегодня</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Запланировано занятий</span>
                  <span className="font-bold text-slate-900">3</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Общее время</span>
                  <span className="font-bold text-slate-900">4 часа</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="w-1/3 h-full bg-primary-500 rounded-full" />
                </div>
                <p className="text-xs text-slate-400 text-center">Проведено 1 из 3 занятий</p>
              </div>
            </div>
            
            {/* Mini Agenda List */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
              <h3 className="font-bold text-slate-900 mb-4">Повестка дня</h3>
              <div className="space-y-3">
                {mockEvents.filter(e => e.day === 1).sort((a, b) => a.startHour - b.startHour).map(event => (
                  <div key={event.id} className="flex gap-3 relative">
                    <div className="flex flex-col items-center">
                      <div className={`w-2.5 h-2.5 rounded-full ${event.color === "emerald" ? "bg-emerald-500" : event.color === "blue" ? "bg-blue-500" : event.color === "indigo" ? "bg-indigo-500" : "bg-amber-500"} mt-1.5`} />
                      <div className="w-0.5 h-full bg-slate-100 mt-2" />
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-bold text-slate-900">
                        {formatTime(event.startHour)} <span className="text-slate-400 font-medium">— {formatTime(event.startHour + event.durationHours)}</span>
                      </p>
                      <p className="text-sm text-slate-600 mt-0.5 leading-tight">{event.title}</p>
                      {event.location && <p className="text-xs text-slate-400 mt-1">{event.location}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Event Details Drawer */}
      {mounted && createPortal(
        <AnimatePresence>
          {selectedEvent && (
            <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedEvent(null)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100]"
              style={{ transform: "translateZ(0)" }}
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: "100%", boxShadow: "-10px 0 30px rgba(0,0,0,0)" }}
              animate={{ x: 0, boxShadow: "-10px 0 30px rgba(0,0,0,0.05)" }}
              exit={{ x: "100%", boxShadow: "-10px 0 30px rgba(0,0,0,0)" }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white border-l border-slate-100 z-[110] flex flex-col shadow-2xl"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-900">Детали события</h2>
                <button 
                  onClick={() => setSelectedEvent(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                <div>
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold mb-4 ${
                    selectedEvent.type === "group" ? "bg-blue-50 text-blue-700" :
                    selectedEvent.type === "individual" ? "bg-amber-50 text-amber-700" :
                    "bg-slate-50 text-slate-700"
                  }`}>
                    {selectedEvent.type === "group" && <Users className="w-3.5 h-3.5" />}
                    {selectedEvent.type === "individual" && <User className="w-3.5 h-3.5" />}
                    {selectedEvent.type === "meeting" && <Video className="w-3.5 h-3.5" />}
                    {selectedEvent.type === "group" ? "Групповое занятие" :
                     selectedEvent.type === "individual" ? "Индивидуальное" : "Собрание"}
                  </div>
                  
                  <h1 className="text-2xl font-bold text-slate-900 mb-2">{selectedEvent.title}</h1>
                  {selectedEvent.subtitle && (
                    <p className="text-slate-500 text-lg">{selectedEvent.subtitle}</p>
                  )}
                </div>

                <div className="space-y-4 bg-slate-50 p-5 rounded-2xl border border-slate-100/60">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 shadow-sm flex items-center justify-center text-slate-400">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Время</p>
                      <p className="text-slate-900 font-semibold mt-0.5">
                        {formatTime(selectedEvent.startHour)} - {formatTime(selectedEvent.startHour + selectedEvent.durationHours)}
                      </p>
                    </div>
                  </div>
                  {selectedEvent.location && (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 shadow-sm flex items-center justify-center text-slate-400">
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 font-medium">Локация</p>
                        <p className="text-slate-900 font-semibold mt-0.5">{selectedEvent.location}</p>
                      </div>
                    </div>
                  )}
                </div>

                {selectedEvent.type === "group" && (
                  <div>
                    <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <Users className="w-5 h-5 text-slate-400" />
                      Ученики (12)
                    </h3>
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl shadow-sm">
                          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600">
                            У
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-900">Ученик {i}</p>
                            <p className="text-xs text-slate-500">Присутствует</p>
                          </div>
                        </div>
                      ))}
                      <button className="w-full py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 bg-slate-50 rounded-xl transition-colors">
                        Показать всех
                      </button>
                    </div>
                  </div>
                )}

                {selectedEvent.type === "individual" && (
                  <div>
                    <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <User className="w-5 h-5 text-slate-400" />
                      Ученик
                    </h3>
                    <div className="flex items-center gap-3 p-4 bg-white border border-slate-100 rounded-xl shadow-sm">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-lg">
                        {selectedEvent.subtitle ? selectedEvent.subtitle[0] : "У"}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-900">{selectedEvent.subtitle || "Не указан"}</p>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">Индивидуальный план</p>
                      </div>
                    </div>
                  </div>
                )}

                {selectedEvent.type === "meeting" && (
                  <div>
                    <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <Users className="w-5 h-5 text-slate-400" />
                      Участники
                    </h3>
                    <div className="flex items-center gap-3 p-4 bg-white border border-slate-100 rounded-xl shadow-sm">
                      <div className="flex -space-x-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-xs font-bold text-blue-700">A</div>
                        <div className="w-10 h-10 rounded-full bg-emerald-100 border-2 border-white flex items-center justify-center text-xs font-bold text-emerald-700">B</div>
                        <div className="w-10 h-10 rounded-full bg-amber-100 border-2 border-white flex items-center justify-center text-xs font-bold text-amber-700">C</div>
                      </div>
                      <div className="flex-1 ml-2">
                        <p className="text-sm font-bold text-slate-900">Весь пед. состав</p>
                        <p className="text-xs text-slate-500 mt-0.5">5 участников</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Drawer Footer Actions */}
              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-3">
                <button className="flex-1 py-3 bg-primary-600 text-white rounded-xl font-medium shadow-sm shadow-primary-600/20 hover:bg-primary-700 transition-colors">
                  Начать урок
                </button>
                <button className="px-5 py-3 bg-white text-slate-700 rounded-xl font-medium border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors">
                  Изменить время
                </button>
              </div>
            </motion.div>
          </>
        )}
        </AnimatePresence>,
        document.body
      )}

      {/* Add Event Modal */}
      {mounted && createPortal(
        <AnimatePresence>
          {isAddModalOpen && (
            <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddModalOpen(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100]"
              style={{ transform: "translateZ(0)" }}
            />
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="w-full max-w-lg bg-white rounded-3xl shadow-2xl pointer-events-auto"
              >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-3xl">
                <h2 className="text-xl font-bold text-slate-900">Новое событие</h2>
                <button 
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-7">
                {/* Title Input */}
                <div>
                  <input 
                    type="text" 
                    placeholder="Название события..."
                    className="w-full px-2 py-2 text-2xl font-bold text-slate-900 placeholder:text-slate-300 border-b-2 border-transparent hover:border-slate-100 focus:border-primary-500 focus:outline-none transition-colors bg-transparent"
                  />
                </div>

                {/* Type Selector (Radio Group style) */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Тип занятия</label>
                  <div className="flex bg-slate-100/80 p-1 rounded-xl">
                    <button 
                      onClick={() => setNewEventType("group")}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${newEventType === 'group' ? 'bg-white shadow-sm text-slate-800 ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                    >
                      <Users className={`w-4 h-4 ${newEventType === 'group' ? 'text-blue-500' : ''}`} />
                      Группа
                    </button>
                    <button 
                      onClick={() => setNewEventType("individual")}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${newEventType === 'individual' ? 'bg-white shadow-sm text-slate-800 ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                    >
                      <User className={`w-4 h-4 ${newEventType === 'individual' ? 'text-emerald-500' : ''}`} />
                      Индив.
                    </button>
                    <button 
                      onClick={() => setNewEventType("meeting")}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${newEventType === 'meeting' ? 'bg-white shadow-sm text-slate-800 ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                    >
                      <Video className={`w-4 h-4 ${newEventType === 'meeting' ? 'text-violet-500' : ''}`} />
                      Онлайн
                    </button>
                  </div>
                </div>

                {/* Date & Time */}
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Дата</label>
                    <div className="relative">
                      <button 
                        onClick={() => { setIsDateDropdownOpen(!isDateDropdownOpen); setIsStartDropdownOpen(false); setIsEndDropdownOpen(false); }}
                        className={`w-full flex items-center justify-between pl-10 pr-4 py-2.5 rounded-xl border transition-all text-sm font-semibold ${isDateDropdownOpen ? 'border-primary-500 ring-2 ring-primary-500/20 bg-white text-slate-900' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100/50'}`}
                      >
                        <CalendarIcon className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${isDateDropdownOpen ? 'text-primary-500' : 'text-slate-400'}`} />
                        {newEventDate}
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isDateDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      
                      <AnimatePresence>
                        {isDateDropdownOpen && (
                          <motion.div 
                            initial={{ opacity: 0, y: 5 }} 
                            animate={{ opacity: 1, y: 0 }} 
                            exit={{ opacity: 0, y: 5 }} 
                            transition={{ duration: 0.15 }}
                            className="absolute z-[120] top-full -left-6 mt-2 w-72 bg-white border border-slate-100 rounded-2xl shadow-xl shadow-slate-200/50 p-4"
                          >
                            <div className="flex items-center justify-between mb-4">
                              <button 
                                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}
                                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                              <div className="text-sm font-bold text-slate-800 capitalize">
                                {new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(calendarMonth).replace(' г.', '')}
                              </div>
                              <button 
                                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}
                                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </div>
                            
                            <div className="grid grid-cols-7 gap-1 text-center mb-2">
                              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map(day => (
                                <div key={day} className="text-[10px] font-bold text-slate-400 uppercase">{day}</div>
                              ))}
                            </div>
                            
                            <div className="grid grid-cols-7 gap-1">
                              {Array.from({ length: (new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay() + 6) % 7 }).map((_, i) => (
                                <div key={`empty-${i}`} />
                              ))}
                              
                              {Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate() }).map((_, i) => {
                                const day = i + 1;
                                const dateStr = `${day} ${new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(calendarMonth)}, ${calendarMonth.getFullYear()}`;
                                const isSelected = newEventDate === dateStr;
                                const isToday = new Date().getDate() === day && new Date().getMonth() === calendarMonth.getMonth() && new Date().getFullYear() === calendarMonth.getFullYear();
                                
                                return (
                                  <button
                                    key={day}
                                    onClick={() => {
                                      setNewEventDate(dateStr);
                                      setIsDateDropdownOpen(false);
                                    }}
                                    className={`w-full aspect-square flex items-center justify-center text-sm font-medium rounded-full transition-all ${
                                      isSelected 
                                        ? 'bg-primary-600 text-white shadow-md shadow-primary-500/30' 
                                        : isToday 
                                          ? 'bg-primary-50 text-primary-700 hover:bg-primary-100'
                                          : 'text-slate-700 hover:bg-slate-100'
                                    }`}
                                  >
                                    {day}
                                  </button>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Начало</label>
                      <div className="relative">
                        <button 
                          onClick={() => { setIsStartDropdownOpen(!isStartDropdownOpen); setIsDateDropdownOpen(false); setIsEndDropdownOpen(false); }}
                          className={`w-full flex items-center justify-between pl-9 pr-2 py-2.5 rounded-xl border transition-all text-sm font-semibold ${isStartDropdownOpen ? 'border-primary-500 ring-2 ring-primary-500/20 bg-white text-slate-900' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100/50'}`}
                        >
                          <Clock className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${isStartDropdownOpen ? 'text-primary-500' : 'text-slate-400'}`} />
                          {newEventStart}
                          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isStartDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        
                        <AnimatePresence>
                          {isStartDropdownOpen && (
                            <motion.div 
                              initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} transition={{ duration: 0.15 }}
                              className="absolute z-[120] top-full left-0 mt-2 w-full bg-white border border-slate-100 rounded-xl shadow-xl shadow-slate-200/50 max-h-48 overflow-y-auto py-1.5 custom-scrollbar"
                            >
                              {TIME_SLOTS.map(time => (
                                <button key={time} onClick={() => { setNewEventStart(time); setIsStartDropdownOpen(false); }}
                                  className={`w-full text-center px-2 py-2 text-sm font-medium transition-colors ${newEventStart === time ? 'bg-primary-50 text-primary-600' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                                >
                                  {time}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Конец</label>
                      <div className="relative">
                        <button 
                          onClick={() => { setIsEndDropdownOpen(!isEndDropdownOpen); setIsDateDropdownOpen(false); setIsStartDropdownOpen(false); }}
                          className={`w-full flex items-center justify-between pl-9 pr-2 py-2.5 rounded-xl border transition-all text-sm font-semibold ${isEndDropdownOpen ? 'border-primary-500 ring-2 ring-primary-500/20 bg-white text-slate-900' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100/50'}`}
                        >
                          <Clock className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${isEndDropdownOpen ? 'text-primary-500' : 'text-slate-400'}`} />
                          {newEventEnd}
                          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isEndDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        
                        <AnimatePresence>
                          {isEndDropdownOpen && (
                            <motion.div 
                              initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} transition={{ duration: 0.15 }}
                              className="absolute z-[120] top-full left-0 mt-2 w-full bg-white border border-slate-100 rounded-xl shadow-xl shadow-slate-200/50 max-h-48 overflow-y-auto py-1.5 custom-scrollbar"
                            >
                              {TIME_SLOTS.map(time => (
                                <button key={time} onClick={() => { setNewEventEnd(time); setIsEndDropdownOpen(false); }}
                                  className={`w-full text-center px-2 py-2 text-sm font-medium transition-colors ${newEventEnd === time ? 'bg-primary-50 text-primary-600' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                                >
                                  {time}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Location */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Локация</label>
                  <div className="relative group">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
                    <input 
                      type="text" 
                      placeholder="Аудитория или ссылка на Zoom..."
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-slate-700 font-medium bg-slate-50 hover:bg-slate-100/50 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-3xl">
                <button 
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-200/50 rounded-xl transition-colors"
                >
                  Отмена
                </button>
                <button 
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-6 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 shadow-sm shadow-primary-600/20 transition-all"
                >
                  Создать
                </button>
              </div>
              </motion.div>
            </div>
          </>
        )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
