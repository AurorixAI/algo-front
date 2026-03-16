"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ChevronRight, Check, Minus } from "lucide-react";
import { Topic, getAllTopicIds } from "@/lib/curriculum/topics-tree";

interface TopicTreeProps {
  topics: Topic[];
  selectedTopics: Set<string>;
  onToggle: (topicId: string, selected: boolean) => void;
  locale?: "ru" | "uz" | "en";
  level?: number;
}

export function TopicTree({ topics, selectedTopics, onToggle, locale = "ru", level = 0 }: TopicTreeProps) {
  return (
    <div className={cn("space-y-1", level > 0 && "ml-6 border-l border-slate-200 pl-3")}>
      {topics.map((topic) => (
        <TopicItem
          key={topic.id}
          topic={topic}
          selectedTopics={selectedTopics}
          onToggle={onToggle}
          locale={locale}
          level={level}
        />
      ))}
    </div>
  );
}

interface TopicItemProps {
  topic: Topic;
  selectedTopics: Set<string>;
  onToggle: (topicId: string, selected: boolean) => void;
  locale: "ru" | "uz" | "en";
  level: number;
}

function TopicItem({ topic, selectedTopics, onToggle, locale, level }: TopicItemProps) {
  const [isExpanded, setIsExpanded] = useState(level < 1);
  const hasChildren = topic.children && topic.children.length > 0;

  // Получить название на нужном языке
  const getName = () => {
    if (locale === "uz") return topic.nameUz;
    if (locale === "en") return topic.nameEn;
    return topic.name;
  };

  // Проверить статус выбора (все/часть/ничего)
  const getSelectionStatus = (): "all" | "partial" | "none" => {
    if (!hasChildren) {
      return selectedTopics.has(topic.id) ? "all" : "none";
    }

    const childIds = getAllTopicIds(topic);
    const selectedCount = childIds.filter((id) => selectedTopics.has(id)).length;

    if (selectedCount === 0) return "none";
    if (selectedCount === childIds.length) return "all";
    return "partial";
  };

  const status = getSelectionStatus();

  // Переключить тему и все подтемы
  const handleToggle = () => {
    if (!hasChildren) {
      onToggle(topic.id, !selectedTopics.has(topic.id));
    } else {
      const childIds = getAllTopicIds(topic);
      const shouldSelect = status !== "all";
      
      childIds.forEach((id) => {
        onToggle(id, shouldSelect);
      });
    }
  };

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer transition-all",
          "hover:bg-slate-50",
          status === "all" && "bg-primary-50",
          status === "partial" && "bg-amber-50/50"
        )}
      >
        {/* Expand/Collapse button */}
        {hasChildren ? (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-0.5 rounded hover:bg-slate-200 transition-colors"
          >
            <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </motion.div>
          </button>
        ) : (
          <div className="w-5" />
        )}

        {/* Checkbox */}
        <button
          onClick={handleToggle}
          className={cn(
            "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
            status === "all" && "bg-primary-500 border-primary-500",
            status === "partial" && "bg-amber-500 border-amber-500",
            status === "none" && "border-slate-300 hover:border-primary-400"
          )}
        >
          {status === "all" && <Check className="w-3 h-3 text-white" />}
          {status === "partial" && <Minus className="w-3 h-3 text-white" />}
        </button>

        {/* Label */}
        <span
          onClick={handleToggle}
          className={cn(
            "flex-1 text-sm transition-colors cursor-pointer",
            status !== "none" ? "text-slate-900 font-medium" : "text-slate-600"
          )}
        >
          {getName()}
        </span>

        {/* Count badge */}
        {hasChildren && (
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            {topic.children!.length}
          </span>
        )}
      </div>

      {/* Children */}
      <AnimatePresence>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <TopicTree
              topics={topic.children!}
              selectedTopics={selectedTopics}
              onToggle={onToggle}
              locale={locale}
              level={level + 1}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
