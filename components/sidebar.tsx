"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, HardDriveUpload } from "lucide-react";
import { Brand } from "@/components/brand";
import { NAVIGATION, type SectionId } from "@/lib/navigation";

export function Sidebar({
  active,
  collapsed,
  onToggle,
  onImport,
  canImport,
}: {
  active: SectionId;
  collapsed: boolean;
  onToggle: () => void;
  onImport: () => void;
  canImport: boolean;
}) {
  const groups = ["Análises", "Controle de dados"] as const;
  return (
    <aside className={collapsed ? "sidebar sidebar--collapsed" : "sidebar"}>
      <div className="sidebar__brand"><Brand compact={collapsed} /></div>
      <nav className="sidebar__nav" aria-label="Navegação principal">
        {groups.map((group) => (
          <div className="sidebar__group" key={group}>
            {!collapsed && <p>{group}</p>}
            {NAVIGATION.filter((item) => item.group === group).map((item) => {
              const Icon = item.icon;
              return (
                <Link className={item.id === active ? "sidebar__item is-active" : "sidebar__item"} href={item.href} key={item.id} title={collapsed ? item.label : undefined}>
                  <Icon size={19} strokeWidth={1.9} />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="sidebar__footer">
        <button className="sidebar__import" onClick={onImport} disabled={!canImport} title={canImport ? "Importar planilhas" : "Importação restrita a Diretor/ADM"}>
          <HardDriveUpload size={19} />
          {!collapsed && <span>Importar dados</span>}
        </button>
        <button className="sidebar__collapse" onClick={onToggle} aria-label={collapsed ? "Expandir menu" : "Recolher menu"}>
          {collapsed ? <ChevronRight size={18} /> : <><ChevronLeft size={18} /><span>Recolher menu</span></>}
        </button>
      </div>
    </aside>
  );
}
