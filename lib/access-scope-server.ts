import { buildAccessScope, type AccessScope } from "@/lib/access-scope";
import type { AuthProfile } from "@/lib/auth";

export async function getUserAccessScope(profile: AuthProfile): Promise<AccessScope> {
  // A nova hierarquia usa as bases/siglas explicitamente atribuídas no cadastro
  // do usuário como fonte de verdade. Não derivamos escopo por nome em planilhas,
  // evitando tanto falsos vínculos quanto consultas RLS muito caras.
  return buildAccessScope(profile);
}
