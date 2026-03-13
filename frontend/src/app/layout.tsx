import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Smart Money — NAS100 Execution Panel",
  description: "Institutional NAS100 Smart Money auto-trading dashboard",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
