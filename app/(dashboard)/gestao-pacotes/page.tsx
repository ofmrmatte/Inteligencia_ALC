import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { GestaoPacotesWorkspace } from "@/features/gestao-pacotes/components/gestao-pacotes-workspace";
import { getGestaoPacotesPage } from "@/features/gestao-pacotes/data/queries";

export const metadata: Metadata = {
  title: "Gestao de Pacotes",
};

export default async function GestaoPacotesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await getGestaoPacotesPage((await searchParams) ?? {});

  return (
    <>
      <PageHeader
        eyebrow="Modulo"
        title="Gestao de Pacotes"
        description="Acompanhe pacotes, rotas, eventos e status da operacao."
      />
      <GestaoPacotesWorkspace data={data} />
    </>
  );
}
