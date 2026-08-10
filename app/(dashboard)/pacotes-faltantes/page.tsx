import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { PacotesFaltantesWorkspace } from "@/features/pacotes-faltantes/components/pacotes-faltantes-workspace";
import { getMissingPackagesPage } from "@/features/pacotes-faltantes/data/queries";
import { getCurrentSession } from "@/lib/auth/session";
import { isAdminProfile } from "@/lib/permissions/is-admin-profile";

export const metadata: Metadata = {
  title: "Pacotes Faltantes",
};

export default async function PacotesFaltantesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ profile }, data] = await Promise.all([
    getCurrentSession(),
    getMissingPackagesPage((await searchParams) ?? {}),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Modulo"
        title="Pacotes Faltantes"
        description="Tratativas de pacotes faltantes persistidas, com SLA, status e exportacao por recorte."
      />
      <PacotesFaltantesWorkspace data={data} canManage={isAdminProfile(profile)} />
    </>
  );
}
