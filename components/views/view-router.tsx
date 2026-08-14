"use client";

import dynamic from "next/dynamic";
import type { SectionId } from "@/lib/navigation";

const loading = () => <div className="view-loading"><span /><span /><span /></div>;
const OverviewView = dynamic(() => import("./overview-view").then((module) => module.OverviewView), { loading });
const PnrView = dynamic(() => import("./pnr-view").then((module) => module.PnrView), { loading });
const PrefaturaView = dynamic(() => import("./prefatura-view").then((module) => module.PrefaturaView), { loading });
const RiskView = dynamic(() => import("./risk-view").then((module) => module.RiskView), { loading });
const DriversView = dynamic(() => import("./drivers-view").then((module) => module.DriversView), { loading });
const ReconciliationView = dynamic(() => import("./reconciliation-view").then((module) => module.ReconciliationView), { loading });
const QualityView = dynamic(() => import("./quality-view").then((module) => module.QualityView), { loading });
const ImportsView = dynamic(() => import("./imports-view").then((module) => module.ImportsView), { loading });

export function ViewRouter({ section }: { section: SectionId }) {
  switch (section) {
    case "gestao-pnr": return <PnrView />;
    case "pre-faturamento": return <PrefaturaView />;
    case "risco-lm": return <RiskView />;
    case "motoristas": return <DriversView />;
    case "conciliacao-ids": return <ReconciliationView />;
    case "qualidade-dados": return <QualityView />;
    case "importacoes": return <ImportsView />;
    default: return <OverviewView />;
  }
}
