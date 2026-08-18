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
const GLOBAL_SYNC_EVENT = "alc-inteligencia:global-data-sync";
const GLOBAL_SYNC_INTERVAL_MS = 15_000;
const ADMIN_SECTIONS: SectionId[] = ["gestao-motoristas", "configuracoes", "perfil"];
const STANDALONE_SECTIONS: SectionId[] = ["gestao-descontos", ...ADMIN_SECTIONS];

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

async function readGlobalRevision() {
  const response = await fetch("/api/sync/version", { cache: "no-store" });
  if (!response.ok) return null;
  const body = (await response.json().catch(() => ({}))) as { revision?: unknown };
  const revision = Number(body.revision ?? 0);
  return Number.isFinite(revision) && revision > 0 ? revision : null;
}

export function DashboardApp({ section, profile }: { section: SectionId; profile: AuthProfile }) {
  const hydrate = useDashboardStore((state) => state.hydrate);
  const hydrated = useDashboardStore((state) => state.hydrated);
  const loadError = useDashboardStore((state) => state.loadError);
  const data = useDashboardStore((state) => state.data);
  const collapsed = useSyncExternalStore(subscribeSidebarChange, getSidebarSnapshot, getServerSidebarSnapshot);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const meta = SECTION_META[section];
  const canImport = canManageImports(profile);
  const canLoadOperationalData = canAccessOperationalData(profile);
  const standalone = STANDALONE_SECTIONS.includes(section);
  const cacheOwnerId = [
    profile.id,
    profile.role,
    profile.globalAccess ? "global" : "scoped",
    [...profile.baseScope].sort().join(","),
    [...profile.siglaScope].sort().join(","),
  ].join("::");
  const initialDataLoad = canLoadOperationalData && !hydrated && !standalone;
  const showEmptyState = canLoadOperationalData && hydrated && !loadError && data.imports.length === 0 && !standalone;
  const showGlobalFilters = canLoadOperationalData && hydrated && data.imports.length > 0 && !standalone;

  const requestImport = () => {
    if (!canImport) {
      toast.error("Seu perfil não possui permissão para importações oficiais.");
      return;
    }
    setImportOpen(true);
  };

  useEffect(() => { void hydrate(cacheOwnerId, canLoadOperationalData); }, [hydrate, cacheOwnerId, canLoadOperationalData]);

  useEffect(() => {
    let disposed = false;
    let syncing = false;
    const revisionKey = `alc-inteligencia:global-revision:${cacheOwnerId}`;

    const synchronize = async () => {
      if (disposed || syncing || document.visibilityState === "hidden") return;
      syncing = true;
      try {
        const revision = await readGlobalRevision();
        if (!revision || disposed) return;
        const knownRevision = window.localStorage.getItem(revisionKey);
        if (knownRevision === String(revision)) return;

        if (canLoadOperationalData) {
          useDashboardStore.setState({ lastSyncedAt: 0 });
          await hydrate(cacheOwnerId, true);
          if (useDashboardStore.getState().loadError) return;
        }

        if (disposed) return;
        window.localStorage.setItem(revisionKey, String(revision));
        window.dispatchEvent(new CustomEvent(GLOBAL_SYNC_EVENT, { detail: { revision } }));
      } catch {
        // A sincronização periódica não deve interromper o uso do painel.
      } finally {
        syncing = false;
      }
    };

    void synchronize();
    const timer = window.setInterval(() => { void synchronize(); }, GLOBAL_SYNC_INTERVAL_MS);
    const handleFocus = () => { void synchronize(); };
    const handleVisibility = () => { if (document.visibilityState === "visible") void synchronize(); };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === revisionKey) void synchronize();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [hydrate, cacheOwnerId, canLoadOperationalData]);

  const toggleCollapsed = () => {
    window.localStorage.setItem(SIDEBAR_KEY, String(!collapsed));
    window.dispatchEvent(new Event(SIDEBAR_EVENT));
  };

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
          {initialDataLoad ? (
            <div className="view-loading" role="status" aria-live="polite" aria-label="Carregando dados do painel">
              <span /><span /><span />
            </div>
          ) : loadError && data.imports.length === 0 && canLoadOperationalData && !standalone ? (
            <div className="page-intro"><p>Não foi possível sincronizar os dados agora. Recarregue a página para tentar novamente. Detalhe: {loadError}</p></div>
          ) : showEmptyState ? (
            <EmptyDashboard onImport={requestImport} canImport={canImport} />
          ) : (
            <ViewRouter section={section} profile={profile} />
          )}
        </main>
      </div>
      {importOpen ? <ImportPanel open onClose={() => setImportOpen(false)} /> : null}
    </div>
  );
}
