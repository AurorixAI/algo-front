"use client";

import { GroupsListView } from "@/components/groups/groups-list-view";

/** The list of groups of the owner workspace: the shared view (IA audit F9). */
export default function OwnerGroupsPage() {
  return <GroupsListView workspace="owner" />;
}
