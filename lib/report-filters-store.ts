"use client";

import { create } from "zustand";

export type ReportKind = "PNR" | "PERDIDO";

interface ReportFiltersState {
  kind: ReportKind;
  dateStart: string;
  dateEnd: string;
  statusFilter: string;
  exportRequest: number;
  setKind: (kind: ReportKind) => void;
  setDateStart: (value: string) => void;
  setDateEnd: (value: string) => void;
  setStatusFilter: (value: string) => void;
  resetLocal: () => void;
  requestExport: () => void;
}

export const useReportFiltersStore = create<ReportFiltersState>((set) => ({
  kind: "PNR",
  dateStart: "",
  dateEnd: "",
  statusFilter: "TODOS",
  exportRequest: 0,
  setKind: (kind) => set({ kind, statusFilter: "TODOS" }),
  setDateStart: (dateStart) => set({ dateStart }),
  setDateEnd: (dateEnd) => set({ dateEnd }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  resetLocal: () => set({ dateStart: "", dateEnd: "", statusFilter: "TODOS" }),
  requestExport: () => set((state) => ({ exportRequest: state.exportRequest + 1 })),
}));
