"use client";

import { create } from "zustand";

export const DISCOUNT_FILTER_ALL = "TODOS";

export type DiscountFilterState = {
  search: string;
  month: string;
  fortnight: string;
  base: string;
  xpt: string;
  driver: string;
  direction: string;
  origin: string;
  pnrStatus: string;
};

export const EMPTY_DISCOUNT_FILTERS: DiscountFilterState = {
  search: "",
  month: DISCOUNT_FILTER_ALL,
  fortnight: DISCOUNT_FILTER_ALL,
  base: DISCOUNT_FILTER_ALL,
  xpt: DISCOUNT_FILTER_ALL,
  driver: DISCOUNT_FILTER_ALL,
  direction: DISCOUNT_FILTER_ALL,
  origin: DISCOUNT_FILTER_ALL,
  pnrStatus: DISCOUNT_FILTER_ALL,
};

interface DiscountFiltersStore {
  filters: DiscountFilterState;
  setFilters: (next: DiscountFilterState | ((current: DiscountFilterState) => DiscountFilterState)) => void;
  setFilter: <K extends keyof DiscountFilterState>(key: K, value: DiscountFilterState[K]) => void;
  resetFilters: () => void;
}

export const useDiscountFiltersStore = create<DiscountFiltersStore>((set) => ({
  filters: EMPTY_DISCOUNT_FILTERS,
  setFilters: (next) => set((state) => ({
    filters: typeof next === "function" ? next(state.filters) : next,
  })),
  setFilter: (key, value) => set((state) => ({
    filters: { ...state.filters, [key]: value },
  })),
  resetFilters: () => set({ filters: EMPTY_DISCOUNT_FILTERS }),
}));
