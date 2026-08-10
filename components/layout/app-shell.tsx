"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { AppTopbar } from "@/components/layout/app-topbar";
import { ContentContainer } from "@/components/layout/content-container";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import type { Profile } from "@/lib/auth/types";
import { cn } from "@/lib/utils/cn";

type AppShellProps = {
  profile: Profile | null;
  children: ReactNode;
};

export function AppShell({ profile, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell">
      <div className="app-shell__desktop-sidebar">
        <AppSidebar profile={profile} />
      </div>
      <div className={cn("mobile-drawer", mobileOpen && "mobile-drawer--open")}>
        <button className="mobile-drawer__scrim" type="button" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />
        <div className="mobile-drawer__panel">
          <AppSidebar profile={profile} onNavigate={() => setMobileOpen(false)} />
        </div>
      </div>
      <div className="app-shell__body">
        <AppTopbar profile={profile} onOpenMenu={() => setMobileOpen(true)} />
        <ContentContainer>{children}</ContentContainer>
      </div>
    </div>
  );
}
