import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { DesviosPnrWorkspace } from "@/features/desvios-pnr/components/desvios-pnr-workspace";
import { getPnrPage } from "@/features/desvios-pnr/data/queries";
import { getCurrentSession } from "@/lib/auth/session";
import { isAdminProfile } from "@/lib/permissions/is-admin-profile";

export const metadata: Metadata = {
  title: "Desvios PNR",
};

export default async function DesviosPnrPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ profile }, data] = await Promise.all([
    getCurrentSession(),
    getPnrPage((await searchParams) ?? {}),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Módulo"
        title="Desvios PNR"
        description="Monitore PNRs, status, fontes de cruzamento e impacto financeiro por período."
      />
      <DesviosPnrWorkspace data={data} canManage={isAdminProfile(profile)} />
    </>
  );
}
