import type { Metadata, Viewport } from "next";
import { Inter, Noto_Serif } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });
const notoSerif = Noto_Serif({ subsets: ["latin", "cyrillic"], variable: "--font-math", style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: "ALGO - Диагностическая платформа",
  description: "Адаптивная диагностика и обучение математике на основе IRT",
  icons: {
    icon: "/favicon.ico",
  },
};

/**
 * `viewport-fit=cover` lets the page use the whole screen of a notched phone, and only then `env(safe-area-inset-*)` has a
 * value: every layer that touches an edge (the bottom bar, the toast column, dialogs and sheets, the menu rail) keeps that
 * much clear.  Without it iOS answers 0 and the home indicator / the notch sit on top of the controls.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className={`${inter.variable} ${notoSerif.variable} ${inter.className} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
