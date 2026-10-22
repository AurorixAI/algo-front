"use client";

import { GroupsListView } from "@/components/groups/groups-list-view";

/** The list of groups of the admin workspace: the shared view (IA audit F9). */
export default function AdminGroupsPage() {
  return <GroupsListView workspace="admin" />;
}
