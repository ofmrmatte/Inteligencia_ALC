"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { FlaskConical } from "lucide-react";
import { EmptyDashboard } from "@/components/empty-dashboard";
import { GlobalFilters } from "@/components/global-filters";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { ViewRouter } from "@/components/views/view-router";
import { SECTION_META, type SectionId } from "@/lib/navigation";
import { useDashboardStore } from "@/lib/store";

const ImportPanel = dynamic(() => import("@/components/import-panel").then((module) => module.ImportPanel), { ssr: false });

export function DashboardApp({ section }: { section: SectionId }) {
  const hydrate = useDashboardStore((state) => state.hydrate);
  const hydrated = useDashboardStore((state) => state.hydrated);
  const data = useDashboardStore((state) => state.data);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const meta = SECTION_META[section];

  useEffect(() => { void hydrate(); }, [hydrate]);

  if (!hydrated) return <main className="boot-screen"><div className="boot-mark">ALC</div><p>Restaurando dados locais…</p></main>;

  return (
    <div className={collapsed ? "app-shell app-shell--collapsed" : "app-shell"}>
      <div className={mobileMenu ? "mobile-sidebar is-open" : "mobile-sidebar"} onClick={() => setMobileMenu(false)}>
        <div onClick={(event) => event.stopPropagation()}><Sidebar active={section} collapsed={false} onToggle={() => setMobileMenu(false)} onImport={() => setImportOpen(true)} /></div>
      </div>
      <Sidebar active={section} collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} onImport={() => setImportOpen(true)} />
      <div className="app-main">
        <Topbar section={section} onImport={() => setImportOpen(true)} onMobileMenu={() => setMobileMenu(true)} />
        {data.imports.length > 0 && <GlobalFilters />}
        <main className="page-canvas">
          <div className="page-heading">
            <div><p>{meta.description}</p></div>
            {data.isDemo && <span className="demo-badge"><FlaskConical size={14} />Dados de demonstração</span>}
          </div>
          {data.imports.length === 0 ? <EmptyDashboard onImport={() => setImportOpen(true)} /> : <ViewRouter section={section} />}
        </main>
      </div>
      {importOpen ? <ImportPanel open onClose={() => setImportOpen(false)} /> : null}
    </div>
  );
}
