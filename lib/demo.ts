import type { DashboardData, DriverRecord, HierarchyRecord, PnrRecord, PrefaturaRecord, RiskRecord } from "@/lib/types";

const batchId = "demo-batch";
const trace = (sheet: string, rowNumber: number) => ({ batchId, sourceFile: "DEMO_ALC.xlsx", sourceSheet: sheet, rowNumber });

export function createDemoData(): DashboardData {
  const hierarchy: HierarchyRecord[] = [
    ["Bruno Hungria", "Maria Eduarda Ferreira", "SMG5", "Guaxupé"],
    ["Bruno Hungria", "Ricardo de Barros", "SMG5", "Guaxupé"],
    ["Bruno Hungria", "Anderson Rodrigues", "SMG13", "Teófilo Otoni"],
    ["Marcelo Ornellas", "Rosemery Conceição", "SRJ2", "Queimados"],
    ["Marcelo Ornellas", "Daniel Batista", "SRJ2", "Queimados"],
  ].map(([coordinator, supervisor, sigla, base], index) => ({
    ...trace("Coordenadores", index + 2),
    coordinator,
    supervisor,
    sigla,
    base,
    baseKey: base.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase(),
  }));

  const driverSeed = [
    ["1547859", "Rita Aparecida Magri", 842, 817, 9, 4],
    ["3954136", "Geovana Regatieri", 611, 587, 11, 5],
    ["5185686", "Itamar Santos Meier", 478, 455, 13, 6],
    ["7372910", "Henrique Gomes Tougeiro", 705, 681, 8, 3],
  ] as const;
  const drivers: DriverRecord[] = driverSeed.map(([driverId, name, shipped, delivered, incidents, lost], index) => ({
    ...trace("Transportistas", index + 7),
    driverId,
    name,
    experience: index < 2 ? "Veteran" : "New Hire",
    incidents,
    lastUpdated: "2026-08-11",
    state: "Ativo",
    shipped,
    delivered,
    undelivered: shipped - delivered,
    unvisited: Math.max(1, Math.round((shipped - delivered) / 4)),
    penalized: Math.max(1, Math.round(incidents / 2)),
    contradictoryPnr: index + 1,
    emptyBoxes: index % 2,
    lost,
    stolen: index % 3,
  }));

  const bases = [
    ["GUAXUPÉ - SMG5", "GUAXUPE", "SMG5"],
    ["TEÓFILO OTONI - SMG13", "TEOFILO OTONI", "SMG13"],
    ["QUEIMADOS - SRJ2", "QUEIMADOS", "SRJ2"],
  ] as const;
  const operations = ["SVC", "XPT", "PNR"] as const;
  const prefatura: PrefaturaRecord[] = Array.from({ length: 28 }, (_, index) => {
    const base = bases[index % bases.length];
    const driver = drivers[index % drivers.length];
    return {
      ...trace(operations[index % 3] === "PNR" ? "PNR" : `PERDIDOS ${operations[index % 3]}`, index + 2),
      period: index < 14 ? "01Q082026" : "02Q082026",
      baseLabel: base[0],
      baseName: base[1],
      baseKey: base[1],
      sigla: base[2],
      driverName: driver.name,
      plate: ["ABC1D23", "EFG4H56", "JKL7M89"][index % 3],
      description: operations[index % 3] === "PNR" ? "DESCONTO PNR" : `DESCONTO PACOTE PERDIDO ${operations[index % 3]}`,
      routeDate: `2026-08-${String((index % 12) + 1).padStart(2, "0")}`,
      shipmentId: String(48000000000 + (index === 15 ? 3 : index)),
      routeId: String(410000000 + Math.floor(index / 2)),
      value: 24.9 + (index % 7) * 17.5,
      operation: operations[index % 3],
    };
  });

  const pnr: PnrRecord[] = prefatura
    .filter((_, index) => index % 2 === 0)
    .map((record, index) => ({
      ...trace("KPI LOGISTIC PNR", index + 2),
      caseDate: record.routeDate,
      status: ["Procedente", "Em análise", "Improcedente"][index % 3],
      billingPeriod: record.period,
      shipmentId: record.shipmentId,
      products: "Produto de demonstração",
      purchaseValue: record.value,
      carrier: "ALC Transportes",
      originStation: record.baseLabel,
      baseKey: record.baseKey,
      sigla: record.sigla,
      routeId: record.routeId,
      driverId: drivers[index % drivers.length].driverId,
      custom: "",
    }));

  const risk: RiskRecord[] = prefatura.slice(5, 19).map((record, index) => ({
    ...trace("Risco LM", index + 2),
    failureDate: record.routeDate,
    shipmentId: record.shipmentId,
    itemDescription: "Pacote em risco",
    driverId: drivers[index % drivers.length].driverId,
    facilityId: record.sigla,
    destinationType: "SERVICE_CENTER",
    carrierName: "ALC Transportes",
    failureReason: ["AUSENTE", "ENDEREÇO INCORRETO", "ÁREA DE RISCO"][index % 3],
    lastSubstatus: index % 2 ? "AGUARDANDO ROTA" : "RETIDO NA BASE",
    routeId: record.routeId,
    routeStatus: "PENDING",
    destinationFacilityId: record.sigla,
    vehicleType: index % 2 ? "CAR" : "MOTO",
    quantity: 1,
    stoppedDays: (index % 6) + 1,
    gmvUsd: 12 + index,
    gmvBrl: 68 + index * 23,
    baseKey: record.baseKey,
    sigla: record.sigla,
  }));

  return {
    hierarchy,
    prefatura,
    pnr,
    risk,
    drivers,
    isDemo: true,
    imports: [
      {
        id: "demo-import",
        batchId,
        name: "Dados sintéticos de demonstração",
        importedAt: new Date().toISOString(),
        size: 0,
        status: "demonstração",
        kinds: ["hierarquia", "pre-faturamento", "pnr", "risco-lm", "motoristas"],
        workbookCount: 5,
        rowCount: hierarchy.length + prefatura.length + pnr.length + risk.length + drivers.length,
        issues: ["Amostra sintética: não representa dados operacionais reais."],
      },
    ],
  };
}
