import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { DashboardOverview } from "@/features/dashboard/components/dashboard-overview";
import { getDashboardSummary } from "@/features/dashboard/data/summary";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const summary = await getDashboardSummary();

  return (
    <>
      <PageHeader
        eyebrow="Visao geral"
        title="Dashboard"
        description="Resumo rapido dos registros processados e dos modulos operacionais."
      />
      <DashboardOverview summary={summary} />
    </>
  );
}
