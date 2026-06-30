import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Filter, Check, X } from "lucide-react";

interface Teacher {
  id: string;
  first_name: string;
  last_name: string;
}

interface Group {
  id: string;
  name: string;
  teacher_id: string;
}

interface CascadingFilterProps {
  teachers: Teacher[];
  groups: Group[];
  value: { teacherId: string; groupId: string };
  onChange: (value: { teacherId: string; groupId: string }) => void;
}

export function CascadingFilter({ teachers, groups, value, onChange }: CascadingFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredTeacher, setHoveredTeacher] = useState<string | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setHoveredTeacher(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMouseEnter = (teacherId: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setHoveredTeacher(teacherId);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setHoveredTeacher(null);
    }, 150); // slight delay to allow diagonal mouse movement
  };

  const getActiveFilterLabel = () => {
    if (value.groupId) {
      const g = groups.find((g) => g.id === value.groupId);
      return g ? g.name : "Фильтр";
    }
    if (value.teacherId) {
      const t = teachers.find((t) => t.id === value.teacherId);
      return t ? `${t.first_name} ${t.last_name}` : "Фильтр";
    }
    return "Все ученики";
  };

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
      >
        <Filter className="w-4 h-4 text-slate-400" />
        {getActiveFilterLabel()}
        {(value.teacherId || value.groupId) && (
          <div 
            role="button"
            className="ml-1 p-0.5 rounded-full hover:bg-slate-200 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onChange({ teacherId: "", groupId: "" });
            }}
          >
            <X className="w-3.5 h-3.5 text-slate-500" />
          </div>
        )}
      </button>

      {/* Main Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-2 w-64 bg-white rounded-xl shadow-lg shadow-slate-200/50 border border-slate-100 py-2"
          >
            {/* All Students Option */}
            <button
              onClick={() => {
                onChange({ teacherId: "", groupId: "" });
                setIsOpen(false);
              }}
              className="w-full flex items-center px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <div className="flex-1 text-left font-medium">Все ученики</div>
              {!value.teacherId && !value.groupId && <Check className="w-4 h-4 text-primary-600" />}
            </button>

            <div className="h-px bg-slate-100 my-1 mx-4" />

            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-1.5">
              Преподаватели
            </div>

            {teachers.map((teacher) => {
              const isSelected = value.teacherId === teacher.id;
              const isHovered = hoveredTeacher === teacher.id;
              const teacherGroups = groups.filter(g => g.teacher_id === teacher.id);
              const hasGroups = teacherGroups.length > 0;

              return (
                <div
                  key={teacher.id}
                  className="relative"
                  onMouseEnter={() => handleMouseEnter(teacher.id)}
                  onMouseLeave={handleMouseLeave}
                >
                  <button
                    onClick={() => {
                      onChange({ teacherId: teacher.id, groupId: "" });
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center px-4 py-2 text-sm transition-colors ${
                      isHovered ? "bg-slate-50" : "bg-transparent"
                    } ${isSelected && !value.groupId ? "text-primary-700 font-medium" : "text-slate-700"}`}
                  >
                    <div className="flex-1 text-left">{teacher.first_name} {teacher.last_name}</div>
                    {isSelected && !value.groupId && !hasGroups && <Check className="w-4 h-4 text-primary-600 mr-2" />}
                    {hasGroups && (
                      <ChevronRight className={`w-4 h-4 ${isHovered ? 'text-slate-600' : 'text-slate-400'}`} />
                    )}
                  </button>

                  {/* Nested Sub-menu */}
                  <AnimatePresence>
                    {isHovered && hasGroups && (
                      <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-full top-0 ml-1 w-56 bg-white rounded-xl shadow-xl shadow-slate-200/50 border border-slate-100 py-2 z-50"
                        onMouseEnter={() => handleMouseEnter(teacher.id)}
                        onMouseLeave={handleMouseLeave}
                      >
                        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-1.5 border-b border-slate-50 mb-1">
                          Группы
                        </div>

                        {teacherGroups.map((group) => {
                          const isGroupSelected = value.groupId === group.id;
                          return (
                            <button
                              key={group.id}
                              onClick={() => {
                                onChange({ teacherId: teacher.id, groupId: group.id });
                                setIsOpen(false);
                              }}
                              className={`w-full flex items-center px-4 py-2 text-sm transition-colors hover:bg-slate-50 ${
                                isGroupSelected ? "text-primary-700 font-medium" : "text-slate-700"
                              }`}
                            >
                              <div className="flex-1 text-left truncate pr-2">{group.name}</div>
                              {isGroupSelected && <Check className="w-4 h-4 text-primary-600 flex-shrink-0" />}
                            </button>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
