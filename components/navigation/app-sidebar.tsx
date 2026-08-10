"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { OperationalAlertsButton } from "@/features/operational-alerts/components/operational-alerts-button";
import { BRAND } from "@/lib/constants/brand";
import { adminRoutes, dashboardRoutes } from "@/lib/constants/routes";
import type { Profile } from "@/lib/auth/types";
import { isAdminProfile } from "@/lib/permissions/is-admin-profile";
import { cn } from "@/lib/utils/cn";

type AppSidebarProps = {
  profile: Profile | null;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
};

function NavItem({ href, label, Icon, collapsed, onNavigate }: { href: string; label: string; Icon: LucideIcon; collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link href={href} prefetch className={cn("sidebar-nav__item", active && "sidebar-nav__item--active")} onClick={onNavigate} title={collapsed ? label : undefined} aria-label={label}>
      <Icon size={18} aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}

export function AppSidebar({ profile, collapsed, onToggleCollapsed, onNavigate }: AppSidebarProps) {
  const isAdmin = isAdminProfile(profile);

  return (
    <aside className={cn("app-sidebar", collapsed && "app-sidebar--collapsed")} aria-label="Navegação principal">
      <div className="app-sidebar__brand">
        <Image className="app-sidebar__symbol app-sidebar__symbol--light" src={BRAND.assets.symbolLight} alt="ALC" width={34} height={34} priority />
        <Image className="app-sidebar__symbol app-sidebar__symbol--dark" src={BRAND.assets.symbolDark} alt="" width={34} height={34} aria-hidden="true" />
        <div>
          <strong>Admin Center</strong>
          <span>Painel operacional</span>
        </div>
      </div>

      {onToggleCollapsed ? (
        <button type="button" className="icon-button app-sidebar__collapse" onClick={onToggleCollapsed} aria-label={collapsed ? "Expandir menu" : "Recolher menu"}>
          {collapsed ? <PanelLeftOpen size={15} aria-hidden="true" /> : <PanelLeftClose size={15} aria-hidden="true" />}
        </button>
      ) : null}

      <nav className="sidebar-nav">
        <span className="sidebar-nav__group">Operação</span>
        {dashboardRoutes.map((item) => (
          <NavItem key={item.href} href={item.href} label={item.label} Icon={item.icon} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
        {isAdmin ? <span className="sidebar-nav__group">Admin</span> : null}
        {isAdmin ? adminRoutes.map((item) => (
          <NavItem key={item.href} href={item.href} label={item.label} Icon={item.icon} collapsed={collapsed} onNavigate={onNavigate} />
        )) : null}
      </nav>

      <div className="app-sidebar__bottom">
        <div className="app-sidebar__utility-row" aria-label="Preferências e alertas">
          <OperationalAlertsButton />
          <ThemeToggle />
        </div>
        <UserMenu profile={profile} />
      </div>
    </aside>
  );
}
