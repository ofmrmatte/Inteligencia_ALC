import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ModuleFoundation } from "@/components/layout/module-foundation";

export const metadata: Metadata = {
  title: "Pacotes Faltantes",
};

export default function PacotesFaltantesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Modulo"
        title="Pacotes Faltantes"
        description="Categoria separada para migracao controlada dos registros de pacotes faltantes."
      />
      <ModuleFoundation
        title="Categoria preservada"
        description="A fundacao mantem este modulo isolado para evitar mistura com Desvios PNR durante a migracao."
      />
    </>
  );
}
