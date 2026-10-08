import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ALC Atendimento",
  description: "Atendimento e acompanhamento de PNRs da ALC",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
