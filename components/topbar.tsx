"use client";

import { Bell, Database, HardDriveUpload, LogOut, Menu, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { signOutAction } from "@/app/login/actions";
import { ROLE_LABELS, type AuthProfile } from "@/lib/auth";
import { useDashboardStore } from "@/lib/store";
import { SECTION_META, type SectionId } from "@/lib/navigation";

export function Topbar({ section, profile, canImport, onImport, onMobileMenu }: { section: SectionId; profile: AuthProfile; canImport: boolean; onImport: () => void; onMobileMenu: () => void }) {
  const data = useDashboardStore((state) => state.data);
  const hydrated = useDashboardStore((state) => state.hydrated);
  const refreshing = useDashboardStore((state) => state.refreshing);
  const loadError = useDashboardStore((state) => state.loadError);
  const meta = SECTION_META[section];
  const last = data.imports[0];
  const dataLabel = !hydrated
    ? "Carregando dados…"
    : refreshing
      ? last ? "Sincronizando dados…" : "Carregando dados…"
      : loadError
        ? last ? "Dados em cache" : "Falha na sincronização"
        : last
          ? `Atualizado ${format(new Date(last.importedAt), "dd MMM, HH:mm", { locale: ptBR })}`
          : "Nenhum dado importado";

  return (
    <header className="topbar">
      <button className="icon-button mobile-only" onClick={onMobileMenu} aria-label="Abrir menu"><Menu size={20} /></button>
      <div className="topbar__title">
        <span>{meta.eyebrow}</span>
        <h1>{meta.title}</h1>
      </div>
      <div className="topbar__actions">
        <div className="data-state" title={loadError || (refreshing ? "Atualizando dados em segundo plano" : "Dados sincronizados no Supabase")}>
          <Database size={16} />
          <span>{dataLabel}</span>
          <i className={hydrated && last ? "status-dot status-dot--ok" : "status-dot"} />
        </div>
        <div className="user-chip" title={profile.email}>
          <ShieldCheck size={15} />
          <span>{ROLE_LABELS[profile.role]}</span>
        </div>
        <button className="icon-button" aria-label="Notificações"><Bell size={19} /><i className="notification-dot" /></button>
        <button className="primary-button primary-button--small" onClick={onImport} disabled={!canImport} title={canImport ? "Importar dados" : "Importação restrita a perfis autorizados"}><HardDriveUpload size={17} />Importar</button>
        <form action={signOutAction}>
          <button className="icon-button" aria-label="Sair" title="Sair"><LogOut size={18} /></button>
        </form>
      </div>
    </header>
  );
}
