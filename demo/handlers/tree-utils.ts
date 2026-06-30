export interface FlatSkillRow {
  id: string;
  level: string;
  name_ru: string;
  parent_id?: string | null;
  class_level_start?: number | null;
  class_level_end?: number | null;
  importance?: number;
  tasks_count?: number;
}

export interface SkillTreeOut {
  id: string;
  level: string;
  name: string;
  name_ru: string;
  parent_id?: string;
  class_level_start?: number;
  class_level_end?: number;
  importance: number;
  tasks_count: number;
  children: SkillTreeOut[];
}

export interface FlatTocRow {
  id: number;
  parent_id?: number | null;
  node_type: string;
  display_number?: string | null;
  display_name: string;
  full_title?: string;
  page_start?: number | null;
  page_end?: number | null;
  sort_order?: number | null;
  mapped_skill_id?: string | null;
  mapped_topic_id?: string | null;
  mapping_confidence?: number;
  tasks_count: number;
}

export interface TocTreeOut {
  id: number;
  parent_id: number | null;
  node_type: string;
  display_number?: string;
  display_name: string;
  full_title?: string;
  page_start?: number;
  page_end?: number;
  sort_order?: number | null;
  mapped_skill_id?: string;
  mapped_topic_id?: string;
  mapping_confidence?: number;
  tasks_count: number;
  children: TocTreeOut[];
}

export function buildSkillTree(flat: FlatSkillRow[], classLevel: number): SkillTreeOut[] {
  const nodes: SkillTreeOut[] = flat.map((r) => ({
    id: r.id,
    level: r.level,
    name: r.name_ru,
    name_ru: r.name_ru,
    parent_id: r.parent_id ?? undefined,
    class_level_start: r.class_level_start ?? undefined,
    class_level_end: r.class_level_end ?? undefined,
    importance: r.importance ?? 5,
    tasks_count: r.tasks_count ?? 0,
    children: [],
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const roots: SkillTreeOut[] = [];
  for (const node of nodes) {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const prefix = `G${classLevel}_`;
  const hasGrade = roots.some((r) => r.level === "L1" && r.id.startsWith(prefix));
  if (hasGrade) {
    return roots.filter((r) => r.level !== "L1" || r.id.startsWith(prefix));
  }
  return roots;
}

export function buildTocTree(flat: FlatTocRow[]): TocTreeOut[] {
  const nodes: TocTreeOut[] = flat.map((r) => ({
    id: r.id,
    parent_id: r.parent_id ?? null,
    node_type: r.node_type,
    display_number: r.display_number ?? undefined,
    display_name: r.display_name,
    full_title: r.full_title,
    page_start: r.page_start ?? undefined,
    page_end: r.page_end ?? undefined,
    sort_order: r.sort_order ?? 0,
    mapped_skill_id: r.mapped_skill_id ?? undefined,
    mapped_topic_id: r.mapped_topic_id ?? undefined,
    mapping_confidence: r.mapping_confidence,
    tasks_count: r.tasks_count ?? 0,
    children: [],
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const roots: TocTreeOut[] = [];
  for (const node of nodes) {
    if (node.parent_id != null && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
