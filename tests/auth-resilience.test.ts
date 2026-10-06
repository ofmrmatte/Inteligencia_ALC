import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("auth resilience", () => {
  const proxy = readFileSync("lib/supabase/proxy.ts", "utf8");
  const authServer = readFileSync("lib/auth-server.ts", "utf8");
  const login = readFileSync("app/login/page.tsx", "utf8");

  it("repete getClaims em erros transitórios", () => {
    expect(proxy).toContain("retrySupabaseResult(() => supabase.auth.getClaims(), [250, 750])");
    expect(authServer).toContain("retrySupabaseResult(() => supabase.auth.getClaims(), [250, 750])");
  });

  it("não devolve JSON cru em navegação de página quando o Auth está instável", () => {
    expect(proxy).toContain('recoveryUrl.pathname = "/login"');
    expect(proxy).toContain('recoveryUrl.searchParams.set("error", "auth_temp")');
    expect(login).toContain('error === "auth_temp"');
  });
});
