// The login page (/login) in a real DOM.
import React from "react";
import { createRoot } from "react-dom/client";
import LoginPage from "@/app/login/page";

(window as any).mountLogin = () => {
  createRoot(document.getElementById("root")!).render(<LoginPage />);
};
