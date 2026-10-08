import { NextResponse } from "next/server";
import { z } from "zod";
import { POST as persistTimeline } from "../route";

export const dynamic = "force-dynamic";

const bulkSchema = z.object({
  items: z.array(z.unknown()).min(1).max(10),
}).strict();

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const parsed = bulkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json({ error: "Lote de timelines PNR inválido.", issues: parsed.error.issues }, 400);
  }

  const headers = new Headers({ "content-type": "application/json" });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);

  const results: Array<{
    caseId: string;
    ok: boolean;
    status: number;
    data?: unknown;
    error?: string;
  }> = [];

  for (const item of parsed.data.items) {
    const caseId = item && typeof item === "object" && !Array.isArray(item)
      ? String((item as Record<string, unknown>).caseId || "")
      : "";

    try {
      const response = await persistTimeline(new Request(request.url, {
        method: "POST",
        headers,
        body: JSON.stringify(item),
      }));
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      results.push({
        caseId,
        ok: response.ok,
        status: response.status,
        ...(response.ok ? { data: body } : { error: `${String(body.error || "Falha ao persistir timeline PNR.")}${Array.isArray(body.issues) ? ` Campos: ${body.issues.map((issue: { path?: unknown[] }) => issue.path?.join(".") || "payload").slice(0, 5).join(", ")}.` : ""}` }),
      });
    } catch (error) {
      results.push({
        caseId,
        ok: false,
        status: 500,
        error: error instanceof Error ? error.message : "Falha ao persistir timeline PNR.",
      });
    }
  }

  return json({
    processed: results.filter((item) => item.ok).length,
    errors: results.filter((item) => !item.ok).length,
    results,
  });
}
