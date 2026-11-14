// The staff invite page (/invite/<code>) in a real DOM.
import React from "react";
import { createRoot } from "react-dom/client";
import InviteAcceptPage from "@/app/invite/[code]/page";

const w = window as any;
w.mountInvite = (code: string) => {
  w.__params = { code };
  createRoot(document.getElementById("root")!).render(<InviteAcceptPage />);
};
