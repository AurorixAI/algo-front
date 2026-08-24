export interface DistractorMeta {
  value: string;
  value_latex?: string | null;
  error_type: string;
  explanation: string;
  error_logic?: string | null;
  error_logic_latex?: string | null;
  plausibility: number;
}

export interface DemoTask {
  task_id: string;
  skill_id: string;
  skill_name: string;
  topic_id: string;
  paragraph_id?: number | string;
  class_level: number;
  difficulty: "A" | "B" | "C";
  question_text: string;
  question_latex: string | null;
  answer_type: string;
  correct_answer: string;
  answer_options: string[];
  distractor_meta: DistractorMeta[];
}

export interface DemoStudent {
  id: string;
  first_name: string;
  last_name: string;
  class_level: number;
  status: string;
}

export interface DiagnosticInvite {
  id: string;
  code: string;
  student_id: string;
  student_name: string;
  student_first_name: string;
  student_last_name: string;
  class_level: number;
  diagnostic_type: string;
  status: string;
  org_id: string;
  org_name: string;
  expires_at: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  cat_session_id?: string | null;
  result?: {
    theta: number;
    accuracy: number;
    recommended_level: string;
    total_questions: number;
    correct_answers: number;
  } | null;
}

export interface DiagSessionState {
  session_id: string;
  student_id: string;
  grade_level: number;
  invite_code?: string;
  theta: number;
  se: number;
  phase: "warmup" | "navigation" | "deep_scan";
  items_answered: number;
  items_max: number;
  correct_count: number;
  used_task_ids: string[];
  weak_skills: string[];
  deep_scan_remaining: number;
  answers: Array<{
    task_id: string;
    student_answer: string;
    is_correct: boolean;
    eval_category: string;
    distractor_hit?: DistractorMeta | null;
    time_ms?: number;
  }>;
  completed: boolean;
}

export interface ExamDraft {
  exam_id: string;
  title: string;
  status: "draft" | "variants_ready" | "active" | "closed";
  access_code: string | null;
  total_time_minutes: number;
  variants_count: number;
  tasks_per_variant: number;
  settings: Record<string, unknown>;
  skills_covered: string[];
  created_at: string;
  variants: ExamVariant[];
}

export interface ExamVariant {
  variant_id: string;
  variant_number: number;
  total_points: number;
  tasks: ExamDraftTask[];
}

export interface ExamDraftTask {
  task_id: string;
  skill_id: string;
  skill_name: string;
  difficulty: string;
  question_text: string;
  question_latex: string | null;
  question_image_url: string | null;
  answer_type: string;
  correct_answer: string;
  answer_options: string[] | null;
  distractor_meta: DistractorMeta[] | null;
  is_template_generated: boolean;
}

export interface ExamSession {
  session_id: string;
  exam_id: string;
  access_code: string;
  student_name: string;
  class_level: number;
  variant_number: number;
  status: "in_progress" | "submitted";
  tasks: Array<{
    task_id: string;
    skill_id: string;
    skill_name: string;
    difficulty: string;
    text: string;
    options: string[];
    image_url: string | null;
    answer_type: string;
    points: number;
    correct_answer: string;
    distractor_meta: DistractorMeta[] | null;
  }>;
  answers: Record<string, string>;
  score: number;
  max_score: number;
  correct_count: number;
  time_spent_seconds: number;
  started_at: string;
  submitted_at: string | null;
  distractor_analytics: Array<{
    task_id: string;
    distractor_value: string;
    error_type: string;
    explanation: string;
  }>;
}

export interface SkillTreeNode {
  id: string;
  name: string;
  level: number;
  children?: SkillTreeNode[];
}

export interface TextbookBrief {
  textbook_id: string;
  title: string;
  class_level: number;
  country: string;
  status: string;
  publisher?: string;
}

export interface TOCNode {
  structure_id: number;
  title: string;
  level: number;
  children?: TOCNode[];
}

export interface DemoRequest {
  method: string;
  path: string;
  searchParams: URLSearchParams;
  body: unknown;
  cookies: Record<string, string>;
}

export interface DemoResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}
