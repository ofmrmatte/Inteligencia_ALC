import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { DashboardAnalyticsSection } from "@/features/dashboard/components/dashboard-analytics";
import { DashboardOverview } from "@/features/dashboard/components/dashboard-overview";
import { getDashboardAnalytics } from "@/features/dashboard/data/analytics";
import { getDashboardSummary } from "@/features/dashboard/data/summary";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const [summary, analytics] = await Promise.all([getDashboardSummary(), getDashboardAnalytics()]);

  return (
    <>
      <PageHeader
        eyebrow="Visao geral"
        title="Dashboard"
        description="Resumo rápido dos registros processados e dos módulos operacionais."
      />
      <DashboardOverview summary={summary} />
      <DashboardAnalyticsSection analytics={analytics} />
    </>
  );
}
