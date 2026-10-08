import { NextResponse } from "next/server";
import { openSession, ticketHash } from "@alc/identity/transfer";
import { db } from "@/lib/db";
import { supabase, currentProfile } from "@/lib/auth";
export async function POST(request: Request) {
  const destination =
    process.env.ATENDIMENTO_PUBLIC_URL || new URL(request.url).origin;
  if (
    request.headers.get("origin") !==
    (process.env.INTELIGENCIA_PUBLIC_URL ||
      "https://inteligenciaalc-production.up.railway.app")
  )
    return new Response("Origem inválida", { status: 403 });
  const form = await request.formData(),
    ticket = String(form.get("ticket") || "");
  if (!/^[a-f0-9]{64}$/.test(ticket))
    return new Response("Acesso inválido", { status: 400 });
  const result = await db().query(
    "DELETE FROM alc_atendimento.login_tickets WHERE ticket_hash=$1 AND expires_at>now() RETURNING encrypted_session,profile_id",
    [ticketHash(ticket)],
  );
  if (!result.rows.length)
    return NextResponse.redirect(new URL("/login", destination), 303);
  try {
    const session = openSession(
      result.rows[0].encrypted_session,
      process.env.ATENDIMENTO_ENCRYPTION_KEY || "",
    );
    const client = await supabase();
    const claims = await client.auth.getClaims(session.access_token);
    if (claims.error || claims.data?.claims.sub !== result.rows[0].profile_id)
      throw new Error("Sessão inválida.");
    const set = await client.auth.setSession(session);
    if (set.error) throw set.error;
    await currentProfile();
    return NextResponse.redirect(new URL("/", destination), 303);
  } catch {
    return NextResponse.redirect(new URL("/login", destination), 303);
  }
}
