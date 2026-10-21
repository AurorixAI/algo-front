import { useEffect, useState } from "react";
import { orgApi } from "./api";

export interface DirectoryTeacher { id: string; first_name: string; last_name: string; full_name?: string }
export interface DirectoryGroup { id: string; name: string; teacher_id: string }

/** The teacher → group directory of the cascading filter; without it the screen still works (the filter stays empty). */
export function usePaymentsDirectory(): { teachers: DirectoryTeacher[]; groups: DirectoryGroup[] } {
  const [teachers, setTeachers] = useState<DirectoryTeacher[]>([]);
  const [groups, setGroups] = useState<DirectoryGroup[]>([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([orgApi.listMembers(), orgApi.listGroups()])
      .then(([members, groupList]) => {
        if (cancelled) return;
        setTeachers(
          (Array.isArray(members) ? members : [])
            .filter((m: any) => m.org_role === "teacher")
            .map((m: any) => ({
              id: m.user_id || m.id,
              first_name: m.first_name ?? "",
              last_name: m.last_name ?? "",
              full_name: m.full_name,
            })),
        );
        const list: any[] = Array.isArray(groupList) ? groupList : (groupList as any)?.items || [];
        setGroups(list.map((g) => ({ id: g.id, name: g.name, teacher_id: g.teacher_id })));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  return { teachers, groups };
}
