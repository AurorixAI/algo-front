"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import {
  textbookApi,
  examsApi,
  orgApi,
  type TextbookBrief,
  type TOCNode,
  type SkillTreeNode,
  type Group,
} from "@/lib/api";
import { useAuthStore } from "@/lib/store";
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
  Users,
  Globe,
  Printer,
  QrCode,
  GraduationCap,
  ListOrdered,
  FileCheck2,
  Shuffle,
} from "lucide-react";

type Step = 1 | 2 | 3 | 4 | 5;
type SourceType = "topics" | "textbook" | "custom";
type ExamMode = "online" | "print" | "hybrid";

interface ExamConfig {
  name: string;
  classId: string;
  groupId?: string;
  groupName?: string;
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

// ─── Recursive TOC helper ───
function collectTOCLeafIds(node: TOCNode): string[] {
  if (!node.children?.length) return [String(node.id)];
  return node.children.flatMap(collectTOCLeafIds);
}

// ─── Recursive TOC renderer (textbook structure from API) ───
function TOCTreeView({
  nodes,
  selectedSections,
  onToggle,
  onToggleGroup,
  depth = 0,
}: {
  nodes: TOCNode[];
  selectedSections: Set<string>;
  onToggle: (id: string, selected: boolean) => void;
  onToggleGroup: (ids: string[], selected: boolean) => void;
  depth?: number;
}) {
  if (!nodes?.length) return null;
  return (
    <div className={depth > 0 ? "ml-4 border-l border-slate-100 pl-3 space-y-1 mt-1" : "space-y-1"}>
      {nodes.map((node) => {
        const hasChildren = node.children && node.children.length > 0;
        const leafIds = collectTOCLeafIds(node);
        const selectedCount = leafIds.filter((id) => selectedSections.has(id)).length;
        const isAllSelected = selectedCount === leafIds.length && leafIds.length > 0;
        const isPartial = selectedCount > 0 && !isAllSelected;

        const displayName = node.display_name || (node as any).title || "Раздел";
        const displayNumber = node.display_number || (node as any).number;

        return (
          <div key={node.id} className="py-1">
            <div className="flex items-center gap-2.5 group hover:bg-slate-50 p-1.5 rounded-lg transition-colors">
              <input
                type="checkbox"
                checked={isAllSelected}
                ref={(el) => {
                  if (el) el.indeterminate = isPartial;
                }}
                onChange={(e) => {
                  if (hasChildren) {
                    onToggleGroup(leafIds, e.target.checked);
                  } else {
                    onToggle(String(node.id), e.target.checked);
                  }
                }}
                className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 flex-shrink-0 cursor-pointer"
              />
              <span
                className={`text-sm flex-1 ${
                  !hasChildren
                    ? "text-slate-700 font-normal"
                    : "font-semibold text-slate-900"
                } group-hover:text-primary-700 transition-colors`}
              >
                {displayNumber ? `${displayNumber}. ` : ""}
                {displayName}
              </span>
              {node.page_start && (
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md font-mono shrink-0">
                  с. {node.page_start}{node.page_end ? `–${node.page_end}` : ""}
                </span>
              )}
            </div>
            {hasChildren && (
              <TOCTreeView
                nodes={node.children!}
                selectedSections={selectedSections}
                onToggle={onToggle}
                onToggleGroup={onToggleGroup}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function NewExamPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateVariants, setGenerateVariants] = useState(false);

  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  const [config, setConfig] = useState<ExamConfig>({
    name: "",
    classId: "",
    groupId: undefined,
    groupName: undefined,
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

  // Load teacher groups and check searchParams
  useEffect(() => {
    setLoadingGroups(true);
    orgApi.listGroups()
      .then((res) => {
        const loadedGroups = res || [];
        setGroups(loadedGroups);
        const qGroupId = searchParams.get("group_id");
        const qGroupName = searchParams.get("group_name");
        
        let selectedGroup = loadedGroups.find((g) => g.id === qGroupId);
        if (!selectedGroup && loadedGroups.length === 1) {
          selectedGroup = loadedGroups[0];
        }

        if (selectedGroup) {
          setConfig((prev) => ({
            ...prev,
            groupId: selectedGroup.id,
            groupName: selectedGroup.name,
            classId: prev.classId || (selectedGroup.class_level ? String(selectedGroup.class_level) : prev.classId),
          }));
        } else if (qGroupId) {
          setConfig((prev) => ({
            ...prev,
            groupId: qGroupId,
            groupName: qGroupName || undefined,
          }));
        }
      })
      .catch((err) => console.error("Failed to load groups:", err))
      .finally(() => setLoadingGroups(false));
  }, [searchParams]);

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
    if (!selectedTextbookId) {
      setApiTOC([]);
      return;
    }
    setLoadingAPI(true);
    textbookApi.toc(selectedTextbookId)
      .then(setApiTOC)
      .catch(() => setApiTOC([]))
      .finally(() => setLoadingAPI(false));
  }, [selectedTextbookId]);

  const stepperRef = useRef<HTMLDivElement>(null);

  // Smoothly align viewport so the step indicators bar is right at the top of the visible screen
  useEffect(() => {
    const timer = setTimeout(() => {
      if (stepperRef.current) {
        const navbarHeight = 72; // Top navbar height
        const topPadding = 16;
        const elementTop = stepperRef.current.getBoundingClientRect().top;
        const targetScrollY = window.pageYOffset + elementTop - navbarHeight - topPadding;
        
        window.scrollTo({
          top: Math.max(0, targetScrollY),
          behavior: "smooth",
        });
      }
    }, 80);

    return () => clearTimeout(timer);
  }, [step]);

  const groupOptions: SelectOption[] = useMemo(() => {
    return groups.map((g) => ({
      value: g.id,
      label: g.name,
      sublabel: g.students_count ? `${g.students_count} уч.` : (g.class_level ? `${g.class_level} класс` : undefined),
      icon: <Users className="w-4 h-4 text-primary-600 shrink-0" />,
    }));
  }, [groups]);

  const selectedGroup = useMemo(() => {
    return groups.find((g) => g.id === config.groupId);
  }, [groups, config.groupId]);

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
    { value: "control", label: "Контрольная работа", icon: <FileText className="w-4 h-4 text-amber-500 shrink-0" /> },
    { value: "diagnostic", label: "Быстрая проверка (диагностика)", icon: <Target className="w-4 h-4 text-blue-500 shrink-0" /> },
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

  const handleSectionGroupToggle = (ids: string[], selected: boolean) => {
    const newSet = new Set(config.selectedSections);
    ids.forEach((id) => {
      if (selected) newSet.add(id); else newSet.delete(id);
    });
    setConfig({ ...config, selectedSections: newSet });
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const user = useAuthStore.getState().user;
      const teacherName = user ? `${user.first_name || ""} ${user.last_name || ""}`.trim() : undefined;
      const result = await examsApi.generate({
        title: config.name || `Экзамен ${config.classId} класс`,
        textbook_id: selectedTextbookId || undefined,
        skill_ids: config.sourceType === "topics" ? Array.from(config.selectedTopics) : [],
        paragraph_ids: config.sourceType === "textbook" ? Array.from(config.selectedSections).map(Number) : [],
        group_id: config.groupId || undefined,
        group_name: config.groupName || undefined,
        class_level: config.classId ? parseInt(config.classId) : undefined,
        tasks_count: config.questionsCount,
        time_minutes: config.duration,
        variants_count: generateVariants ? config.variantsCount : 1,
        shuffle_tasks: config.shuffleQuestions,
        shuffle_options: config.shuffleAnswers,
        generate_variants: generateVariants,
        mc_mode: "auto",
        teacher_name: teacherName || undefined,
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
      case 1: return Boolean(config.name.trim() && config.classId); // groupId is optional — can save to Library
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
      <p className="text-slate-500 mb-6">Настройте параметры и сгенерируйте варианты</p>

      <div>
          <div ref={stepperRef} className="flex items-center justify-center gap-2 mt-2 mb-8 scroll-mt-24">
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
                    <p className="text-slate-500 text-sm">Название, группа, класс программы и тип работы</p>
                  </div>
                  <div className="space-y-6 max-w-md mx-auto">
                    <Input
                      label="Название экзамена"
                      placeholder="Контрольная работа №3: Квадратные уравнения"
                      value={config.name}
                      onChange={(e) => setConfig({ ...config, name: e.target.value })}
                    />

                    {/* Group Selection using custom Select */}
                    <div className="space-y-1.5">
                      <Select
                        label="Группа — необязательно (можно назначить позже)"
                        placeholder={loadingGroups ? "Загрузка групп..." : (groups.length === 0 ? "Нет доступных групп" : "Выбрать группу или оставить пустым...")}
                        options={groupOptions}
                        value={config.groupId || ""}
                        onChange={(e) => {
                          const gId = e.target.value;
                          const found = groups.find((g) => g.id === gId);
                          setConfig((prev) => ({
                            ...prev,
                            groupId: gId || undefined,
                            groupName: found ? found.name : undefined,
                            classId: prev.classId || (found?.class_level ? String(found.class_level) : prev.classId),
                          }));
                        }}
                      />
                      <p className="text-xs text-slate-500">
                        {config.groupId
                          ? `✅ Экзамен назначен группе «${config.groupName}» — будет опубликован для этой группы.`
                          : "📚 Без группы — экзамен сохранится в вашу Библиотеку и вы сможете назначить его любой группе позже."}
                      </p>
                    </div>

                    <Select
                      label="Учебная программа / Класс"
                      placeholder="Выберите класс для базы заданий"
                      options={classes}
                      value={config.classId}
                      onChange={(e) => setConfig({ ...config, classId: e.target.value })}
                    />
                    <Select
                      label="Тип работы"
                      options={examTypes}
                      value={config.type}
                      onChange={(e) => setConfig({ ...config, type: e.target.value as ExamConfig["type"] })}
                    />
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
                              <TOCTreeView
                                nodes={apiTOC}
                                selectedSections={config.selectedSections}
                                onToggle={handleSectionToggle}
                                onToggleGroup={handleSectionGroupToggle}
                                depth={0}
                              />
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
                <GlassCard className="p-6 sm:p-10">
                  <div className="text-center mb-8">
                    <div className="w-14 h-14 mx-auto mb-3.5 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shadow-xs">
                      <Monitor className="w-7 h-7 text-indigo-600" />
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Способ проведения</h2>
                    <p className="text-slate-500 text-sm mt-1">Выберите формат и проверьте итоговые параметры экзамена</p>
                  </div>

                  {/* Mode Selector Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto items-stretch">
                    {[
                      {
                        id: "online",
                        icon: <Monitor className="w-6 h-6 text-blue-600" />,
                        iconBg: "bg-blue-50/90 text-blue-600",
                        title: "Онлайн",
                        desc: "Ученики проходят на своих устройствах по QR-коду или ссылке",
                        features: ["Автопроверка результатов", "Мгновенная аналитика", "Защита от списывания"],
                      },
                      {
                        id: "print",
                        icon: <Printer className="w-6 h-6 text-slate-700" />,
                        iconBg: "bg-slate-100/90 text-slate-700",
                        title: "Печать",
                        desc: "PDF-варианты для распечатки + отдельный файл с ответами",
                        features: ["Бланки для учеников", "Ключи для учителя", "Критерии оценивания"],
                      },
                      {
                        id: "hybrid",
                        icon: <QrCode className="w-6 h-6 text-indigo-600" />,
                        iconBg: "bg-indigo-50/90 text-indigo-600",
                        title: "Гибрид",
                        desc: "Печатные задания + быстрый ввод ответов через телефон",
                        features: ["Офлайн решение", "Быстрая оцифровка", "Электронная статистика"],
                      },
                    ].map((mode) => {
                      const isSelected = config.mode === mode.id;
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => setConfig({ ...config, mode: mode.id as ExamMode })}
                          className={`relative h-full min-h-[210px] p-5 sm:p-6 rounded-2xl border-2 text-left transition-all duration-200 flex flex-col group ${
                            isSelected
                              ? "border-primary-500 bg-gradient-to-b from-primary-50/60 via-white to-white ring-2 ring-primary-500/20 shadow-md shadow-primary-500/10"
                              : "border-slate-200/80 hover:border-slate-300 bg-white/80 hover:bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-3.5">
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-105 ${mode.iconBg}`}>
                              {mode.icon}
                            </div>
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                              isSelected ? "bg-primary-600 text-white" : "border-2 border-slate-300 group-hover:border-slate-400"
                            }`}>
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                          </div>

                          <h3 className="font-bold text-slate-900 text-base sm:text-lg mb-1">{mode.title}</h3>
                          <p className="text-xs sm:text-sm text-slate-500 mb-3.5 leading-relaxed flex-1">{mode.desc}</p>

                          <div className="pt-3 border-t border-slate-100/90 space-y-1.5">
                            {mode.features.map((f, i) => (
                              <div key={i} className="text-xs text-slate-600 flex items-center gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSelected ? "bg-primary-600" : "bg-slate-300"}`} />
                                <span className="leading-tight">{f}</span>
                              </div>
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Premium Summary Card */}
                  <div className="mt-8 max-w-4xl mx-auto rounded-3xl bg-gradient-to-br from-white via-slate-50/60 to-primary-50/20 border border-slate-200/90 shadow-lg shadow-slate-900/5 overflow-hidden transition-all">
                    {/* Header */}
                    <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-white/70 backdrop-blur-sm">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-primary-100 flex items-center justify-center text-primary-600 shadow-xs">
                          <FileCheck2 className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-sm sm:text-base">Сводка параметров экзамена</h3>
                          <p className="text-xs text-slate-500">Проверьте данные перед созданием</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary-50 text-primary-700 border border-primary-200/80 shadow-xs">
                          {config.mode === "online" && <Monitor className="w-3.5 h-3.5" />}
                          {config.mode === "print" && <Printer className="w-3.5 h-3.5" />}
                          {config.mode === "hybrid" && <QrCode className="w-3.5 h-3.5" />}
                          {config.mode === "online" ? "Онлайн тестирование" : config.mode === "print" ? "Печатный экзамен" : "Гибридный формат"}
                        </span>
                      </div>
                    </div>

                    <div className="p-5 sm:p-6 space-y-4">
                      {/* Top Meta Bar (Title, Group, Class, Type) */}
                      <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-primary-500/20 shrink-0">
                            <FileText className="w-6 h-6" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Экзамен</span>
                              <span className="inline-block w-1 h-1 rounded-full bg-slate-300" />
                              <span className="text-xs font-medium text-slate-500">
                                {config.type === "control" ? "Контрольная работа" : "Быстрая диагностика"}
                              </span>
                            </div>
                            <h4 className="font-bold text-slate-900 text-base sm:text-lg truncate">
                              {config.name || "Без названия"}
                            </h4>
                          </div>
                        </div>

                        {/* Badges / Chips */}
                        <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                          {selectedGroup && (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/90 text-slate-800 text-xs font-medium border border-slate-200/70">
                              <Users className="w-3.5 h-3.5 text-primary-600" />
                              <span className="font-semibold">{selectedGroup.name}</span>
                              {selectedGroup.students_count ? (
                                <span className="text-slate-400 text-[11px]">({selectedGroup.students_count} уч.)</span>
                              ) : null}
                            </div>
                          )}

                          {config.classId && (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/90 text-slate-800 text-xs font-medium border border-slate-200/70">
                              <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
                              <span>{config.classId} класс</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 4 Metric Cards Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                        {/* Time */}
                        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/70 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Время</span>
                            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                              <Clock className="w-3.5 h-3.5" />
                            </div>
                          </div>
                          <div>
                            <div className="font-extrabold text-slate-900 text-lg sm:text-xl">
                              {config.duration} <span className="text-xs font-medium text-slate-500">мин</span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">Лимит времени</div>
                          </div>
                        </div>

                        {/* Variants */}
                        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/70 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Варианты</span>
                            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                              <Layers className="w-3.5 h-3.5" />
                            </div>
                          </div>
                          <div>
                            <div className="font-extrabold text-slate-900 text-lg sm:text-xl">
                              {generateVariants ? config.variantsCount : 1} <span className="text-xs font-medium text-slate-500">вар.</span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {generateVariants ? "Уникальные копии" : "1 вариант"}
                            </div>
                          </div>
                        </div>

                        {/* Questions */}
                        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/70 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Задания</span>
                            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                              <ListOrdered className="w-3.5 h-3.5" />
                            </div>
                          </div>
                          <div>
                            <div className="font-extrabold text-slate-900 text-lg sm:text-xl">
                              {config.questionsCount} <span className="text-xs font-medium text-slate-500">задач</span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">В каждом варианте</div>
                          </div>
                        </div>

                        {/* Source */}
                        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/70 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Источник</span>
                            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                              <BookOpen className="w-3.5 h-3.5" />
                            </div>
                          </div>
                          <div>
                            <div className="font-extrabold text-slate-900 text-base sm:text-lg truncate">
                              {config.sourceType === "topics"
                                ? "По темам"
                                : config.sourceType === "textbook"
                                  ? "Учебник"
                                  : "Свои"}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                              {config.sourceType === "topics"
                                ? `${config.selectedTopics.size} навыков`
                                : config.sourceType === "textbook"
                                  ? `${config.selectedSections.size} параграфов`
                                  : "Кастомные"}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Bottom Options Row */}
                      <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-slate-400 font-medium">Опции:</span>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium ${
                            config.shuffleQuestions ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60" : "bg-slate-100 text-slate-400"
                          }`}>
                            <Shuffle className="w-3 h-3" />
                            Перемешивать задачи: {config.shuffleQuestions ? "Вкл" : "Выкл"}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium ${
                            config.shuffleAnswers ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60" : "bg-slate-100 text-slate-400"
                          }`}>
                            <Shuffle className="w-3 h-3" />
                            Перемешивать ответы: {config.shuffleAnswers ? "Вкл" : "Выкл"}
                          </span>
                        </div>

                        <div className="text-slate-400 text-[11px]">
                          ⚡ Варианты формируются алгоритмом ALGO
                        </div>
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
