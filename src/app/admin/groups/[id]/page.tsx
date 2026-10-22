"use client";

import { GroupDetailView } from "@/components/groups/group-detail-view";

/** The page of a group of the admin workspace: the shared view (IA audit F9). */
export default function AdminGroupDetailPage() {
  return <GroupDetailView workspace="admin" />;
}
