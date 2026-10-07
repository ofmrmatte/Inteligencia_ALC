import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("MFA obrigatório", () => {
  const proxy = readFileSync("lib/supabase/proxy.ts", "utf8");
  const login = readFileSync("app/login/actions.ts", "utf8");
  const setup = readFileSync("app/seguranca/mfa/mfa-setup.tsx", "utf8");
  const store = readFileSync("lib/store.ts", "utf8");

  it("exige aal2 para páginas e APIs protegidas", () => {
    expect(proxy).toContain('claims?.aal !== "aal2"');
    expect(proxy).toContain('error: "MFA_REQUIRED"');
    expect(proxy).toContain("mfaUrl.pathname = MFA_PATH");
  });

  it("encaminha logins válidos para a etapa MFA", () => {
    expect(login).toContain('redirect("/seguranca/mfa")');
  });

  it("suporta cadastro e desafio TOTP", () => {
    expect(setup).toContain('factorType: "totp"');
    expect(setup).toContain("mfa.challenge");
    expect(setup).toContain("mfa.verify");
    expect(setup).toContain("getAuthenticatorAssuranceLevel");
    expect(setup).toContain("listFactors");
  });

  it("usa a lista TOTP verificada para o desafio", () => {
    expect(setup).toContain("factors.data.totp?.[0]");
  });

  it("remove apenas cadastros TOTP incompletos antes de gerar novo QR Code", () => {
    expect(setup).toContain("factors.data.all?.filter");
    expect(setup).toContain('factor.factor_type === "totp"');
    expect(setup).toContain('factor.status === "unverified"');
    expect(setup).toContain("mfa.unenroll({ factorId: factor.id })");
  });

  it("limpa todos os caches operacionais ao sair", () => {
    expect(store).toContain("await keys()");
    expect(store).toContain("STORAGE_KEY_PREFIX");
  });
});
