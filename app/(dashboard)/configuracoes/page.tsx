import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ConfiguracoesWorkspace } from "@/features/configuracoes/components/configuracoes-workspace";
import { getAdminSettingsPage } from "@/features/configuracoes/data/queries";
import { getCurrentSession } from "@/lib/auth/session";
import { isAdminProfile } from "@/lib/permissions/is-admin-profile";

export const metadata: Metadata = {
  title: "Configurações",
};

export default async function ConfiguracoesPage() {
  const { profile } = await getCurrentSession();
  if (!isAdminProfile(profile)) redirect("/dashboard");
  const data = await getAdminSettingsPage();

  return (
    <>
      <PageHeader
        eyebrow="Administração"
        title="Configurações"
        description="Usuários, permissões, metas PNR, arquivos processados e auditoria operacional."
      />
      <ConfiguracoesWorkspace data={data} />
    </>
  );
}
