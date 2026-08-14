"use client";

import { del, get, set } from "idb-keyval";
import { create } from "zustand";
import { createDemoData } from "@/lib/demo";
import type { DashboardData, DashboardFilters, ParsedBatch } from "@/lib/types";
import { EMPTY_DATA, EMPTY_FILTERS } from "@/lib/types";

const STORAGE_KEY = "alc-inteligencia:v1";

interface DashboardStore {
  data: DashboardData;
  filters: DashboardFilters;
  hydrated: boolean;
  importing: boolean;
  hydrate: () => Promise<void>;
  setImporting: (value: boolean) => void;
  addBatches: (batches: ParsedBatch[]) => Promise<void>;
  removeBatch: (batchId: string) => Promise<void>;
  clearData: () => Promise<void>;
  loadDemo: () => Promise<void>;
  setFilter: <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => void;
  resetFilters: () => void;
}

async function save(data: DashboardData) {
  if (typeof window !== "undefined") await set(STORAGE_KEY, data);
}

export const useDashboardStore = create<DashboardStore>((storeSet, getState) => ({
  data: EMPTY_DATA,
  filters: EMPTY_FILTERS,
  hydrated: false,
  importing: false,
  hydrate: async () => {
    try {
      const saved = await get<DashboardData>(STORAGE_KEY);
      if (saved) storeSet({ data: saved });
    } finally {
      storeSet({ hydrated: true });
    }
  },
  setImporting: (importing) => storeSet({ importing }),
  addBatches: async (batches) => {
    const current = getState().data;
    const next: DashboardData = {
      hierarchy: [...current.hierarchy, ...batches.flatMap((batch) => batch.hierarchy)],
      prefatura: [...current.prefatura, ...batches.flatMap((batch) => batch.prefatura)],
      pnr: [...current.pnr, ...batches.flatMap((batch) => batch.pnr)],
      risk: [...current.risk, ...batches.flatMap((batch) => batch.risk)],
      drivers: [...current.drivers, ...batches.flatMap((batch) => batch.drivers)],
      imports: [...batches.map((batch) => batch.entry), ...current.imports],
      isDemo: false,
    };
    storeSet({ data: next });
    await save(next);
  },
  removeBatch: async (batchId) => {
    const current = getState().data;
    const next: DashboardData = {
      hierarchy: current.hierarchy.filter((row) => row.batchId !== batchId),
      prefatura: current.prefatura.filter((row) => row.batchId !== batchId),
      pnr: current.pnr.filter((row) => row.batchId !== batchId),
      risk: current.risk.filter((row) => row.batchId !== batchId),
      drivers: current.drivers.filter((row) => row.batchId !== batchId),
      imports: current.imports.filter((row) => row.batchId !== batchId),
      isDemo: current.isDemo && batchId !== "demo-batch",
    };
    storeSet({ data: next });
    await save(next);
  },
  clearData: async () => {
    storeSet({ data: EMPTY_DATA, filters: EMPTY_FILTERS });
    await del(STORAGE_KEY);
  },
  loadDemo: async () => {
    const data = createDemoData();
    storeSet({ data, filters: EMPTY_FILTERS });
    await save(data);
  },
  setFilter: (key, value) => {
    const current = getState().filters;
    const next = { ...current, [key]: value };
    if (key === "coordinator") Object.assign(next, { base: "Todas", sigla: "Todas", supervisor: "Todos", driver: "Todos" });
    if (key === "sigla") Object.assign(next, { base: "Todas", supervisor: "Todos", driver: "Todos" });
    if (key === "base") Object.assign(next, { supervisor: "Todos", driver: "Todos" });
    if (key === "operation" || key === "supervisor") next.driver = "Todos";
    storeSet({ filters: next });
  },
  resetFilters: () => storeSet({ filters: EMPTY_FILTERS }),
}));
