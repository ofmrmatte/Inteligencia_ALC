"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { GlobalSearch } from "@/features/global-search/components/global-search";

const titles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/pre-fatura": "Pré-Fatura",
  "/gestao-pacotes": "Gestão de Pacotes",
  "/desvios-pnr": "Desvios PNR",
  "/pacotes-faltantes": "Pacotes Faltantes",
  "/perfil": "Perfil",
  "/configuracoes": "Configurações",
};

export function AppTopbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname();
  const title = titles[pathname] || "Inteligência LOSS";

  return (
    <header className="app-topbar">
      <button type="button" className="icon-button app-topbar__menu" onClick={onOpenMenu} aria-label="Abrir menu">
        <Menu size={19} aria-hidden="true" />
      </button>

      <div className="app-topbar__context" aria-label="Localização atual">
        <span>Inteligência LOSS</span>
        <strong className="app-topbar__context-title">{title}</strong>
      </div>

      <GlobalSearch />
    </header>
  );
}
