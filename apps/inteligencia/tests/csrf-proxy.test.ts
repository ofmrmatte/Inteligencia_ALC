import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { updateSession } = vi.hoisted(() => ({
  updateSession: vi.fn(async () => NextResponse.next()),
}));

vi.mock("@/lib/supabase/proxy", () => ({ updateSession }));

import { proxy } from "@/proxy";

describe("CSRF proxy atrás da Railway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aceita POST same-origin quando o proxy interno altera a URL mas preserva Host", async () => {
    const request = new NextRequest("http://internal.railway:8080/api/pnr-case-center/timeline/bulk", {
      method: "POST",
      headers: {
        host: "inteligenciaalc-production.up.railway.app",
        origin: "https://inteligenciaalc-production.up.railway.app",
        "sec-fetch-site": "same-origin",
      },
    });

    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(updateSession).toHaveBeenCalledTimes(1);
  });

  it("continua bloqueando origem de outro host", async () => {
    const request = new NextRequest("http://internal.railway:8080/api/pnr-case-center/timeline/bulk", {
      method: "POST",
      headers: {
        host: "inteligenciaalc-production.up.railway.app",
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
    });

    const response = await proxy(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Origem da requisição não autorizada.",
    });
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("mantém métodos seguros fora da validação de origem", async () => {
    const request = new NextRequest("http://internal.railway:8080/api/pnr-case-center/queue", {
      method: "GET",
      headers: {
        host: "inteligenciaalc-production.up.railway.app",
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
    });

    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(updateSession).toHaveBeenCalledTimes(1);
  });

  it("routes only the exact enrichment POST to its HMAC authentication", async () => {
    expect((await proxy(new NextRequest("https://core.example.test/api/internal/pnr-enrichment", { method: "POST" }))).status).toBe(200);
    expect(updateSession).not.toHaveBeenCalled();
    await proxy(new NextRequest("https://core.example.test/api/internal/pnr-enrichment/other", { method: "POST" }));
    expect(updateSession).toHaveBeenCalledOnce();
  });
});
