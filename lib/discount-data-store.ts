"use client";

import { create } from "zustand";

type DiscountRows = unknown[];

type DiscountDataState = {
  rows: DiscountRows;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  loadRows: (force?: boolean) => Promise<DiscountRows>;
  setRows: (next: DiscountRows | ((current: DiscountRows) => DiscountRows)) => void;
};

let inFlight: Promise<DiscountRows> | null = null;

export const useDiscountDataStore = create<DiscountDataState>((set, get) => ({
  rows: [],
  loading: false,
  loaded: false,
  error: null,

  setRows: (next) => set((state) => ({
    rows: typeof next === "function" ? next(state.rows) : next,
    loaded: true,
  })),

  loadRows: async (force = false) => {
    const current = get();
    if (!force && current.loaded) return current.rows;
    if (inFlight) return inFlight;

    set({ loading: true, error: null });

    inFlight = (async () => {
      try {
        const response = await fetch("/api/discount-management-v2", { cache: "no-store" });
        const body = (await response.json().catch(() => ({}))) as { rows?: DiscountRows; error?: string };
        if (!response.ok) throw new Error(body.error || "Falha ao carregar a Gestão de Descontos.");
        const rows = Array.isArray(body.rows) ? body.rows : [];
        set({ rows, loading: false, loaded: true, error: null });
        return rows;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao carregar a Gestão de Descontos.";
        set({ loading: false, error: message });
        throw error;
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  },
}));
