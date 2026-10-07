import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("privacy consent and dashboard cache", () => {
  it("preserva cache por perfil e modo em memória e IndexedDB", () => {
    const store = readFileSync("lib/store.ts", "utf8");
    expect(store).toContain("const memoryCaches = new Map<string, DashboardCache>()");
    expect(store).toContain("readCachedDashboard");
    expect(store).toContain('storageKey(cacheOwnerId, mode)');
    expect(store).toContain('DATA_STALE_AFTER_MS = 8 * 60 * 60 * 1000');
  });

  it("limpa o cache operacional local no logout", () => {
    const store = readFileSync("lib/store.ts", "utf8");
    const topbar = readFileSync("components/topbar.tsx", "utf8");
    expect(store).toContain("clearLocalCache");
    expect(topbar).toContain("await clearLocalCache()");
    expect(topbar).toContain("await signOutAction()");
  });

  it("mantém o cache operacional independente de cookies opcionais", () => {
    const helper = readFileSync("lib/privacy-consent.ts", "utf8");
    const store = readFileSync("lib/store.ts", "utf8");
    expect(helper).toContain('"essential" | "all"');
    expect(helper).toContain("SameSite=Lax");
    expect(store).not.toContain("optionalStorageAllowed");
  });

  it("oferece aceitar ou recusar opcionais e informa o uso real", () => {
    const banner = readFileSync("components/privacy-consent.tsx", "utf8");
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(banner).toContain("Recusar opcionais");
    expect(banner).toContain("Aceitar opcionais");
    expect(banner).toContain("Publicidade e analytics de terceiros: não utilizados atualmente");
    expect(banner).toContain("armazenamento local/IndexedDB");
    expect(layout).toContain("<PrivacyConsent />");
  });
});
