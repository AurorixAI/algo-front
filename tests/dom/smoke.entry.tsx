import React from "react";
import { createRoot } from "react-dom/client";
import { Modal } from "@/components/ui/modal";

(window as any).__ready = true;
const host = document.getElementById("root")!;
createRoot(host).render(<Modal open title="Проверка" onClose={() => {}}><p>внутри</p></Modal>);
