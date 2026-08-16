import { describe, expect, it, afterEach } from "vitest";
import { driverPortalPatchForAction, requireCanonicalDriverCode } from "@/lib/driver-portal-server";
import { legacyDriverPortalTarget } from "@/lib/supabase/proxy";

describe("hardening do portal do motorista", () => {
  const previousPortalUrl = process.env.NEXT_PUBLIC_DRIVER_PORTAL_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_DRIVER_PORTAL_URL = previousPortalUrl;
  });

  it("redireciona rotas legadas para o portal externo sem depender de sessão administrativa", () => {
    process.env.NEXT_PUBLIC_DRIVER_PORTAL_URL = "https://portal.example.com/";
    expect(legacyDriverPortalTarget("/motorista")).toBe("https://portal.example.com");
    expect(legacyDriverPortalTarget("/motorista/login")).toBe("https://portal.example.com/login");
    expect(legacyDriverPortalTarget("/login")).toBeNull();
  });

  it("retorna alvo vazio quando a URL do portal não foi configurada", () => {
    delete process.env.NEXT_PUBLIC_DRIVER_PORTAL_URL;
    expect(legacyDriverPortalTarget("/motorista")).toBe("");
  });

  it("exige driverCode real e nunca usa nome como ID", () => {
    expect(() => requireCanonicalDriverCode("")).toThrow("Informe o ID do motorista.");
    expect(requireCanonicalDriverCode(" mot-123 ")).toBe("MOT123");
  });

  it("não reativa diretamente como active sem credencial existente", () => {
    expect(driverPortalPatchForAction("reactivate", false, "now")).toMatchObject({
      portal_status: "not_activated",
      status: "pending_activation",
    });
    expect(driverPortalPatchForAction("reactivate", true, "now")).toMatchObject({
      portal_status: "active",
      status: "active",
    });
  });
});

