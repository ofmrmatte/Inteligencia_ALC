"use client";

import { create } from "zustand";

interface PnrInboxFiltersState {
  year: string;
  month: string;
  fortnight: string;
  base: string;
  status: string;
  search: string;
  setYear: (value: string) => void;
  setMonth: (value: string) => void;
  setFortnight: (value: string) => void;
  setBase: (value: string) => void;
  setStatus: (value: string) => void;
  setSearch: (value: string) => void;
}

export const usePnrInboxFiltersStore = create<PnrInboxFiltersState>((set) => ({
  year: "Todos",
  month: "Todos",
  fortnight: "Todas",
  base: "Todas",
  status: "Todos",
  search: "",
  setYear: (year) => set({ year, month: "Todos", fortnight: "Todas" }),
  setMonth: (month) => set({ month, fortnight: "Todas" }),
  setFortnight: (fortnight) => set({ fortnight }),
  setBase: (base) => set({ base }),
  setStatus: (status) => set({ status }),
  setSearch: (search) => set({ search }),
}));
