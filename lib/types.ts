export type SourceKind = "hierarquia" | "pnr" | "pre-faturamento" | "risco-lm" | "motoristas";
export type Operation = "SVC" | "XPT" | "PNR";

export interface SourceTrace {
  batchId: string;
  sourceFile: string;
  sourceSheet: string;
  rowNumber: number;
}

export interface HierarchyRecord extends SourceTrace {
  coordinator: string;
  supervisor: string;
  sigla: string;
  base: string;
  baseKey: string;
}

export interface PrefaturaRecord extends SourceTrace {
  period: string;
  baseLabel: string;
  baseName: string;
  baseKey: string;
  sigla: string;
  driverName: string;
  plate: string;
  description: string;
  routeDate: string | null;
  shipmentId: string;
  routeId: string;
  value: number;
  operation: Operation;
}

export interface PnrRecord extends SourceTrace {
  caseDate: string | null;
  status: string;
  billingPeriod: string;
  shipmentId: string;
  products: string;
  purchaseValue: number;
  carrier: string;
  originStation: string;
  baseKey: string;
  sigla: string;
  routeId: string;
  driverId: string;
  custom: string;
}

export interface RiskRecord extends SourceTrace {
  failureDate: string | null;
  shipmentId: string;
  itemDescription: string;
  driverId: string;
  facilityId: string;
  destinationType: string;
  carrierName: string;
  failureReason: string;
  lastSubstatus: string;
  routeId: string;
  routeStatus: string;
  destinationFacilityId: string;
  vehicleType: string;
  quantity: number;
  stoppedDays: number;
  gmvUsd: number;
  gmvBrl: number;
  baseKey: string;
  sigla: string;
}

export interface DriverRecord extends SourceTrace {
  driverId: string;
  name: string;
  experience: string;
  incidents: number;
  lastUpdated: string | null;
  state: string;
  shipped: number;
  delivered: number;
  undelivered: number;
  unvisited: number;
  penalized: number;
  contradictoryPnr: number;
  emptyBoxes: number;
  lost: number;
  stolen: number;
}

export interface ImportEntry {
  id: string;
  batchId: string;
  name: string;
  importedAt: string;
  fortnight?: string | null;
  month?: string | null;
  size: number;
  status: "concluído" | "com-alertas" | "erro" | "demonstração";
  kinds: SourceKind[];
  workbookCount: number;
  rowCount: number;
  issues: string[];
}

export interface DashboardData {
  hierarchy: HierarchyRecord[];
  prefatura: PrefaturaRecord[];
  pnr: PnrRecord[];
  risk: RiskRecord[];
  drivers: DriverRecord[];
  imports: ImportEntry[];
  isDemo: boolean;
}

export interface ParsedBatch {
  hierarchy: HierarchyRecord[];
  prefatura: PrefaturaRecord[];
  pnr: PnrRecord[];
  risk: RiskRecord[];
  drivers: DriverRecord[];
  entry: ImportEntry;
}

export interface DashboardFilters {
  month: string;
  fortnight: string;
  coordinator: string;
  base: string;
  sigla: string;
  operation: string;
  supervisor: string;
  driver: string;
}

export const EMPTY_DATA: DashboardData = {
  hierarchy: [],
  prefatura: [],
  pnr: [],
  risk: [],
  drivers: [],
  imports: [],
  isDemo: false,
};

export const EMPTY_FILTERS: DashboardFilters = {
  month: "Todos",
  fortnight: "Todas",
  coordinator: "Todos",
  base: "Todas",
  sigla: "Todas",
  operation: "Todas",
  supervisor: "Todos",
  driver: "Todos",
};
