import { NextResponse } from "next/server";
import pg from "pg";
import { getCurrentProfile } from "@/lib/auth-server";
import { canAccessSection } from "@/lib/access-control";
import { createClient } from "@/lib/supabase/server";
import { newTicket, sealSession, ticketHash } from "@alc/identity/transfer";
const globalTransfer = globalThis as unknown as {
  atendimentoTransferPool?: pg.Pool;
};
export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", "/atendimento");
  if (!profile) return NextResponse.redirect(login);
  if (!canAccessSection(profile, "atendimento"))
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  const destination =
    process.env.ALC_ATENDIMENTO_URL ||
    "https://alc-atendimento-production.up.railway.app";
  if (!process.env.ATENDIMENTO_SSO_KEY || !process.env.PNR_DATABASE_URL)
    return NextResponse.json(
      { error: "Acesso ao Atendimento ainda não configurado." },
      { status: 503 },
    );
  const client = await createClient();
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) return NextResponse.redirect(login);
  const verified = await client.auth.getClaims(data.session.access_token);
  if (verified.error || verified.data?.claims.sub !== profile.id)
    return NextResponse.redirect(login);
  const pool = (globalTransfer.atendimentoTransferPool ??= new pg.Pool({
    connectionString: process.env.PNR_DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 10_000,
    application_name: "alc_atendimento_transfer",
  }));
  try {
    const ticket = newTicket();
    await pool.query(
      "DELETE FROM alc_atendimento.login_tickets WHERE expires_at<now()",
    );
    await pool.query(
      "INSERT INTO alc_atendimento.login_tickets(ticket_hash,profile_id,encrypted_session,expires_at) VALUES($1,$2,$3,now()+interval '60 seconds')",
      [
        ticketHash(ticket),
        profile.id,
        sealSession(
          {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          },
          process.env.ATENDIMENTO_SSO_KEY,
        ),
      ],
    );
    const action = new URL("/auth/transfer", destination).toString();
    const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Abrindo ALC Atendimento</title><body><form method="POST" action="${action}" id="transfer"><input type="hidden" name="ticket" value="${ticket}"><button>Abrir ALC Atendimento</button></form><script>document.getElementById('transfer').submit()</script></body></html>`;
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Não foi possível abrir o Atendimento. Tente novamente pelo menu do Inteligência.",
      },
      { status: 503 },
    );
  }
}
