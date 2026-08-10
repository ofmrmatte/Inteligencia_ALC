"use client";

import type { ReactNode } from "react";
import { useState, useSyncExternalStore } from "react";
import { AppTopbar } from "@/components/layout/app-topbar";
import { ContentContainer } from "@/components/layout/content-container";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import type { Profile } from "@/lib/auth/types";
import { cn } from "@/lib/utils/cn";

type AppShellProps = {
  profile: Profile | null;
  children: ReactNode;
};

const SIDEBAR_STORAGE_KEY = "inteligencia-loss-sidebar-collapsed";
const SIDEBAR_STORAGE_EVENT = "inteligencia-loss-sidebar-storage";

function readSidebarCollapsed() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
}

function subscribeSidebarCollapsed(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(SIDEBAR_STORAGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(SIDEBAR_STORAGE_EVENT, callback);
  };
}

export function AppShell({ profile, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeSidebarCollapsed, readSidebarCollapsed, () => false);

  function toggleCollapsed() {
    const next = !readSidebarCollapsed();
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
    window.dispatchEvent(new Event(SIDEBAR_STORAGE_EVENT));
  }

  return (
    <div className={cn("app-shell", collapsed && "app-shell--collapsed")}>
      <div className="app-shell__desktop-sidebar">
        <AppSidebar profile={profile} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </div>

      <div className={cn("mobile-drawer", mobileOpen && "mobile-drawer--open")}>
        <button
          className="mobile-drawer__scrim"
          type="button"
          aria-label="Fechar menu"
          onClick={() => setMobileOpen(false)}
        />
        <div className="mobile-drawer__panel">
          <AppSidebar profile={profile} onNavigate={() => setMobileOpen(false)} />
        </div>
      </div>

      <div className="app-shell__body">
        <AppTopbar onOpenMenu={() => setMobileOpen(true)} />
        <ContentContainer>{children}</ContentContainer>
      </div>
    </div>
  );
}
