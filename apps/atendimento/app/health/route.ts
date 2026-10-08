import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await db().query("SELECT 1 FROM alc_atendimento.settings LIMIT 1");
    return Response.json({ status: "ok", application: "ALC Atendimento" });
  } catch {
    return Response.json(
      { status: "unavailable", application: "ALC Atendimento" },
      { status: 503 },
    );
  }
}
