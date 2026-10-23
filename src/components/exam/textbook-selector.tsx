"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ChevronRight, Check, Book, BookOpen } from "lucide-react";
import { Textbook, Chapter } from "@/lib/curriculum/topics-tree";
import { Checkbox } from "@/components/ui/checkbox";

interface TextbookSelectorProps {
  textbooks: Textbook[];
  selectedSections: Set<string>;
  onToggleSection: (sectionId: string, selected: boolean) => void;
}

export function TextbookSelector({ textbooks, selectedSections, onToggleSection }: TextbookSelectorProps) {
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());

  const toggleBook = (bookId: string) => {
    const newSet = new Set(expandedBooks);
    if (newSet.has(bookId)) {
      newSet.delete(bookId);
    } else {
      newSet.add(bookId);
    }
    setExpandedBooks(newSet);
  };

  const toggleChapter = (chapterId: string) => {
    const newSet = new Set(expandedChapters);
    if (newSet.has(chapterId)) {
      newSet.delete(chapterId);
    } else {
      newSet.add(chapterId);
    }
    setExpandedChapters(newSet);
  };

  if (textbooks.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <Book className="w-12 h-12 mx-auto mb-3 text-slate-300" />
        <p>Нет учебников для выбранного класса</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {textbooks.map((textbook) => (
        <div
          key={textbook.id}
          className="border border-slate-200 rounded-xl overflow-hidden bg-white"
        >
          {/* Textbook header */}
          <button
            onClick={() => toggleBook(textbook.id)}
            className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
              <Book className="w-5 h-5 text-primary-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-slate-900">{textbook.name}</p>
              <p className="text-sm text-slate-500">{textbook.author}</p>
            </div>
            <motion.div animate={{ rotate: expandedBooks.has(textbook.id) ? 90 : 0 }}>
              <ChevronRight className="w-5 h-5 text-slate-400" />
            </motion.div>
          </button>

          {/* Chapters */}
          <AnimatePresence>
            {expandedBooks.has(textbook.id) && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: "auto" }}
                exit={{ height: 0 }}
                className="overflow-hidden border-t border-slate-100"
              >
                <div className="p-2 space-y-1">
                  {textbook.chapters.map((chapter) => (
                    <ChapterItem
                      key={chapter.id}
                      chapter={chapter}
                      isExpanded={expandedChapters.has(chapter.id)}
                      onToggle={() => toggleChapter(chapter.id)}
                      selectedSections={selectedSections}
                      onToggleSection={onToggleSection}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

interface ChapterItemProps {
  chapter: Chapter;
  isExpanded: boolean;
  onToggle: () => void;
  selectedSections: Set<string>;
  onToggleSection: (sectionId: string, selected: boolean) => void;
}

function ChapterItem({ chapter, isExpanded, onToggle, selectedSections, onToggleSection }: ChapterItemProps) {
  const allSelected = chapter.sections.every((s) => selectedSections.has(s.id));
  const someSelected = chapter.sections.some((s) => selectedSections.has(s.id));

  const toggleAll = () => {
    const shouldSelect = !allSelected;
    chapter.sections.forEach((s) => {
      onToggleSection(s.id, shouldSelect);
    });
  };

  return (
    <div className="rounded-lg overflow-hidden">
      {/* Chapter header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
        <button onClick={onToggle} className="p-0.5">
          <motion.div animate={{ rotate: isExpanded ? 90 : 0 }}>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </motion.div>
        </button>

        <button
          onClick={toggleAll}
          className={cn(
            "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
            allSelected && "bg-primary-500 border-primary-500",
            someSelected && !allSelected && "bg-amber-500 border-amber-500",
            !someSelected && "border-slate-300"
          )}
        >
          {allSelected && <Check className="w-3 h-3 text-white" />}
          {someSelected && !allSelected && <span className="w-2 h-0.5 bg-white" />}
        </button>

        <BookOpen className="w-4 h-4 text-slate-400" />
        <span className="flex-1 text-sm font-medium text-slate-700">
          Глава {chapter.number}. {chapter.name}
        </span>
        <span className="text-xs text-slate-400">§{chapter.sections.length}</span>
      </div>

      {/* Sections */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="ml-10 py-2 space-y-1">
              {chapter.sections.map((section) => (
                <label
                  key={section.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                    selectedSections.has(section.id)
                      ? "bg-primary-50"
                      : "hover:bg-slate-50"
                  )}
                >
                  <Checkbox
                    checked={selectedSections.has(section.id)}
                    onChange={(e) => onToggleSection(section.id, e.target.checked)}
                  />
                  <span className="text-sm text-slate-600">
                    <span className="font-medium">§{section.number}</span> {section.name}
                  </span>
                </label>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
