// The public page of a diagnostic (/d/<code>) in a real DOM: the REAL page, the server answered by the test through `route`.
import React from "react";
import { createRoot } from "react-dom/client";
import DiagnosticPage from "@/app/d/[code]/page";

const w = window as any;
w.mountDiag = (code: string) => {
  createRoot(document.getElementById("root")!).render(<DiagnosticPage params={{ code }} />);
};
