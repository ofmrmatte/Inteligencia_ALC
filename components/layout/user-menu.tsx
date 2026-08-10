"use client";

import Link from "next/link";
import { LogOut, Settings, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { Profile } from "@/lib/auth/types";
import { isAdminProfile } from "@/lib/permissions/is-admin-profile";

export function UserMenu({ profile }: { profile: Profile | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const label = profile?.name || profile?.email || "Usuário";
  const initials = label.slice(0, 2).toUpperCase();

  async function logout() {
    setLoading(true);
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="user-menu">
      <button type="button" className="user-menu__trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span className="user-avatar" aria-hidden="true">
          {initials}
        </span>
        <span>{label}</span>
      </button>

      {open ? (
        <div className="user-menu__panel" role="menu">
          <div className="user-menu__identity">
            <UserRound size={18} aria-hidden="true" />
            <div>
              <strong>{label}</strong>
              <span>{profile?.email || "Sessão ativa"}</span>
            </div>
          </div>
          <Link href="/perfil" role="menuitem">
            <UserRound size={16} aria-hidden="true" />
            <span>Perfil</span>
          </Link>
          {isAdminProfile(profile) ? (
            <Link href="/configuracoes" role="menuitem">
              <Settings size={16} aria-hidden="true" />
              <span>Configurações</span>
            </Link>
          ) : null}
          <button type="button" role="menuitem" onClick={logout} disabled={loading}>
            <LogOut size={16} aria-hidden="true" />
            {loading ? "Saindo..." : "Sair"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
