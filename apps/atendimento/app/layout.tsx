import type { Metadata, Viewport } from "next";
import { Montserrat, Poppins } from "next/font/google";
import "./globals.css";
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-heading", display: "swap" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body", display: "swap" });
export const metadata: Metadata = {
  title: "ALC Atendimento",
  applicationName: "ALC Atendimento",
  description: "Atendimento e acompanhamento de PNRs da ALC",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "ALC Atendimento", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#e30613" };
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${montserrat.variable} ${poppins.variable}`}>
      <body>{children}</body>
    </html>
  );
}
