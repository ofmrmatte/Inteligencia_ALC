"use client";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Settings,
  ShieldCheck,
  Send,
  X,
} from "lucide-react";
import { Brand } from "@alc/ui/brand";
import { canManageUsers, type AuthProfile } from "@alc/identity/auth";
import { useData, when } from "./data";

const navigation = [
  ["/conversas", "Conversas", MessageSquare],
  ["/visao-geral", "Visão Geral", LayoutDashboard],
  ["/pnrs", "Motoristas e PNRs", ClipboardList],
  ["/disparos", "Clientes e envios", Send],
] as const;
function subscribeViewport(change: () => void) {
  const query = window.matchMedia("(max-width:800px)");
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}
export function WorkspaceShell({
  profile,
  inteligenciaUrl,
  children,
}: {
  profile: AuthProfile;
  inteligenciaUrl: string;
  children: ReactNode;
}) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false);
  const smallScreen = useSyncExternalStore(
    subscribeViewport,
    () => window.matchMedia("(max-width:800px)").matches,
    () => false,
  );
  const menuButton = useRef<HTMLButtonElement>(null),
    sidebar = useRef<HTMLElement>(null);
  const { data } = useData<{
    competence: string;
    source: { lastSync?: string };
  }>("overview", 30_000);
  useEffect(() => {
    if (!mobile || !smallScreen) return;
    const previous = document.body.style.overflow;
    const trigger = menuButton.current;
    document.body.style.overflow = "hidden";
    sidebar.current?.querySelector<HTMLElement>("a,button")?.focus();
    return () => {
      document.body.style.overflow = previous;
      trigger?.focus();
    };
  }, [mobile, smallScreen]);
  function close() {
    setMobile(false);
  }
  return (
    <div
      className={`workspace${collapsed ? " is-collapsed" : ""}${mobile ? " menu-open" : ""}`}
    >
      {mobile && (
        <button
          className="menu-backdrop"
          aria-label="Fechar navegação"
          onClick={close}
        />
      )}
      <aside
        className="app-sidebar"
        ref={sidebar}
        inert={smallScreen && !mobile}
        role={mobile && smallScreen ? "dialog" : undefined}
        aria-modal={(mobile && smallScreen) || undefined}
        aria-label="Navegação do Atendimento"
        onKeyDown={(event) => {
          if (!mobile) return;
          if (event.key === "Escape") close();
          if (event.key !== "Tab") return;
          const items = Array.from(
            sidebar.current?.querySelectorAll<HTMLElement>("a,button") || [],
          ).filter(
            (item) => item.getClientRects().length && item.tabIndex >= 0,
          );
          if (!items?.length) return;
          const first = items[0],
            last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <div className="sidebar-brand">
          <Link href="/conversas" aria-label="ALC Atendimento" onClick={close}>
            <Brand compact={collapsed && !mobile} application="atendimento" />
          </Link>
          <button
            className="mobile-only icon-button"
            aria-label="Fechar menu"
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>
        <nav aria-label="Áreas do Atendimento">
          <p className="nav-label">ATENDIMENTO</p>
          {navigation.map(([href, title, Icon]) => (
            <Link
              key={href}
              href={href}
              onClick={close}
              title={title}
              aria-label={title}
              aria-current={path === href ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{title}</span>
            </Link>
          ))}
          {canManageUsers(profile) && (
            <>
              <p className="nav-label">ADMINISTRAÇÃO</p>
              <Link
                href="/admin"
                onClick={close}
                title="Administração"
                aria-label="Administração"
                aria-current={path === "/admin" ? "page" : undefined}
              >
                <Settings size={19} />
                <span>Administração</span>
              </Link>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <a
            href={inteligenciaUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Inteligência ALC"
          >
            <ArrowUpRight size={18} />
            <span>Inteligência ALC</span>
          </a>
          <div className="profile" title={profile.fullName || profile.email}>
            <span className="avatar">
              {(profile.fullName || profile.email).slice(0, 1)}
            </span>
            <div>
              {profile.fullName || profile.email}
              <small>{profile.role.replaceAll("_", " ")}</small>
            </div>
          </div>
          <button
            className="sidebar-collapse"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            <span>Recolher menu</span>
          </button>
        </div>
      </aside>
      <div className="app-main" inert={mobile && smallScreen}>
        <header className="app-header">
          <button
            className="mobile-only icon-button"
            ref={menuButton}
            aria-label="Abrir navegação"
            aria-expanded={mobile}
            onClick={() => setMobile(true)}
          >
            <Menu size={21} />
          </button>
          <Image
            className="mobile-only"
            src="/brand/atendimento-icon.png"
            alt=""
            width={28}
            height={28}
          />
          <strong>ALC Atendimento</strong>
          <div className="header-actions">
            <span className="source-state" title={when(data?.source?.lastSync)}>
              {data?.competence || "Fonte PNR"} ·{" "}
              {data?.source?.lastSync
                ? when(data.source.lastSync)
                : "Sem sincronização"}
            </span>
            <span className="user-chip">
              <ShieldCheck size={15} />
              {profile.role.replaceAll("_", " ")}
            </span>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
