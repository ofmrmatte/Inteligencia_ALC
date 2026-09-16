"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, HardDriveUpload } from "lucide-react";
import { Brand } from "@/components/brand";
import { canAccessSection } from "@/lib/access-control";
import type { AuthProfile } from "@/lib/auth";
import { NAVIGATION, type SectionId } from "@/lib/navigation";

export function Sidebar({
  active,
  collapsed,
  onToggle,
  onImport,
  canImport,
  profile,
}: {
  active: SectionId;
  collapsed: boolean;
  onToggle: () => void;
  onImport: () => void;
  canImport: boolean;
  profile: AuthProfile;
}) {
  const groups = ["Análises", "Controle de dados", "Administração"] as const;
  const visibleNavigation = NAVIGATION.filter((item) => canAccessSection(profile, item.id));

  return (
    <aside className={collapsed ? "sidebar sidebar--collapsed" : "sidebar"}>
      <div className="sidebar__brand"><Brand compact={collapsed} /></div>
      <nav className="sidebar__nav" aria-label="Navegação principal">
        {groups.map((group) => {
          const groupItems = visibleNavigation.filter((item) => item.group === group && !item.parentId);
          if (!groupItems.length) return null;

          return (
            <div className="sidebar__group" key={group}>
              {!collapsed && <p>{group}</p>}
              {groupItems.map((item) => {
                const Icon = item.icon;
                const children = visibleNavigation.filter((child) => child.parentId === item.id);
                const childActive = children.some((child) => child.id === active);
                const itemClass = item.id === active
                  ? "sidebar__item is-active"
                  : childActive
                    ? "sidebar__item is-parent-active"
                    : "sidebar__item";

                return (
                  <div className="sidebar__branch" key={item.id}>
                    <Link className={itemClass} href={item.href} title={collapsed ? item.label : undefined}>
                      <Icon size={19} strokeWidth={1.9} />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>

                    {!collapsed && children.length ? (
                      <div className="sidebar__subnav" aria-label={`Subcategorias de ${item.label}`}>
                        {children.map((child) => {
                          const ChildIcon = child.icon;
                          return (
                            <Link
                              className={child.id === active ? "sidebar__subitem is-active" : "sidebar__subitem"}
                              href={child.href}
                              key={child.id}
                            >
                              <ChildIcon size={14} strokeWidth={1.9} />
                              <span>{child.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div className="sidebar__footer">
        {canImport ? (
          <button className="sidebar__import" onClick={onImport} title="Importar planilhas">
            <HardDriveUpload size={19} />
            {!collapsed && <span>Importar dados</span>}
          </button>
        ) : null}
        <button className="sidebar__collapse" onClick={onToggle} aria-label={collapsed ? "Expandir menu" : "Recolher menu"}>
          {collapsed ? <ChevronRight size={18} /> : <><ChevronLeft size={18} /><span>Recolher menu</span></>}
        </button>
      </div>
    </aside>
  );
}
