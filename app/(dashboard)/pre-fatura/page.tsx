import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { PreFaturaWorkspace } from "@/features/pre-fatura/components/pre-fatura-workspace";
import { getPreFaturaPage } from "@/features/pre-fatura/data";

export const metadata: Metadata = {
  title: "Pré-Fatura",
};

export default async function PreFaturaPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await getPreFaturaPage((await searchParams) ?? {});

  return (
    <>
      <PageHeader
        eyebrow="Módulo"
        title="Pré-Fatura"
        description="Consulta operacional dos registros persistidos, mantendo IDs de envio separados e ignorando linhas de totais."
      />
      <PreFaturaWorkspace data={data} />
    </>
  );
}
