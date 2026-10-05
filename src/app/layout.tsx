import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import { Toaster } from "@/components/ui/toast";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Exaai — Exam creation for Algerian English teachers", template: "%s · Exaai" },
  description:
    "Exaai helps Algerian teachers design structured English exams. The AI generates and proposes; the teacher reviews, edits, replaces and approves.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#0f5132" />
      </head>
      <body className={inter.className}>
        <I18nProvider>{children}</I18nProvider>
        <Toaster />
      </body>
    </html>
  );
}
