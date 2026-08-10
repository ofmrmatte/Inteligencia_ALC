import type { User } from "@supabase/supabase-js";
import { getCurrentSession } from "@/lib/auth/session";
import type { CurrentSession } from "@/lib/auth/session";
import { isAdminProfile } from "@/lib/permissions/is-admin-profile";
import { apiError } from "@/lib/server/api-response";

type AuthenticatedSession = CurrentSession & { user: User };

export async function requireAuthenticated() {
  const session = await getCurrentSession();
  if (!session.user) {
    return {
      session,
      response: apiError("Sessão expirada. Entre novamente.", 401),
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
      response: apiError("Apenas administradores podem executar esta ação.", 403),
    };
  }
  return { session: result.session as AuthenticatedSession, response: null };
}
