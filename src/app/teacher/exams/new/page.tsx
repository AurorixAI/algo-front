"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  textbookApi,
  examsApi,
  type TextbookBrief,
  type TOCNode,
  type SkillTreeNode,
} from "@/lib/api";
import QRCode from "qrcode.react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  BookOpen,
  Target,
  Settings,
  Monitor,
  Clock,
  Sparkles,
  Upload,
  Plus,
  Database,
  ChevronRight,
  ChevronDown,
  Layers,
  Shield,
  Zap,
  Minus,
} from "lucide-react";

type Step = 1 | 2 | 3 | 4 | 5;
type SourceType = "topics" | "textbook" | "custom";
type ExamMode = "online" | "print" | "hybrid";

interface ExamConfig {
  name: string;
  classId: string;
  type: "control" | "diagnostic";
  sourceType: SourceType;
  selectedTopics: Set<string>;
  selectedSections: Set<string>;
  subjectFilter: "all" | "algebra" | "geometry";
  variantsCount: number;
  questionsCount: number;
  duration: number;
  difficulty: { easy: number; medium: number; hard: number };
  mode: ExamMode;
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  showResults: boolean;
}

// ─── Helper: collect all L4 leaf descendant ids beneath a node ───
function collectLeafIds(node: SkillTreeNode): string[] {
  if (!node.children?.length) return [node.id];
  return node.children.flatMap(collectLeafIds);
}

// ─── Collapsible Skill Tree (L1→L3 visible, L4 on expand) ───
function SkillTreeAccordion({
  nodes,
  selectedTopics,
  onToggle,
  onToggleGroup,
  expandedNodes,
  onExpand,
}: {
  nodes: SkillTreeNode[];
  selectedTopics: Set<string>;
  onToggle: (id: string, selected: boolean) => void;
  onToggleGroup: (ids: string[], selected: boolean) => void;
  expandedNodes: Set<string>;
  onExpand: (id: string) => void;
}) {
  if (!nodes?.length) return null;

  return (
    <div className="space-y-1">
      {nodes.map((l1) => {
        const l1Expanded = expandedNodes.has(l1.id);
        const l1Leaves = collectLeafIds(l1);
        const l1Selected = l1Leaves.filter((id) => selectedTopics.has(id)).length;

        return (
          <div key={l1.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {/* ── L1 Header ── */}
            <button
              onClick={() => onExpand(l1.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                l1Selected > 0 ? "bg-primary-100" : "bg-slate-100"
              }`}>
                <Layers className={`w-4 h-4 ${l1Selected > 0 ? "text-primary-600" : "text-slate-400"}`} />
              </div>
              <span className="font-semibold text-slate-900 text-[15px] flex-1 text-left">
                {l1.name_ru || l1.name}
              </span>
              {l1Selected > 0 && (
                <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                  {l1Selected}
                </span>
              )}
              {l1Expanded
                ? <ChevronDown className="w-4 h-4 text-slate-400" />
                : <ChevronRight className="w-4 h-4 text-slate-400" />
              }
            </button>

            {/* ── L2 children ── */}
            {l1Expanded && l1.children?.length > 0 && (
              <div className="border-t border-slate-100">
                {l1.children.map((l2) => {
                  const l2Expanded = expandedNodes.has(l2.id);
                  const l2Leaves = collectLeafIds(l2);
                  const l2Selected = l2Leaves.filter((id) => selectedTopics.has(id)).length;

                  return (
                    <div key={l2.id} className="border-b border-slate-50 last:border-b-0">
                      <button
                        onClick={() => onExpand(l2.id)}
                        className="w-full flex items-center gap-3 pl-8 pr-4 py-2.5 hover:bg-slate-50/70 transition-colors"
                      >
                        {l2Expanded
                          ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          : <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        }
                        <span className="font-medium text-slate-700 text-sm flex-1 text-left">
                          {l2.name_ru || l2.name}
                        </span>
                        {l2Selected > 0 && (
                          <span className="text-xs text-primary-500">
                            {l2Selected}/{l2Leaves.length}
                          </span>
                        )}
                        {l2Selected === 0 && l2Leaves.length > 0 && (
                          <span className="text-xs text-slate-300">{l2Leaves.length}</span>
                        )}
                      </button>

                      {/* ── L3 children ── */}
                      {l2Expanded && l2.children?.length > 0 && (
                        <div className="bg-slate-50/50">
                          {l2.children.map((l3) => {
                            const l3Expanded = expandedNodes.has(l3.id);
                            const l3Leaves = collectLeafIds(l3);
                            const l3Selected = l3Leaves.filter((id) => selectedTopics.has(id)).length;
                            const l3AllSelected = l3Selected === l3Leaves.length && l3Leaves.length > 0;
                            const l3HasL4 = l3.children?.length > 0;

                            return (
                              <div key={l3.id}>
                                <div className="flex items-center gap-2 pl-14 pr-4 py-2 hover:bg-slate-100/60 transition-colors">
                                  {/* Group checkbox for L3 — selects all L4 */}
                                  <input
                                    type="checkbox"
                                    checked={l3AllSelected}
                                    ref={(el) => { if (el) el.indeterminate = l3Selected > 0 && !l3AllSelected; }}
                                    onChange={(e) => onToggleGroup(l3Leaves, e.target.checked)}
                                    className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 flex-shrink-0"
                                  />
                                  <button
                                    onClick={() => l3HasL4 && onExpand(l3.id)}
                                    className="flex items-center gap-1.5 flex-1 min-w-0"
                                  >
                                    <span className="text-sm text-slate-600 truncate text-left flex-1">
                                      {l3.name_ru || l3.name}
                                    </span>
                                    {l3HasL4 && (
                                      <span className="text-xs text-slate-400 flex-shrink-0">
                                        {l3Selected > 0 ? `${l3Selected}/${l3Leaves.length}` : l3Leaves.length}
                                      </span>
                                    )}
                                    {l3HasL4 && (
                                      l3Expanded
                                        ? <ChevronDown className="w-3 h-3 text-slate-300 flex-shrink-0" />
                                        : <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                                    )}
                                  </button>
                                </div>

                                {/* ── L4 leaves (hidden by default) ── */}
                                {l3Expanded && l3HasL4 && (
                                  <div className="bg-white/60">
                                    {l3.children!.map((l4) => {
                                      const checked = selectedTopics.has(l4.id);
                                      return (
                                        <label
                                          key={l4.id}
                                          className="flex items-center gap-2.5 pl-20 pr-4 py-1.5 cursor-pointer hover:bg-primary-50/40 transition-colors"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={(e) => onToggle(l4.id, e.target.checked)}
                                            className="w-3.5 h-3.5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                                          />
                                          <span className={`text-xs ${
                                            checked ? "text-primary-700 font-medium" : "text-slate-500"
                                          }`}>
                                            {l4.name_ru || l4.name}
                                          </span>
                                          {l4.tasks_count > 0 && (
                                            <span className="text-[10px] text-slate-300 ml-auto">{l4.tasks_count}</span>
                                          )}
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Recursive TOC renderer (textbook structure from API) ───
function TOCTreeView({ nodes, selectedSections, onToggle, depth }: {
  nodes: TOCNode[];
  selectedSections: Set<string>;
  onToggle: (id: string, selected: boolean) => void;
  depth: number;
}) {
  if (!nodes?.length) return null;
  return (
    <div className={depth > 0 ? "ml-4 border-l border-slate-100 pl-3" : ""}>
      {nodes.map((node) => {
        const isSelected = selectedSections.has(String(node.id));
        const hasChildren = node.children && node.children.length > 0;
        return (
          <div key={node.id} className="py-1">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => onToggle(String(node.id), e.target.checked)}
                className="w-4 h-4 rounded text-primary-600"
              />
              <span className={`text-sm ${!hasChildren ? "text-slate-600" : "font-medium text-slate-800"} group-hover:text-primary-600 transition-colors`}>
                {node.display_number ? `${node.display_number}. ` : ""}{node.display_name}
              </span>
              {node.page_start && <span className="text-xs text-slate-300 ml-auto">с.{node.page_start}</span>}
            </label>
            {hasChildren && (
              <TOCTreeView nodes={node.children!} selectedSections={selectedSections} onToggle={onToggle} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function NewExamPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateVariants, setGenerateVariants] = useState(false);

  const [config, setConfig] = useState<ExamConfig>({
    name: "",
    classId: "",
    type: "control",
    sourceType: "topics",
    selectedTopics: new Set(),
    selectedSections: new Set(),
    subjectFilter: "all",
    variantsCount: 2,
    questionsCount: 8,
    duration: 45,
    difficulty: { easy: 30, medium: 50, hard: 20 },
    mode: "online",
    shuffleQuestions: true,
    shuffleAnswers: true,
    showResults: false,
  });

  // Expandable accordion state for skill tree
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const handleExpandToggle = (id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const handleToggleGroup = (ids: string[], selected: boolean) => {
    const newSet = new Set(config.selectedTopics);
    ids.forEach((id) => selected ? newSet.add(id) : newSet.delete(id));
    setConfig({ ...config, selectedTopics: newSet });
  };

  // ─── API Data ───
  const [apiTextbooks, setApiTextbooks] = useState<TextbookBrief[]>([]);
  const [apiTOC, setApiTOC] = useState<TOCNode[]>([]);
  const [apiSkillTree, setApiSkillTree] = useState<SkillTreeNode[]>([]);
  const [selectedTextbookId, setSelectedTextbookId] = useState<string>("");
  const [loadingAPI, setLoadingAPI] = useState(false);

  // Fetch textbooks when class changes
  useEffect(() => {
    if (!config.classId) return;
    const grade = parseInt(config.classId);
    if (isNaN(grade)) return;
    
    setLoadingAPI(true);
    Promise.all([
      textbookApi.list({ class_level: grade }).catch(() => []),
      textbookApi.skillTree(grade).catch(() => []),
    ]).then(([books, skills]) => {
      setApiTextbooks(books);
      setApiSkillTree(skills);
      // Auto-expand only L1 nodes
      const autoExpand = new Set<string>();
      for (const l1 of skills) {
        autoExpand.add(l1.id);
      }
      setExpandedNodes(autoExpand);
    }).finally(() => setLoadingAPI(false));
  }, [config.classId]);

  // Fetch TOC when textbook selected
  useEffect(() => {
    if (!selectedTextbookId) return;
    setLoadingAPI(true);
    textbookApi.toc(selectedTextbookId)
      .then(setApiTOC)
      .catch(() => setApiTOC([]))
      .finally(() => setLoadingAPI(false));
  }, [selectedTextbookId]);

  const classes = [
    { value: "5", label: "5 класс" },
    { value: "6", label: "6 класс" },
    { value: "7", label: "7 класс" },
    { value: "8", label: "8 класс" },
    { value: "9", label: "9 класс" },
    { value: "10", label: "10 класс" },
    { value: "11", label: "11 класс" },
  ];

  const examTypes = [
    { value: "control", label: "📋 Контрольная работа" },
    { value: "diagnostic", label: "🔍 Быстрая проверка" },
  ];

  const filteredTextbooks = useMemo(() => {
    if (!apiTextbooks.length) return [];
    return apiTextbooks;
  }, [apiTextbooks]);

  const handleTopicToggle = (topicId: string, selected: boolean) => {
    const newSet = new Set(config.selectedTopics);
    if (selected) newSet.add(topicId); else newSet.delete(topicId);
    setConfig({ ...config, selectedTopics: newSet });
  };

  const handleSectionToggle = (sectionId: string, selected: boolean) => {
    const newSet = new Set(config.selectedSections);
    if (selected) newSet.add(sectionId); else newSet.delete(sectionId);
    setConfig({ ...config, selectedSections: newSet });
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const result = await examsApi.generate({
        title: config.name || `Экзамен ${config.classId} класс`,
        textbook_id: selectedTextbookId || undefined,
        skill_ids: config.sourceType === "topics" ? Array.from(config.selectedTopics) : [],
        paragraph_ids: config.sourceType === "textbook" ? Array.from(config.selectedSections) : [],
        tasks_count: config.questionsCount,
        time_minutes: config.duration,
        variants_count: generateVariants ? config.variantsCount : 1,
        shuffle_tasks: config.shuffleQuestions,
        shuffle_options: config.shuffleAnswers,
        generate_variants: generateVariants,
        mc_mode: "auto",
      });
      // Redirect to draft page for preview/edit
      const examId = result.exam_id || result.access_code;
      router.push(`/teacher/exams/${examId}/draft`);
    } catch (err: any) {
      console.error("Exam generation failed:", err);
      alert(err.message || "Ошибка генерации экзамена");
    } finally {
      setIsGenerating(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1: return config.name.trim() && config.classId;
      case 2:
        if (config.sourceType === "topics") return config.selectedTopics.size > 0;
        if (config.sourceType === "textbook") return config.selectedSections.size > 0;
        return true;
      case 3: return config.questionsCount > 0 && config.variantsCount > 0;
      case 4: return true;
      default: return false;
    }
  };

  const steps = [
    { num: 1, title: "Основное", icon: FileText },
    { num: 2, title: "Источник", icon: BookOpen },
    { num: 3, title: "Параметры", icon: Settings },
    { num: 4, title: "Проведение", icon: Monitor },
  ];

  return (
    <div className="w-full max-w-[1400px] mx-auto pb-24">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Создать экзамен</h1>
      <p className="text-slate-500 mb-10">Настройте параметры и сгенерируйте варианты</p>

      <div>
          <div className="flex items-center justify-center gap-2 mt-4 mb-10">
            {steps.map((s, i) => (
              <div key={s.num} className="flex items-center">
                <motion.button
                  onClick={() => s.num <= step && setStep(s.num as Step)}
                  disabled={s.num > step}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors duration-200 ${
                    step === s.num ? "bg-primary-500 text-white shadow-lg shadow-primary-500/30 scale-105"
                    : step > s.num ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"
                  } ${s.num <= step ? "cursor-pointer" : "cursor-not-allowed"}`}
                >
                  {step > s.num ? <Check className="w-4 h-4" /> : <s.icon className="w-4 h-4" />}
                  <span className="text-sm font-medium hidden sm:inline">{s.title}</span>
                </motion.button>
                {i < steps.length - 1 && <div className={`w-8 h-0.5 mx-1 transition-colors ${step > s.num ? "bg-green-400" : "bg-slate-200"}`} />}
              </div>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <GlassCard className="p-10 pb-10">
                  <div className="text-center mb-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary-100 flex items-center justify-center">
                      <FileText className="w-8 h-8 text-primary-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-slate-900">Основная информация</h2>
                    <p className="text-slate-500 text-sm">Название, класс и тип работы</p>
                  </div>
                  <div className="space-y-7 max-w-md mx-auto">
                    <Input label="Название" placeholder="Контрольная работа №3: Квадратные уравнения" value={config.name} onChange={(e) => setConfig({ ...config, name: e.target.value })} />
                    <Select label="Класс" placeholder="Выберите класс" options={classes} value={config.classId} onChange={(e) => setConfig({ ...config, classId: e.target.value })} />
                    <Select label="Тип работы" options={examTypes} value={config.type} onChange={(e) => setConfig({ ...config, type: e.target.value as ExamConfig["type"] })} />
                  </div>
                </GlassCard>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <GlassCard className="p-8">
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-purple-100 flex items-center justify-center">
                      <BookOpen className="w-8 h-8 text-purple-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-slate-900">Источник заданий</h2>
                    <p className="text-slate-500 text-sm">Откуда брать задания для экзамена</p>
                  </div>

                  <div className="flex gap-2 p-1 bg-slate-100 rounded-xl mb-6">
                    {[{ id: "topics", label: "🎯 По темам" }, { id: "textbook", label: "📚 По учебнику" }, { id: "custom", label: "✏️ Свои задания" }].map((tab) => (
                      <button key={tab.id} onClick={() => setConfig({ ...config, sourceType: tab.id as SourceType })}
                        className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${config.sourceType === tab.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {config.sourceType === "topics" && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-slate-500">
                          Выбрано навыков: <strong className="text-slate-900">{config.selectedTopics.size}</strong>
                        </span>
                        {config.selectedTopics.size > 0 && (
                          <button
                            onClick={() => setConfig({ ...config, selectedTopics: new Set() })}
                            className="text-sm text-red-500 hover:underline"
                          >
                            Сбросить
                          </button>
                        )}
                      </div>
                      {loadingAPI ? (
                        <div className="flex items-center justify-center py-12 text-slate-400">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mr-3" />
                          Загрузка программы...
                        </div>
                      ) : apiSkillTree.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                          {config.classId ? "Нет тем для этого класса" : "Выберите класс на шаге 1"}
                        </div>
                      ) : (
                        <div className="relative">
                          <div className="max-h-[500px] overflow-y-auto rounded-xl border border-slate-200 p-3 bg-slate-50/50 space-y-2
                            [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full
                            hover:[&::-webkit-scrollbar-thumb]:bg-slate-400">
                            <SkillTreeAccordion
                              nodes={apiSkillTree}
                              selectedTopics={config.selectedTopics}
                              onToggle={handleTopicToggle}
                              onToggleGroup={handleToggleGroup}
                              expandedNodes={expandedNodes}
                              onExpand={handleExpandToggle}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {config.sourceType === "textbook" && (
                    <div>
                      {/* Textbook selection */}
                      {!selectedTextbookId ? (
                        loadingAPI ? (
                          <div className="flex items-center justify-center py-12 text-slate-400">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mr-3" />
                            Загрузка учебников...
                          </div>
                        ) : filteredTextbooks.length === 0 ? (
                          <div className="text-center py-12 text-slate-400">
                            {config.classId ? "Учебники для этого класса ещё не загружены" : "Выберите класс на шаге 1"}
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {filteredTextbooks.map((book) => (
                              <button key={book.textbook_id} onClick={() => setSelectedTextbookId(book.textbook_id)}
                                className="p-4 rounded-xl border-2 border-slate-200 hover:border-primary-400 bg-white text-left transition-all hover:shadow-md">
                                <div className="flex items-start gap-3">
                                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                                    <BookOpen className="w-5 h-5 text-purple-600" />
                                  </div>
                                  <div>
                                    <p className="font-medium text-slate-900 text-sm">{book.title}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">{book.authors.join(", ")}</p>
                                    {book.tasks_extracted > 0 && <p className="text-xs text-primary-500 mt-1">{book.tasks_extracted} заданий</p>}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )
                      ) : (
                        /* TOC tree for selected textbook */
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <button onClick={() => { setSelectedTextbookId(""); setApiTOC([]); setConfig({ ...config, selectedSections: new Set() }); }}
                              className="text-sm text-primary-500 hover:underline flex items-center gap-1">
                              <ArrowLeft className="w-3 h-3" /> К списку учебников
                            </button>
                            <div className="flex items-center gap-3">
                              <span className="text-sm text-slate-500">Выбрано параграфов: <strong className="text-slate-900">{config.selectedSections.size}</strong></span>
                              {config.selectedSections.size > 0 && <button onClick={() => setConfig({ ...config, selectedSections: new Set() })} className="text-sm text-red-500 hover:underline">Сбросить</button>}
                            </div>
                          </div>
                          {loadingAPI ? (
                            <div className="flex items-center justify-center py-8 text-slate-400">
                              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500 mr-3" />
                              Загрузка оглавления...
                            </div>
                          ) : (
                            <div className="max-h-[500px] overflow-y-auto border border-slate-200 rounded-xl p-4 bg-white
                              [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full
                              hover:[&::-webkit-scrollbar-thumb]:bg-slate-400">
                              <TOCTreeView nodes={apiTOC} selectedSections={config.selectedSections} onToggle={handleSectionToggle} depth={0} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {config.sourceType === "custom" && (
                    <div className="text-center py-12">
                      <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
                        <FileText className="w-10 h-10 text-slate-400" />
                      </div>
                      <h3 className="font-medium text-slate-900 mb-2">Свои задания</h3>
                      <p className="text-sm text-slate-500 mb-6">Загрузите файл или добавьте задания вручную</p>
                      <div className="flex gap-3 justify-center flex-wrap">
                        <Button variant="secondary" icon={<Upload className="w-4 h-4" />}>Загрузить файл</Button>
                        <Button variant="secondary" icon={<Plus className="w-4 h-4" />}>Добавить вручную</Button>
                        <Button variant="secondary" icon={<Database className="w-4 h-4" />}>Из банка заданий</Button>
                      </div>
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="space-y-4 max-w-2xl mx-auto">
                  {/* ── Section: Core Parameters ── */}
                  <GlassCard className="p-6">
                    <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-5 flex items-center gap-2">
                      <Settings className="w-4 h-4 text-primary-500" />
                      Основные параметры
                    </h3>

                    <div className="space-y-5">
                      {/* Questions count */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-slate-700">Заданий в варианте</label>
                          <span className="text-lg font-bold text-primary-600">{config.questionsCount}</span>
                        </div>
                        <input type="range" min="5" max="20" value={config.questionsCount}
                          onChange={(e) => setConfig({ ...config, questionsCount: parseInt(e.target.value) })}
                          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary-500" />
                        <div className="flex justify-between text-[10px] text-slate-400 mt-1"><span>5</span><span>10</span><span>15</span><span>20</span></div>
                      </div>

                      {/* Duration */}
                      <div>
                        <label className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          Время на выполнение
                        </label>
                        <div className="flex items-center gap-2 mt-2">
                          {[30, 45, 60, 90].map((mins) => (
                            <button key={mins} onClick={() => setConfig({ ...config, duration: mins })}
                              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                                config.duration === mins
                                  ? "bg-primary-500 text-white shadow-md shadow-primary-500/20"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}>
                              {mins} мин
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </GlassCard>

                  {/* ── Section: Difficulty Distribution ── */}
                  <GlassCard className="p-6">
                    <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-5 flex items-center gap-2">
                      <Target className="w-4 h-4 text-amber-500" />
                      Распределение сложности
                    </h3>

                    <div className="space-y-4">
                      {[
                        { key: "easy", label: "Лёгкие (A)", color: "green", emoji: "🟢" },
                        { key: "medium", label: "Средние (B)", color: "amber", emoji: "🟡" },
                        { key: "hard", label: "Сложные (C)", color: "red", emoji: "🔴" },
                      ].map((level) => {
                        const val = config.difficulty[level.key as keyof typeof config.difficulty];
                        return (
                          <div key={level.key}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-sm text-slate-600 flex items-center gap-1.5">
                                <span className="text-xs">{level.emoji}</span>
                                {level.label}
                              </span>
                              <span className={`text-sm font-bold ${
                                level.color === "green" ? "text-green-600" :
                                level.color === "amber" ? "text-amber-600" : "text-red-600"
                              }`}>{val}%</span>
                            </div>
                            <input type="range" min="0" max="100" value={val}
                              onChange={(e) => {
                                const newVal = parseInt(e.target.value);
                                const others = Object.keys(config.difficulty).filter(k => k !== level.key) as Array<keyof typeof config.difficulty>;
                                const remaining = 100 - newVal;
                                const perOther = Math.floor(remaining / 2);
                                setConfig({ ...config, difficulty: { ...config.difficulty, [level.key]: newVal, [others[0]]: perOther, [others[1]]: remaining - perOther } });
                              }}
                              className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer ${
                                level.color === "green" ? "accent-green-500" :
                                level.color === "amber" ? "accent-amber-500" : "accent-red-500"
                              }`}
                              style={{ background: `linear-gradient(to right, ${
                                level.color === "green" ? "#22c55e" : level.color === "amber" ? "#f59e0b" : "#ef4444"
                              } ${val}%, #e2e8f0 ${val}%)` }}
                            />
                          </div>
                        );
                      })}

                      {/* Visual bar */}
                      <div className="mt-2 h-3 rounded-full overflow-hidden flex shadow-inner">
                        <div className="bg-green-400 transition-all duration-300" style={{ width: `${config.difficulty.easy}%` }} />
                        <div className="bg-amber-400 transition-all duration-300" style={{ width: `${config.difficulty.medium}%` }} />
                        <div className="bg-red-400 transition-all duration-300" style={{ width: `${config.difficulty.hard}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Лёгкие {config.difficulty.easy}%</span>
                        <span>Средние {config.difficulty.medium}%</span>
                        <span>Сложные {config.difficulty.hard}%</span>
                      </div>
                    </div>
                  </GlassCard>

                  {/* ── Section: Additional Options ── */}
                  <GlassCard className="p-6">
                    <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-4 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-slate-400" />
                      Дополнительно
                    </h3>

                    <div className="space-y-3">
                      {[
                        { key: "shuffleQuestions", label: "Перемешивать вопросы", desc: "Случайный порядок заданий для каждого ученика" },
                        { key: "shuffleAnswers", label: "Перемешивать варианты ответов", desc: "Случайный порядок вариантов A/B/C/D" },
                        { key: "showResults", label: "Показать результат ученику", desc: "Ученик увидит оценку сразу после окончания" },
                      ].map((opt) => (
                        <label key={opt.key} className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config[opt.key as keyof ExamConfig] as boolean}
                            onChange={(e) => setConfig({ ...config, [opt.key]: e.target.checked })}
                            className="w-4 h-4 mt-0.5 rounded text-primary-600 focus:ring-primary-500"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-slate-700 block">{opt.label}</span>
                            <span className="text-xs text-slate-400">{opt.desc}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </GlassCard>

                  {/* ── Section: Anti-Cheat ── */}
                  <GlassCard className={`p-6 border-2 transition-all ${generateVariants ? "border-primary-400 bg-primary-50/30" : "border-transparent"}`}>
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        generateVariants ? "bg-primary-100" : "bg-slate-100"
                      }`}>
                        <Shield className={`w-5 h-5 ${generateVariants ? "text-primary-600" : "text-slate-400"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-900">Anti-Cheat режим</h3>
                            <p className="text-xs text-slate-500 mt-0.5">Генерация уникальных вариантов с разными числами в задачах</p>
                          </div>
                          <button
                            onClick={() => setGenerateVariants(!generateVariants)}
                            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                              generateVariants ? "bg-primary-500" : "bg-slate-300"
                            }`}
                          >
                            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                              generateVariants ? "translate-x-[22px]" : "translate-x-0.5"
                            }`} />
                          </button>
                        </div>

                        {/* Variant counter */}
                        <AnimatePresence>
                          {generateVariants && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-200/60">
                                <span className="text-sm text-slate-600">Кол-во вариантов:</span>
                                <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                                  <button onClick={() => setConfig({ ...config, variantsCount: Math.max(2, config.variantsCount - 1) })}
                                    className="w-8 h-8 rounded-lg hover:bg-white hover:shadow-sm flex items-center justify-center transition-all text-slate-600">
                                    <Minus className="w-4 h-4" />
                                  </button>
                                  <span className="w-10 text-center font-bold text-slate-900 text-lg">{config.variantsCount}</span>
                                  <button onClick={() => setConfig({ ...config, variantsCount: Math.min(10, config.variantsCount + 1) })}
                                    className="w-8 h-8 rounded-lg hover:bg-white hover:shadow-sm flex items-center justify-center transition-all text-slate-600">
                                    <Plus className="w-4 h-4" />
                                  </button>
                                </div>
                                <span className="text-xs text-slate-400">Те же задачи, другие числа</span>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <GlassCard className="p-8 sm:p-10">
                  <div className="text-center mb-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-indigo-100 flex items-center justify-center">
                      <Monitor className="w-8 h-8 text-indigo-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-slate-900">Способ проведения</h2>
                    <p className="text-slate-500 text-sm">Как ученики будут проходить экзамен</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto items-stretch">
                    {[
                      { id: "online", emoji: "🖥️", title: "Онлайн", desc: "Ученики проходят на своих устройствах по QR-коду", features: ["Автопроверка", "Результаты сразу", "Антиплагиат"] },
                      { id: "print", emoji: "🖨️", title: "Печать", desc: "PDF-варианты для печати + файл с ответами", features: ["Бланки ответов", "Ключи для учителя", "Критерии"] },
                      { id: "hybrid", emoji: "🔄", title: "Гибрид", desc: "Печатные задания + онлайн ввод ответов", features: ["Офлайн решение", "Быстрая проверка", "Аналитика"] },
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setConfig({ ...config, mode: mode.id as ExamMode })}
                        className={`h-full min-h-[220px] p-5 sm:p-6 rounded-2xl border-2 text-left transition-all flex flex-col ${
                          config.mode === mode.id
                            ? "border-primary-500 bg-primary-50 shadow-sm"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        }`}
                      >
                        <div className="text-3xl mb-3 flex-shrink-0">{mode.emoji}</div>
                        <h3 className="font-semibold text-slate-900 mb-1 flex-shrink-0">{mode.title}</h3>
                        <p className="text-sm text-slate-500 mb-3 leading-snug flex-1">{mode.desc}</p>
                        <ul className="space-y-1 flex-shrink-0">
                          {mode.features.map((f, i) => (
                            <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                              <Check className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                              <span className="break-words">{f}</span>
                            </li>
                          ))}
                        </ul>
                      </button>
                    ))}
                  </div>

                  <div className="mt-8 p-5 sm:p-6 rounded-2xl bg-slate-50 border border-slate-200/80 max-w-4xl mx-auto overflow-hidden">
                    <h3 className="font-medium text-slate-900 mb-4">📋 Итого</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 text-sm">
                      <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Название</p>
                        <p className="font-medium text-slate-900 break-words leading-snug">{config.name || "—"}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Класс</p>
                        <p className="font-medium text-slate-900">{config.classId ? `${config.classId} класс` : "—"}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Тип</p>
                        <p className="font-medium text-slate-900">
                          {config.type === "control" ? "Контрольная работа" : "Быстрая проверка"}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Время</p>
                        <p className="font-medium text-slate-900">{config.duration} мин</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Вариантов</p>
                        <p className="font-medium text-slate-900">{generateVariants ? config.variantsCount : 1}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Заданий в варианте</p>
                        <p className="font-medium text-slate-900">{config.questionsCount}</p>
                      </div>
                      <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Источник</p>
                        <p className="font-medium text-slate-900 break-words leading-snug">
                          {config.sourceType === "topics"
                            ? `По темам (${config.selectedTopics.size} навыков)`
                            : config.sourceType === "textbook"
                              ? `По учебнику (${config.selectedSections.size} параграфов)`
                              : "Свои задания"}
                        </p>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>

          {step <= 4 && (
            <div className="flex justify-between mt-6">
              <Button variant="ghost" onClick={() => step === 1 ? router.push('/teacher/exams') : setStep((step - 1) as Step)} icon={<ArrowLeft className="w-4 h-4" />}>Назад</Button>
              {step < 4 ? (
                <Button onClick={() => setStep((step + 1) as Step)} disabled={!canProceed()} icon={<ArrowRight className="w-4 h-4" />}>Далее</Button>
              ) : (
                <Button onClick={handleGenerate} loading={isGenerating} icon={<Sparkles className="w-4 h-4" />}>{isGenerating ? "Генерация..." : "Сгенерировать экзамен"}</Button>
              )}
            </div>
          )}
      </div>
    </div>
  );
}
