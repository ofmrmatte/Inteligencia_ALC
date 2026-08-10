import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ModuleFoundation } from "@/components/layout/module-foundation";

export const metadata: Metadata = {
  title: "Desvios PNR",
};

export default function DesviosPnrPage() {
  return (
    <>
      <PageHeader
        eyebrow="Modulo"
        title="Desvios PNR"
        description="Fundacao para consultas paginadas e agregacoes sem bloquear o shell."
      />
      <ModuleFoundation
        title="Migracao planejada para RPCs e tabelas"
        description="Este modulo deve carregar seus dados de forma independente, sem bloquear Dashboard ou Pre-Fatura."
      />
    </>
  );
}
