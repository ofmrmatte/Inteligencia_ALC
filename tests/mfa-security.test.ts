import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("MFA opcional por usuário", () => {
  const proxy = readFileSync("lib/supabase/proxy.ts", "utf8");
  const login = readFileSync("app/login/actions.ts", "utf8");
  const loginForm = readFileSync("app/login/login-form.tsx", "utf8");
  const loginModal = readFileSync("components/security/mfa-login-modal.tsx", "utf8");
  const profileSecurity = readFileSync("components/security/mfa-security-panel.tsx", "utf8");
  const styles = readFileSync("app/globals.css", "utf8");
  const profileView = readFileSync("components/views/profile-view.tsx", "utf8");
  const legacyPage = readFileSync("app/seguranca/mfa/page.tsx", "utf8");

  it("exige aal2 somente quando existe TOTP verificado", () => {
    expect(proxy).toContain('claims?.aal !== "aal2"');
    expect(proxy).toContain("hasVerifiedTotp");
    expect(proxy).toContain("supabase.auth.mfa.listFactors()");
    expect(proxy).toContain('error: "MFA_REQUIRED"');
  });

  it("mantém o login na mesma tela e abre o modal quando MFA é necessário", () => {
    expect(login).toContain("return { mfaRequired: true }");
    expect(loginForm).toContain("MfaLoginModal");
    expect(loginForm).toContain("showMfa");
    expect(loginModal).toContain("mfa-modal-backdrop");
    expect(loginModal).toContain("mfa.challenge");
    expect(loginModal).toContain("mfa.verify");
  });

  it("renderiza o MFA de login em portal acima do fundo desfocado", () => {
    expect(loginModal).toContain('import { createPortal } from "react-dom"');
    expect(loginModal).toContain("return createPortal(");
    expect(loginModal).toContain("document.body");
    expect(styles).toContain("z-index: 10000");
    expect(styles).toContain("justify-content: center");
    expect(styles).toContain("align-items: center");
  });

  it("permite ativar MFA no perfil com enrollment TOTP", () => {
    expect(profileView).toContain("<MfaSecurityPanel />");
    expect(profileSecurity).toContain('factorType: "totp"');
    expect(profileSecurity).toContain("mfa.enroll");
    expect(profileSecurity).toContain("mfa.challenge");
    expect(profileSecurity).toContain("mfa.verify");
  });

  it("exige TOTP antes de remover fatores e desativar MFA", () => {
    const challengeIndex = profileSecurity.indexOf("mfa.challenge({ factorId: primaryFactor.id })");
    const verifyIndex = profileSecurity.indexOf("mfa.verify({", challengeIndex);
    const unenrollIndex = profileSecurity.indexOf("mfa.unenroll({ factorId: factor.id })", verifyIndex);

    expect(challengeIndex).toBeGreaterThan(-1);
    expect(verifyIndex).toBeGreaterThan(challengeIndex);
    expect(unenrollIndex).toBeGreaterThan(verifyIndex);
    expect(profileSecurity).toContain("refreshSession()");
  });

  it("limpa apenas cadastros TOTP incompletos antes de uma nova ativação", () => {
    expect(profileSecurity).toContain('factor.factor_type === "totp"');
    expect(profileSecurity).toContain('factor.status === "unverified"');
  });

  it("encaminha a rota MFA legada para a experiência modal do login", () => {
    expect(legacyPage).toContain('mfa: "1"');
    expect(legacyPage).toContain("query.toString()");
  });
});
