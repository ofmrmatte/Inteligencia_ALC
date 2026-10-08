import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  openSession,
  ticketHash,
  ENTRY_COOKIE,
  ENTRY_SECONDS,
  entryReceipt,
} from "@alc/identity/transfer";
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
    return NextResponse.redirect(
      new URL("/acesso-indisponivel", destination),
      303,
    );
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
    const verified = await client.auth.getClaims();
    const verifiedClaims = verified.data?.claims;
    if (
      verified.error ||
      !verifiedClaims ||
      verifiedClaims.sub !== result.rows[0].profile_id ||
      typeof verifiedClaims.session_id !== "string"
    )
      throw new Error("Sessão central inválida.");
    const store = await cookies();
    store.set(
      ENTRY_COOKIE,
      entryReceipt(
        verifiedClaims.sub,
        verifiedClaims.session_id,
        process.env.ATENDIMENTO_ENCRYPTION_KEY || "",
      ),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: ENTRY_SECONDS,
      },
    );
    await currentProfile();
    return NextResponse.redirect(new URL("/", destination), 303);
  } catch {
    (await cookies()).delete(ENTRY_COOKIE);
    return NextResponse.redirect(
      new URL("/acesso-indisponivel", destination),
      303,
    );
  }
}
