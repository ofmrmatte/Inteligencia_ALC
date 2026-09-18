import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createServerClient, getClaims } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getClaims: vi.fn(),
}));

let cookieAdapter: {
  setAll: (
    cookies: Array<{ name: string; value: string; options?: Record<string, unknown> }>,
    headers: Record<string, string>,
  ) => void;
};

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((_url, _key, options) => {
    cookieAdapter = options.cookies;
    createServerClient();
    return { auth: { getClaims } };
  }),
}));
vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: () => true,
  supabaseUrl: "https://example.supabase.co",
  supabasePublishableKey: "publishable-test-key",
}));

import { updateSession } from "@/lib/supabase/proxy";

describe("proxy de autenticação", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reconhece uma sessão válida", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });

    const response = await updateSession(new NextRequest("https://app.example.com/"));

    expect(response.status).toBe(200);
    expect(getClaims).toHaveBeenCalledTimes(1);
  });

  it("não converte indisponibilidade temporária em redirect para login", async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: "connection timeout", status: 503 } });

    const response = await updateSession(new NextRequest("https://app.example.com/"));

    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
    expect(getClaims).toHaveBeenCalledTimes(1);
  });

  it("preserva cookies atualizados ao criar uma resposta de redirect", async () => {
    getClaims.mockImplementation(async () => {
      cookieAdapter.setAll(
        [{ name: "sb-test", value: "refreshed", options: { path: "/" } }],
        { "Cache-Control": "private, no-store" },
      );
      return { data: { claims: null }, error: null };
    });

    const response = await updateSession(new NextRequest("https://app.example.com/"));

    expect(response.status).toBe(307);
    expect(response.cookies.get("sb-test")?.value).toBe("refreshed");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
