import Link from "next/link";
import {
  MessageSquare,
  LayoutDashboard,
  ClipboardList,
  Send,
  Settings,
  ArrowUpRight,
} from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { canManageUsers } from "@alc/identity/auth";
import { Logout } from "@/components/logout";
export const dynamic = "force-dynamic";
export default async function Workspace({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  return (
    <div className="workspace">
      <aside className="app-sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">ALC</span>
          <span>
            Atendimento<small>Operação & Loss</small>
          </span>
        </Link>
        <p className="nav-label">ESPAÇO DE TRABALHO</p>
        <nav aria-label="Navegação do Atendimento">
          <Link href="/">
            <LayoutDashboard size={18} />
            Visão geral
          </Link>
          <Link href="/conversas">
            <MessageSquare size={18} />
            Conversas
          </Link>
          <Link href="/pnrs">
            <ClipboardList size={18} />
            PNRs
          </Link>
          <Link href="/disparos">
            <Send size={18} />
            Disparos e histórico
          </Link>
          {canManageUsers(profile) ? (
            <Link href="/admin">
              <Settings size={18} />
              Administração
            </Link>
          ) : null}
        </nav>
        <div className="sidebar-bottom">
          <a
            href={
              process.env.INTELIGENCIA_PUBLIC_URL ||
              "https://inteligenciaalc-production.up.railway.app"
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            Inteligência ALC
            <ArrowUpRight size={16} />
          </a>
          <div className="profile">
            <span className="avatar">
              {(profile.fullName || profile.email).slice(0, 1).toUpperCase()}
            </span>
            <div>
              {profile.fullName || profile.email}
              <small>{profile.role.replaceAll("_", " ")}</small>
            </div>
          </div>
          <Logout />
        </div>
      </aside>
      <div className="app-main">
        <header className="app-header">
          <span>Operação / ALC Atendimento</span>
          <span className="badge">Case Center · coleta a cada 30 min</span>
        </header>
        {children}
      </div>
    </div>
  );
}
