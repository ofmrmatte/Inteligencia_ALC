"use client";

import { PanelLeftOpen } from "lucide-react";
import { usePathname } from "next/navigation";
import { GlobalSearch } from "@/features/global-search/components/global-search";
import { BRAND } from "@/lib/constants/brand";

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
  const title = titles[pathname] || BRAND.productName;

  return (
    <header className="app-topbar">
      <button
        type="button"
        className="icon-button app-topbar__mobile-nav-trigger"
        onClick={onOpenMenu}
        aria-label="Abrir navegação"
      >
        <PanelLeftOpen size={18} aria-hidden="true" />
      </button>

      <div className="app-topbar__context" aria-label="Localização atual">
        <span>Inteligência ALC</span>
        <strong className="app-topbar__context-title">{title}</strong>
      </div>

      <GlobalSearch />
    </header>
  );
}
