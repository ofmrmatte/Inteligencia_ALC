"use client";

import { del, get, set } from "idb-keyval";
import { create } from "zustand";
import { createDemoData } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
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
  addBatches: (batches: ParsedBatch[], files?: File[]) => Promise<void>;
  removeBatch: (batchId: string) => Promise<void>;
  clearData: () => Promise<void>;
  loadDemo: () => Promise<void>;
  setFilter: <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => void;
  resetFilters: () => void;
}

async function save(data: DashboardData) {
  if (typeof window !== "undefined") await set(STORAGE_KEY, data);
}

async function readError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

async function fetchOnlineData() {
  const response = await fetch("/api/imports", { cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response, "Falha ao carregar dados online."));
  return (await response.json()) as DashboardData;
}

function safeStorageName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "arquivo";
}

async function sha256(file: File) {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function uploadFiles(batches: ParsedBatch[], files: File[]) {
  const supabase = createClient();
  const uploaded: Array<{ batchId: string; originalName: string; storagePath: string; fileSize: number; fileHash: string; workbookCount: number }> = [];

  for (const [index, file] of files.entries()) {
    const batch = batches[index];
    if (!batch) continue;
    const storagePath = `${batch.entry.batchId}/${Date.now()}-${safeStorageName(file.name)}`;
    const fileHash = await sha256(file);
    const { error } = await supabase.storage.from("alc-imports").upload(storagePath, file, {
      cacheControl: "3600",
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });
    if (error) throw new Error(`${file.name}: ${error.message}`);
    uploaded.push({
      batchId: batch.entry.batchId,
      originalName: file.name,
      storagePath,
      fileSize: file.size,
      fileHash,
      workbookCount: batch.entry.workbookCount,
    });
  }

  return uploaded;
}

async function removeUploaded(paths: string[]) {
  if (!paths.length) return;
  const supabase = createClient();
  await supabase.storage.from("alc-imports").remove(paths);
}

export const useDashboardStore = create<DashboardStore>((storeSet, getState) => ({
  data: EMPTY_DATA,
  filters: EMPTY_FILTERS,
  hydrated: false,
  importing: false,
  hydrate: async () => {
    try {
      const online = await fetchOnlineData();
      storeSet({ data: online });
      await save(online);
    } catch {
      const saved = await get<DashboardData>(STORAGE_KEY);
      if (saved) storeSet({ data: saved });
    } finally {
      storeSet({ hydrated: true });
    }
  },
  setImporting: (importing) => storeSet({ importing }),
  addBatches: async (batches, files = []) => {
    const uploaded = await uploadFiles(batches, files);
    try {
      const response = await fetch("/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batches, files: uploaded }),
      });
      if (!response.ok) throw new Error(await readError(response, "Falha ao salvar dados online."));
      const next = (await response.json()) as DashboardData;
      storeSet({ data: next });
      await save(next);
    } catch (error) {
      await removeUploaded(uploaded.map((file) => file.storagePath));
      throw error;
    }
  },
  removeBatch: async (batchId) => {
    const response = await fetch(`/api/imports?batchId=${encodeURIComponent(batchId)}`, { method: "DELETE" });
    if (!response.ok) throw new Error(await readError(response, "Falha ao remover lote online."));
    const next = (await response.json()) as DashboardData;
    storeSet({ data: next });
    await save(next);
  },
  clearData: async () => {
    const response = await fetch("/api/imports", { method: "DELETE" });
    if (!response.ok) throw new Error(await readError(response, "Falha ao limpar dados online."));
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
