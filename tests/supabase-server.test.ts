import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookieStore, createServerClient } = vi.hoisted(() => ({
  cookieStore: { getAll: vi.fn(), set: vi.fn() },
  createServerClient: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));
vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("@/lib/supabase/config", () => ({
  requireSupabaseConfig: () => ({
    supabaseUrl: "https://example.supabase.co",
    supabasePublishableKey: "publishable-test-key",
  }),
}));

import { createClient } from "@/lib/supabase/server";

describe("cliente Supabase server-side", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persiste o cookie de sessão produzido pelo login", async () => {
    createServerClient.mockReturnValue({});

    await createClient();
    const adapter = createServerClient.mock.calls[0][2].cookies;
    adapter.setAll([{ name: "sb-session", value: "redacted", options: { httpOnly: true, path: "/" } }]);

    expect(cookieStore.set).toHaveBeenCalledWith(
      "sb-session",
      "redacted",
      expect.objectContaining({ httpOnly: true, path: "/" }),
    );
  });
});
