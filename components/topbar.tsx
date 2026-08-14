"use client";

import { Bell, Database, HardDriveUpload, Menu } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useDashboardStore } from "@/lib/store";
import { SECTION_META, type SectionId } from "@/lib/navigation";

export function Topbar({ section, onImport, onMobileMenu }: { section: SectionId; onImport: () => void; onMobileMenu: () => void }) {
  const data = useDashboardStore((state) => state.data);
  const meta = SECTION_META[section];
  const last = data.imports[0];
  return (
    <header className="topbar">
      <button className="icon-button mobile-only" onClick={onMobileMenu} aria-label="Abrir menu"><Menu size={20} /></button>
      <div className="topbar__title">
        <span>{meta.eyebrow}</span>
        <h1>{meta.title}</h1>
      </div>
      <div className="topbar__actions">
        <div className="data-state" title="Dados processados localmente no navegador">
          <Database size={16} />
          <span>{last ? `Atualizado ${format(new Date(last.importedAt), "dd MMM, HH:mm", { locale: ptBR })}` : "Nenhum dado importado"}</span>
          <i className={last ? "status-dot status-dot--ok" : "status-dot"} />
        </div>
        <button className="icon-button" aria-label="Notificações"><Bell size={19} /><i className="notification-dot" /></button>
        <button className="primary-button primary-button--small" onClick={onImport}><HardDriveUpload size={17} />Importar</button>
      </div>
    </header>
  );
}
