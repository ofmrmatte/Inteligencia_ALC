import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ModuleFoundation } from "@/components/layout/module-foundation";

export const metadata: Metadata = {
  title: "Gestao de Pacotes",
};

export default function GestaoPacotesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Modulo"
        title="Gestao de Pacotes"
        description="Area reservada para migrar o fluxo de pacotes processados sem acoplar o monolito legado."
      />
      <ModuleFoundation
        title="Estrutura pronta para dados persistidos"
        description="A proxima etapa deve portar consultas e tabelas deste modulo em componentes dedicados."
      />
    </>
  );
}
