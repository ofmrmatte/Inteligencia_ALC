import type { Metadata } from "next";
import { Manrope, Sora } from "next/font/google";
import type { ReactNode } from "react";
import { ThemeScript } from "@/components/layout/theme-script";
import { BRAND } from "@/lib/constants/brand";
import "./globals.css";
import "./ui-refresh.css";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

const sora = Sora({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sora",
});

export const metadata: Metadata = {
  title: {
    default: BRAND.productName,
    template: `%s | ${BRAND.productName}`,
  },
  description: BRAND.description,
  icons: {
    icon: BRAND.assets.favicon,
    shortcut: BRAND.assets.favicon,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={`${manrope.variable} ${sora.variable}`}>{children}</body>
    </html>
  );
}
