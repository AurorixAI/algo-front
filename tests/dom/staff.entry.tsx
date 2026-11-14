// The staff page of the owner (/owner/teachers) in a real DOM - the REAL page, the server answered by the test.
import React from "react";
import { createRoot } from "react-dom/client";
import OwnerTeachersPage from "@/app/owner/teachers/page";
import { useAuthStore } from "@/lib/store";

const w = window as any;
w.mountStaff = (user: Record<string, unknown> = { role: "owner", org_role: "owner" }) => {
  useAuthStore.setState({ user: { id: "u1", email: "a@b.c", first_name: "A", last_name: "B", full_name: "A B", ...user } as never, isAuthenticated: true });
  createRoot(document.getElementById("root")!).render(<OwnerTeachersPage />);
};
