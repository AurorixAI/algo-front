// R3 M2: «Добавить ученика в группу» - a transfer is for the money right.
import React from "react";
import { createRoot } from "react-dom/client";
import { AddStudentDrawer } from "@/components/groups/add-student-drawer";
import { useAuthStore } from "@/lib/store";

const w = window as any;
w.__log = [] as string[];
w.mount = (user: Record<string, unknown>) => {
  useAuthStore.setState({ user: { id: "u1", email: "a@b.c", first_name: "A", last_name: "B", full_name: "A B", ...user } as never, isAuthenticated: true });
  createRoot(document.getElementById("root")!).render(
    <AddStudentDrawer open groupId="g2" groupClassLevel={7} existingStudentIds={new Set()} onClose={() => {}} onAdded={(result) => w.__log.push(JSON.stringify(result))} />,
  );
};
