import type { Metadata } from "next";
import { Montserrat, Poppins } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-heading", display: "swap" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "Inteligência ALC",
  applicationName: "Inteligência ALC",
  description: "Painel de inteligência operacional, pré-faturamento e risco logístico.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Inteligência ALC",
    statusBarStyle: "default",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${montserrat.variable} ${poppins.variable}`}>
      <body>
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
