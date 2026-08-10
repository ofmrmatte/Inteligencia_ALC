import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ModuleFoundation } from "@/components/layout/module-foundation";
import { getCurrentSession } from "@/lib/auth/session";
import { isAdminProfile } from "@/lib/permissions/is-admin-profile";

export const metadata: Metadata = {
  title: "Configuracoes",
};

export default async function ConfiguracoesPage() {
  const { profile } = await getCurrentSession();
  if (!isAdminProfile(profile)) redirect("/dashboard");

  return (
    <>
      <PageHeader
        eyebrow="Administracao"
        title="Configuracoes"
        description="Area reservada para perfis, permissoes, metas e auditoria na nova arquitetura."
      />
      <ModuleFoundation
        title="Administracao protegida"
        description="A rota ja usa o helper unico de admin e sera expandida sem duplicar regras de autorizacao."
      />
    </>
  );
}
