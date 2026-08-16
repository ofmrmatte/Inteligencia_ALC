"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { EmptyDashboard } from "@/components/empty-dashboard";
import { GlobalFilters } from "@/components/global-filters";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { canAccessOperationalData } from "@/lib/access-control";
import { canManageImports, type AuthProfile } from "@/lib/auth";
import { ViewRouter } from "@/components/views/view-router";
import { SECTION_META, type SectionId } from "@/lib/navigation";
import { useDashboardStore } from "@/lib/store";

const ImportPanel = dynamic(() => import("@/components/import-panel").then((module) => module.ImportPanel), { ssr: false });
const SIDEBAR_KEY = "alc-inteligencia:sidebar-collapsed";
const SIDEBAR_EVENT = "alc-inteligencia:sidebar-change";
const ADMIN_SECTIONS: SectionId[] = ["gestao-motoristas", "configuracoes", "perfil"];

function subscribeSidebarChange(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(SIDEBAR_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(SIDEBAR_EVENT, callback);
  };
}

function getSidebarSnapshot() {
  return window.localStorage.getItem(SIDEBAR_KEY) !== "false";
}

function getServerSidebarSnapshot() {
  return true;
}

export function DashboardApp({ section, profile }: { section: SectionId; profile: AuthProfile }) {
  const hydrate = useDashboardStore((state) => state.hydrate);
  const hydrated = useDashboardStore((state) => state.hydrated);
  const data = useDashboardStore((state) => state.data);
  const collapsed = useSyncExternalStore(subscribeSidebarChange, getSidebarSnapshot, getServerSidebarSnapshot);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const meta = SECTION_META[section];
  const canImport = canManageImports(profile);
  const canLoadOperationalData = canAccessOperationalData(profile);
  const showEmptyState = canLoadOperationalData && data.imports.length === 0 && !ADMIN_SECTIONS.includes(section);
  const showGlobalFilters = canLoadOperationalData && data.imports.length > 0 && !ADMIN_SECTIONS.includes(section);

  const requestImport = () => {
    if (!canImport) {
      toast.error("Seu perfil não possui permissão para importações oficiais.");
      return;
    }
    setImportOpen(true);
  };

  useEffect(() => { void hydrate(profile.id, canLoadOperationalData); }, [hydrate, profile.id, canLoadOperationalData]);
  const toggleCollapsed = () => {
    window.localStorage.setItem(SIDEBAR_KEY, String(!collapsed));
    window.dispatchEvent(new Event(SIDEBAR_EVENT));
  };

  if (!hydrated) return <main className="boot-screen"><div className="boot-mark">ALC</div><p>Carregando seu acesso…</p></main>;

  return (
    <div className={collapsed ? "app-shell app-shell--collapsed" : "app-shell"}>
      <div className={mobileMenu ? "mobile-sidebar is-open" : "mobile-sidebar"} onClick={() => setMobileMenu(false)}>
        <div onClick={(event) => event.stopPropagation()}><Sidebar active={section} collapsed={false} onToggle={() => setMobileMenu(false)} onImport={requestImport} canImport={canImport} profile={profile} /></div>
      </div>
      <Sidebar active={section} collapsed={collapsed} onToggle={toggleCollapsed} onImport={requestImport} canImport={canImport} profile={profile} />
      <div className="app-main">
        <Topbar section={section} profile={profile} canImport={canImport} onImport={requestImport} onMobileMenu={() => setMobileMenu(true)} />
        {showGlobalFilters && <GlobalFilters />}
        <main className="page-canvas">
          <div className="page-heading">
            <div><p>{meta.description}</p></div>
            {data.isDemo && <span className="demo-badge"><FlaskConical size={14} />Dados de demonstração</span>}
          </div>
          {showEmptyState ? <EmptyDashboard onImport={requestImport} canImport={canImport} /> : <ViewRouter section={section} profile={profile} />}
        </main>
      </div>
      {importOpen ? <ImportPanel open onClose={() => setImportOpen(false)} /> : null}
    </div>
  );
}
