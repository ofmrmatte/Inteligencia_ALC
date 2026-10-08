"use client";

import { create } from "zustand";

export type ReportKind = "PNR" | "PERDIDO";

interface ReportFiltersState {
  kind: ReportKind;
  dateStart: string;
  dateEnd: string;
  statusFilter: string;
  exportRequest: number;
  exporting: boolean;
  setKind: (kind: ReportKind) => void;
  setDateStart: (value: string) => void;
  setDateEnd: (value: string) => void;
  setStatusFilter: (value: string) => void;
  resetLocal: () => void;
  requestExport: () => void;
  setExporting: (value: boolean) => void;
}

export const useReportFiltersStore = create<ReportFiltersState>((set) => ({
  kind: "PNR",
  dateStart: "",
  dateEnd: "",
  statusFilter: "TODOS",
  exportRequest: 0,
  exporting: false,
  setKind: (kind) => set({ kind, statusFilter: "TODOS" }),
  setDateStart: (dateStart) => set({ dateStart }),
  setDateEnd: (dateEnd) => set({ dateEnd }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  resetLocal: () => set({ dateStart: "", dateEnd: "", statusFilter: "TODOS" }),
  requestExport: () => set((state) => state.exporting ? state : ({ exportRequest: state.exportRequest + 1 })),
  setExporting: (exporting) => set({ exporting }),
}));
