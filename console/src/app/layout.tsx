import type { Metadata, Viewport } from "next";
// The platform's own base styles (Tailwind layers, the Inter font, the shared controls' CSS): one look for the cabinets and the console.
import "../../../src/app/globals.css";

export const metadata: Metadata = {
  title: "Консоль ALGO",
  description: "Управление платформой ALGO",
  // An internal tool: never in a search index.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
