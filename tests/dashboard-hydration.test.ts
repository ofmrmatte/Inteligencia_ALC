import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard hydration", () => {
  const route = readFileSync("app/api/imports/route.ts", "utf8");

  it("usa paginação por cursor em vez de count + offset nas cargas do dashboard", () => {
    expect(route).toContain("readCursorPaged");
    expect(route).toContain('.order("id", { ascending: true })');
    expect(route).toContain('.gt("id", cursor)');
    expect(route).not.toContain('select("id", { count: "exact", head: true })');
  });

  it("limita a concorrência das consultas pesadas", () => {
    expect(route).toContain("const DASHBOARD_QUERY_CONCURRENCY = 4");
    expect(route).toContain("withDashboardQuerySlot");
  });

  it("preserva a ordem temporal dos eventos usados na classificação PNR", () => {
    expect(route).toContain("events.sort((a, b) => Date.parse(b.dateCreated) - Date.parse(a.dateCreated))");
  });
  it("usa hidratação dedicada na tela Sync PNR", () => {
    const store = readFileSync("lib/store.ts", "utf8");
    const app = readFileSync("components/dashboard-app.tsx", "utf8");
    const view = readFileSync("components/views/pnr-inbox-view.tsx", "utf8");
    expect(store).toContain('"bootstrap" | "pnr" | "full"');
    expect(store).toContain('"/api/imports?mode=pnr"');
    expect(app).toContain('section === "bandeja-pnr"');
    expect(app).toContain('"pnr" as const');
    expect(route).toContain("loadPnrDashboardData");
    expect(view).toContain('hydrate(cacheOwnerId, true, "pnr")');
  });

});
