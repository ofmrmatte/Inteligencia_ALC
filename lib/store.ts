"use client";

import { del, get, set } from "idb-keyval";
import { create } from "zustand";
import { createDemoData } from "@/lib/demo";
import { applyOperationalDirectory, type OperationalDirectoryPayload } from "@/lib/operational-directory";
import { createClient } from "@/lib/supabase/client";
import type { DashboardData, DashboardFilters, ParsedBatch } from "@/lib/types";
import { EMPTY_DATA, EMPTY_FILTERS } from "@/lib/types";

const STORAGE_KEY_PREFIX = "alc-inteligencia:v4";
const DATA_STALE_AFTER_MS = 2 * 60 * 1000;
const hydrationTasks = new Map<string, Promise<void>>();

interface DashboardCache {
  data: DashboardData;
  savedAt: number;
}

interface DashboardStore {
  data: DashboardData;
  filters: DashboardFilters;
  hydrated: boolean;
  refreshing: boolean;
  importing: boolean;
  cacheOwnerId: string;
  lastSyncedAt: number | null;
  loadError: string;
  hydrate: (cacheOwnerId: string, loadOperationalData?: boolean) => Promise<void>;
  setImporting: (value: boolean) => void;
  addBatches: (batches: ParsedBatch[], files?: File[]) => Promise<void>;
  removeBatch: (batchId: string) => Promise<void>;
  clearData: () => Promise<void>;
  loadDemo: () => Promise<void>;
  setFilter: <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => void;
  resetFilters: () => void;
}

function storageKey(cacheOwnerId: string) {
  return `${STORAGE_KEY_PREFIX}:${cacheOwnerId || "anonymous"}`;
}

async function save(data: DashboardData, cacheOwnerId: string, savedAt = Date.now()) {
  if (typeof window !== "undefined" && cacheOwnerId) {
    await set(storageKey(cacheOwnerId), { data, savedAt } satisfies DashboardCache);
  }
}

async function readError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

async function applyOnlineDirectory(data: DashboardData) {
  const response = await fetch("/api/settings/operational-units", { cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response, "Falha ao carregar cadastro de bases."));
  const directory = (await response.json()) as OperationalDirectoryPayload;
  return applyOperationalDirectory(data, directory);
}

async function fetchOnlineData() {
  const response = await fetch("/api/imports", { cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response, "Falha ao carregar dados online."));
  const data = (await response.json()) as DashboardData;
  return applyOnlineDirectory(data);
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
  refreshing: false,
  importing: false,
  cacheOwnerId: "",
  lastSyncedAt: null,
  loadError: "",
  hydrate: async (cacheOwnerId, loadOperationalData = true) => {
    if (!loadOperationalData) {
      storeSet({
        data: EMPTY_DATA,
        filters: EMPTY_FILTERS,
        hydrated: true,
        refreshing: false,
        cacheOwnerId,
        lastSyncedAt: null,
        loadError: "",
      });
      return;
    }

    const running = hydrationTasks.get(cacheOwnerId);
    if (running) return running;

    const current = getState();
    const sameOwner = current.cacheOwnerId === cacheOwnerId;
    if (
      sameOwner
      && current.hydrated
      && !current.refreshing
      && current.lastSyncedAt
      && Date.now() - current.lastSyncedAt < DATA_STALE_AFTER_MS
    ) {
      return;
    }

    const task = (async () => {
      let cacheWasLoaded = sameOwner && current.hydrated;

      if (!sameOwner) {
        storeSet({
          data: EMPTY_DATA,
          filters: EMPTY_FILTERS,
          hydrated: false,
          refreshing: false,
          cacheOwnerId,
          lastSyncedAt: null,
          loadError: "",
        });
      }

      if (!cacheWasLoaded) {
        try {
          const cached = await get<DashboardCache>(storageKey(cacheOwnerId));
          if (cached?.data) {
            cacheWasLoaded = true;
            const cacheIsFresh = Date.now() - cached.savedAt < DATA_STALE_AFTER_MS;
            storeSet({
              data: cached.data,
              hydrated: true,
              refreshing: !cacheIsFresh,
              cacheOwnerId,
              lastSyncedAt: cached.savedAt,
              loadError: "",
            });
            if (cacheIsFresh) return;
          }
        } catch {
          // Cache local é apenas acelerador. Falhas nele não bloqueiam o painel.
        }
      }

      storeSet({ refreshing: true, loadError: "" });

      try {
        const online = await fetchOnlineData();
        const syncedAt = Date.now();
        if (getState().cacheOwnerId !== cacheOwnerId) return;
        storeSet({
          data: online,
          hydrated: true,
          refreshing: false,
          cacheOwnerId,
          lastSyncedAt: syncedAt,
          loadError: "",
        });
        await save(online, cacheOwnerId, syncedAt);
      } catch (error) {
        if (getState().cacheOwnerId !== cacheOwnerId) return;
        storeSet({
          hydrated: true,
          refreshing: false,
          loadError: error instanceof Error ? error.message : "Falha ao sincronizar dados.",
        });
      }
    })().finally(() => {
      hydrationTasks.delete(cacheOwnerId);
    });

    hydrationTasks.set(cacheOwnerId, task);
    return task;
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
      const next = await applyOnlineDirectory((await response.json()) as DashboardData);
      const syncedAt = Date.now();
      storeSet({ data: next, hydrated: true, refreshing: false, lastSyncedAt: syncedAt, loadError: "" });
      await save(next, getState().cacheOwnerId, syncedAt);
    } catch (error) {
      await removeUploaded(uploaded.map((file) => file.storagePath));
      throw error;
    }
  },
  removeBatch: async (batchId) => {
    const response = await fetch(`/api/imports?batchId=${encodeURIComponent(batchId)}`, { method: "DELETE" });
    if (!response.ok) throw new Error(await readError(response, "Falha ao remover lote online."));
    const next = await applyOnlineDirectory((await response.json()) as DashboardData);
    const syncedAt = Date.now();
    storeSet({ data: next, hydrated: true, refreshing: false, lastSyncedAt: syncedAt, loadError: "" });
    await save(next, getState().cacheOwnerId, syncedAt);
  },
  clearData: async () => {
    const response = await fetch("/api/imports", { method: "DELETE" });
    if (!response.ok) throw new Error(await readError(response, "Falha ao limpar dados online."));
    storeSet({ data: EMPTY_DATA, filters: EMPTY_FILTERS, hydrated: true, refreshing: false, lastSyncedAt: Date.now(), loadError: "" });
    const owner = getState().cacheOwnerId;
    if (owner) await del(storageKey(owner));
  },
  loadDemo: async () => {
    const data = createDemoData();
    const syncedAt = Date.now();
    storeSet({ data, filters: EMPTY_FILTERS, hydrated: true, refreshing: false, lastSyncedAt: syncedAt, loadError: "" });
    await save(data, getState().cacheOwnerId, syncedAt);
  },
  setFilter: (key, value) => {
    const currentFilters = getState().filters;
    const next = { ...currentFilters, [key]: value };
    if (key === "xpt") Object.assign(next, { coordinator: "Todos", base: "Todas", sigla: "Todas", supervisor: "Todos", driver: "Todos" });
    if (key === "coordinator") Object.assign(next, { base: "Todas", sigla: "Todas", supervisor: "Todos", driver: "Todos" });
    if (key === "sigla") Object.assign(next, { base: "Todas", supervisor: "Todos", driver: "Todos" });
    if (key === "base") Object.assign(next, { supervisor: "Todos", driver: "Todos" });
    if (key === "operation" || key === "supervisor") next.driver = "Todos";
    storeSet({ filters: next });
  },
  resetFilters: () => storeSet({ filters: EMPTY_FILTERS }),
}));
