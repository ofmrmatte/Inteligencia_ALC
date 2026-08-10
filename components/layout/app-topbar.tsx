"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { GlobalSearch } from "@/features/global-search/components/global-search";
import { OperationalAlertsButton } from "@/features/operational-alerts/components/operational-alerts-button";
import type { Profile } from "@/lib/auth/types";

const titles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/pre-fatura": "Pré-Fatura",
  "/gestao-pacotes": "Gestão de Pacotes",
  "/desvios-pnr": "Desvios PNR",
  "/pacotes-faltantes": "Pacotes Faltantes",
  "/configuracoes": "Configurações",
};

export function AppTopbar({ profile, onOpenMenu }: { profile: Profile | null; onOpenMenu: () => void }) {
  const pathname = usePathname();
  const title = titles[pathname] || "ALC Admin Center";

  return (
    <header className="app-topbar">
      <button type="button" className="icon-button app-topbar__menu" onClick={onOpenMenu} aria-label="Abrir menu">
        <Menu size={20} aria-hidden="true" />
      </button>
      <div>
        <span>Módulo</span>
        <strong>{title}</strong>
      </div>
      <GlobalSearch />
      <div className="app-topbar__actions">
        <OperationalAlertsButton />
        <ThemeToggle />
        <UserMenu profile={profile} />
      </div>
    </header>
  );
}
