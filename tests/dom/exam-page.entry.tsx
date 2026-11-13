// The public page of an exam (/e/<code>) in a real DOM: the REAL page, the server answered by the test through `route`.
import React from "react";
import { createRoot } from "react-dom/client";
import ExamPage from "@/app/e/[code]/page";

const w = window as any;
w.mountExam = (code: string) => {
  w.__params = { code };
  createRoot(document.getElementById("root")!).render(<ExamPage />);
};
