"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { EmptyDashboard } from "@/components/empty-dashboard";
import { GlobalFilters } from "@/components/global-filters";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { canManageImports, type AuthProfile } from "@/lib/auth";
import { ViewRouter } from "@/components/views/view-router";
import { SECTION_META, type SectionId } from "@/lib/navigation";
import { useDashboardStore } from "@/lib/store";

const ImportPanel = dynamic(() => import("@/components/import-panel").then((module) => module.ImportPanel), { ssr: false });
const SIDEBAR_KEY = "alc-inteligencia:sidebar-collapsed";
const ADMIN_SECTIONS: SectionId[] = ["configuracoes", "perfil"];

export function DashboardApp({ section, profile }: { section: SectionId; profile: AuthProfile }) {
  const hydrate = useDashboardStore((state) => state.hydrate);
  const hydrated = useDashboardStore((state) => state.hydrated);
  const data = useDashboardStore((state) => state.data);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem(SIDEBAR_KEY);
    return saved ? saved === "true" : true;
  });
  const [mobileMenu, setMobileMenu] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const meta = SECTION_META[section];
  const canImport = canManageImports(profile.role);
  const showEmptyState = data.imports.length === 0 && !ADMIN_SECTIONS.includes(section);
  const showGlobalFilters = data.imports.length > 0 && !ADMIN_SECTIONS.includes(section);

  const requestImport = () => {
    if (!canImport) {
      toast.error("Seu perfil pode consultar dados, mas importações oficiais exigem Diretor ou ADM.");
      return;
    }
    setImportOpen(true);
  };

  useEffect(() => { void hydrate(); }, [hydrate]);
  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem(SIDEBAR_KEY, String(next));
      return next;
    });
  };

  if (!hydrated) return <main className="boot-screen"><div className="boot-mark">ALC</div><p>Restaurando dados locais…</p></main>;

  return (
    <div className={collapsed ? "app-shell app-shell--collapsed" : "app-shell"}>
      <div className={mobileMenu ? "mobile-sidebar is-open" : "mobile-sidebar"} onClick={() => setMobileMenu(false)}>
        <div onClick={(event) => event.stopPropagation()}><Sidebar active={section} collapsed={false} onToggle={() => setMobileMenu(false)} onImport={requestImport} canImport={canImport} /></div>
      </div>
      <Sidebar active={section} collapsed={collapsed} onToggle={toggleCollapsed} onImport={requestImport} canImport={canImport} />
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
