import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { DesviosPnrWorkspace } from "@/features/desvios-pnr/components/desvios-pnr-workspace";
import { getPnrPage } from "@/features/desvios-pnr/data/queries";

export const metadata: Metadata = {
  title: "Desvios PNR",
};

export default async function DesviosPnrPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await getPnrPage((await searchParams) ?? {});

  return (
    <>
      <PageHeader
        eyebrow="Modulo"
        title="Desvios PNR"
        description="Monitore PNRs, status, fontes de cruzamento e impacto financeiro por periodo."
      />
      <DesviosPnrWorkspace data={data} />
    </>
  );
}
