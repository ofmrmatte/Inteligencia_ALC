"use client";

import { del, get, set } from "idb-keyval";
import { create } from "zustand";
import { createDemoData } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import type { DashboardData, DashboardFilters, ParsedBatch } from "@/lib/types";
import { EMPTY_DATA, EMPTY_FILTERS } from "@/lib/types";

const STORAGE_KEY_PREFIX = "alc-inteligencia:v2";

interface DashboardStore {
  data: DashboardData;
  filters: DashboardFilters;
  hydrated: boolean;
  importing: boolean;
  cacheOwnerId: string;
  hydrate: (profileId: string, loadOperationalData?: boolean) => Promise<void>;
  setImporting: (value: boolean) => void;
  addBatches: (batches: ParsedBatch[], files?: File[]) => Promise<void>;
  removeBatch: (batchId: string) => Promise<void>;
  clearData: () => Promise<void>;
  loadDemo: () => Promise<void>;
  setFilter: <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => void;
  resetFilters: () => void;
}

function storageKey(profileId: string) {
  return `${STORAGE_KEY_PREFIX}:${profileId || "anonymous"}`;
}

async function save(data: DashboardData, profileId: string) {
  if (typeof window !== "undefined" && profileId) await set(storageKey(profileId), data);
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
  cacheOwnerId: "",
  hydrate: async (profileId, loadOperationalData = true) => {
    const current = getState();
    const sameOwner = current.cacheOwnerId === profileId;
    const needsBlockingLoad = !current.hydrated || !sameOwner;

    // O loading de tela inteira deve existir só no primeiro carregamento real
    // da sessão/usuário. Navegações internas mantêm a UI e atualizam os dados
    // em segundo plano, evitando o flash de boot a cada remount do DashboardApp.
    if (needsBlockingLoad) {
      storeSet({ hydrated: false, cacheOwnerId: profileId });
    } else if (!sameOwner) {
      storeSet({ cacheOwnerId: profileId });
    }

    if (!loadOperationalData) {
      storeSet({ data: EMPTY_DATA, filters: EMPTY_FILTERS, hydrated: true, cacheOwnerId: profileId });
      return;
    }

    try {
      const online = await fetchOnlineData();
      storeSet({ data: online, cacheOwnerId: profileId });
      await save(online, profileId);
    } catch {
      // Em um primeiro carregamento ainda tentamos o cache local. Em uma
      // navegação interna, preservamos os dados já visíveis se o refresh falhar.
      if (needsBlockingLoad) {
        const saved = await get<DashboardData>(storageKey(profileId));
        storeSet({ data: saved ?? EMPTY_DATA });
      }
    } finally {
      storeSet({ hydrated: true, cacheOwnerId: profileId });
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
      await save(next, getState().cacheOwnerId);
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
    await save(next, getState().cacheOwnerId);
  },
  clearData: async () => {
    const response = await fetch("/api/imports", { method: "DELETE" });
    if (!response.ok) throw new Error(await readError(response, "Falha ao limpar dados online."));
    storeSet({ data: EMPTY_DATA, filters: EMPTY_FILTERS });
    const owner = getState().cacheOwnerId;
    if (owner) await del(storageKey(owner));
  },
  loadDemo: async () => {
    const data = createDemoData();
    storeSet({ data, filters: EMPTY_FILTERS });
    await save(data, getState().cacheOwnerId);
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
