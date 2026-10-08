import { requireProfile } from "@/lib/auth";
import { WorkspaceShell } from "@/components/workspace-shell";
export const dynamic = "force-dynamic";
export default async function Workspace({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  return <WorkspaceShell profile={profile} inteligenciaUrl={process.env.INTELIGENCIA_PUBLIC_URL || "https://inteligenciaalc-production.up.railway.app"}>{children}</WorkspaceShell>;
}
