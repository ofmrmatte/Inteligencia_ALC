import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard overview resiliente após cutover Railway", () => {
  const route = readFileSync("app/api/dashboard/overview/route.ts", "utf8");

  it("mantém o RPC agregado como caminho rápido", () => {
    expect(route).toContain('admin.rpc("dashboard_overview_v1"');
    expect(route).toContain('"railway-rpc"');
  });

  it("usa o carregamento operacional existente quando o RPC falha", () => {
    expect(route).toContain('GET as getImports');
    expect(route).toContain("buildOverviewFallback");
    expect(route).toContain('"railway-fallback"');
    expect(route).toContain("scopeData(data, filters)");
    expect(route).toContain("overviewMetrics(scoped)");
  });

  it("não expõe detalhes internos do PostgreSQL na resposta HTTP", () => {
    expect(route).toContain("console.error");
    expect(route).toContain("Não foi possível carregar os indicadores agora.");
    expect(route).not.toContain("error instanceof Error ? error.message");
  });

  it("remove o copiador temporário depois da migração concluída", () => {
    expect(existsSync("scripts/migrate-supabase-to-railway.mjs")).toBe(false);
  });
});
