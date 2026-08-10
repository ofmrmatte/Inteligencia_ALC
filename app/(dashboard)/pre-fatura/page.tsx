import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ModuleFoundation } from "@/components/layout/module-foundation";
import { preFaturaMigrationRules } from "@/features/pre-fatura/rules";

export const metadata: Metadata = {
  title: "Pre-Fatura",
};

export default function PreFaturaPage() {
  return (
    <>
      <PageHeader
        eyebrow="Modulo"
        title="Pre-Fatura"
        description="Fundacao preparada para migrar a regra real de importacao e reconciliacao."
      />
      <ModuleFoundation
        title="Migracao controlada da Pre-Fatura"
        description="A regra analitica completa permanece no legado ate ser portada com validacao contra os arquivos reais."
      >
        <ul className="rule-list">
          {preFaturaMigrationRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </ModuleFoundation>
    </>
  );
}
