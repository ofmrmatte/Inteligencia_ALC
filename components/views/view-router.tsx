"use client";

import dynamic from "next/dynamic";
import type { SectionId } from "@/lib/navigation";
import type { AuthProfile } from "@/lib/auth";

const loading = () => <div className="view-loading"><span /><span /><span /></div>;
const OverviewView = dynamic(() => import("./overview-view").then((module) => module.OverviewView), { loading });
const PnrView = dynamic(() => import("./pnr-view").then((module) => module.PnrView), { loading });
const PrefaturaView = dynamic(() => import("./prefatura-view").then((module) => module.PrefaturaView), { loading });
const RiskView = dynamic(() => import("./risk-view").then((module) => module.RiskView), { loading });
const DriversView = dynamic(() => import("./drivers-view").then((module) => module.DriversView), { loading });
const DriverManagementView = dynamic(() => import("./driver-management-view").then((module) => module.DriverManagementView), { loading });
const ReconciliationView = dynamic(() => import("./reconciliation-view").then((module) => module.ReconciliationView), { loading });
const QualityView = dynamic(() => import("./quality-view").then((module) => module.QualityView), { loading });
const ImportsView = dynamic(() => import("./imports-view").then((module) => module.ImportsView), { loading });
const SettingsView = dynamic(() => import("./settings-view").then((module) => module.SettingsView), { loading });
const ProfileView = dynamic(() => import("./profile-view").then((module) => module.ProfileView), { loading });

export function ViewRouter({ section, profile }: { section: SectionId; profile: AuthProfile }) {
  switch (section) {
    case "gestao-pnr": return <PnrView />;
    case "pre-faturamento": return <PrefaturaView />;
    case "risco-lm": return <RiskView />;
    case "motoristas": return <DriversView />;
    case "gestao-motoristas": return <DriverManagementView profile={profile} />;
    case "conciliacao-ids": return <ReconciliationView />;
    case "qualidade-dados": return <QualityView />;
    case "importacoes": return <ImportsView />;
    case "configuracoes": return <SettingsView profile={profile} />;
    case "perfil": return <ProfileView profile={profile} />;
    default: return <OverviewView />;
  }
}
