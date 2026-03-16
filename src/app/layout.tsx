import type { Metadata } from "next";
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
