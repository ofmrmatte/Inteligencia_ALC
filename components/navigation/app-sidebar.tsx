"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { BRAND } from "@/lib/constants/brand";
import { adminRoutes, dashboardRoutes } from "@/lib/constants/routes";
import type { Profile } from "@/lib/auth/types";
import { isAdminProfile } from "@/lib/permissions/is-admin-profile";
import { cn } from "@/lib/utils/cn";

type AppSidebarProps = {
  profile: Profile | null;
  onNavigate?: () => void;
};

function NavItem({ href, label, Icon, onNavigate }: { href: string; label: string; Icon: LucideIcon; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link href={href} prefetch className={cn("sidebar-nav__item", active && "sidebar-nav__item--active")} onClick={onNavigate}>
      <Icon size={18} aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}

export function AppSidebar({ profile, onNavigate }: AppSidebarProps) {
  const isAdmin = isAdminProfile(profile);
  const initials = (profile?.name || profile?.email || "ALC").slice(0, 2).toUpperCase();

  return (
    <aside className="app-sidebar" aria-label="Navegacao principal">
      <div className="app-sidebar__brand">
        <Image src={BRAND.assets.symbolDark} alt="ALC" width={38} height={38} priority />
        <div>
          <strong>Admin Center</strong>
          <span>Painel operacional</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {dashboardRoutes.map((item) => (
          <NavItem key={item.href} href={item.href} label={item.label} Icon={item.icon} onNavigate={onNavigate} />
        ))}
        {isAdmin
          ? adminRoutes.map((item) => (
              <NavItem key={item.href} href={item.href} label={item.label} Icon={item.icon} onNavigate={onNavigate} />
            ))
          : null}
      </nav>

      <div className="app-sidebar__footer">
        <div className="user-avatar" aria-hidden="true">
          {initials}
        </div>
        <div>
          <strong>{profile?.name || "Usuario ALC"}</strong>
          <span>{profile?.setor || profile?.cargo || "Operacao"}</span>
        </div>
      </div>
    </aside>
  );
}
