import { currentProfile, scopeFor } from "@/lib/auth";
import { inboxScopeSql } from "@/lib/inbox";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const profile = await currentProfile();
  const values: unknown[] = [];
  const scope = inboxScopeSql(await scopeFor(profile), values);
  const result = await db().query(
    `SELECT c.id,c.phone,c.case_id,c.updated_at,c.status,
       count(m.id)::int AS message_count
     FROM alc_atendimento.conversations c
     LEFT JOIN alc_atendimento.messages m ON m.conversation_id=c.id AND m.direction<>'note'
     WHERE ${scope} AND c.channel='client' AND c.status='resolved' AND c.case_id IS NOT NULL
     GROUP BY c.id
     ORDER BY c.updated_at DESC,c.id DESC LIMIT 200`, values,
  );
  return Response.json({ records: result.rows, limit: 200 }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
