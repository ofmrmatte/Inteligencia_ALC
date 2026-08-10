import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ProfileWorkspace } from "@/features/perfil/components/profile-workspace";
import { getCurrentSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Perfil",
};

export default async function PerfilPage() {
  const { profile } = await getCurrentSession();

  return (
    <>
      <PageHeader
        eyebrow="Conta"
        title="Perfil"
        description="Dados pessoais, avatar e contexto operacional do usuario autenticado."
      />
      <ProfileWorkspace profile={profile} />
    </>
  );
}
