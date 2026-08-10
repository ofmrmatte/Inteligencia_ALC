import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getCurrentSession } from "@/lib/auth/session";
import type { CurrentSession } from "@/lib/auth/session";
import { isAdminProfile } from "@/lib/permissions/is-admin-profile";

type AuthenticatedSession = CurrentSession & { user: User };

export async function requireAuthenticated() {
  const session = await getCurrentSession();
  if (!session.user) {
    return {
      session,
      response: NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 }),
    };
  }
  return { session: session as AuthenticatedSession, response: null };
}

export async function requireAdmin() {
  const result = await requireAuthenticated();
  if (result.response) return result;
  if (!isAdminProfile(result.session.profile)) {
    return {
      session: result.session,
      response: NextResponse.json({ error: "Apenas administradores podem executar esta acao." }, { status: 403 }),
    };
  }
  return { session: result.session as AuthenticatedSession, response: null };
}
