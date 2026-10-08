import { NextResponse } from "next/server";
import pg from "pg";
import { getCurrentProfile } from "@/lib/auth-server";
import { canAccessSection } from "@/lib/access-control";
import { createClient } from "@/lib/supabase/server";
import { newTicket, sealSession, ticketHash } from "@alc/identity/transfer";
import { registerAtendimentoSession } from "@/lib/atendimento-access";
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
  if (verified.error || verified.data?.claims.sub !== profile.id || typeof verified.data.claims.session_id !== "string")
    return NextResponse.redirect(login);
  const pool = (globalTransfer.atendimentoTransferPool ??= new pg.Pool({
    connectionString: process.env.PNR_DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 10_000,
    application_name: "alc_atendimento_transfer",
  }));
  try {
    await registerAtendimentoSession(profile.id, verified.data.claims.session_id);
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
    const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Abrindo ALC Atendimento</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff; color: #25272b; font: 14px/1.6 Poppins, Arial, sans-serif; }
    main { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; padding: 24px; text-align: center; }
    img { width: 56px; height: 56px; object-fit: contain; }
    p { margin: 0; }
    .spinner { width: 24px; height: 24px; border: 2px solid #e8e9ec; border-top-color: #e30613; border-radius: 50%; animation: spin .8s linear infinite; }
    button { min-height: 44px; padding: 10px 16px; border: 0; border-radius: 6px; background: #e30613; color: #fff; font: inherit; cursor: pointer; }
    button:focus-visible { outline: 2px solid #25272b; outline-offset: 3px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
  </style>
</head>
<body>
  <main id="loading" aria-busy="true">
    <img src="/brand/alc-symbol.png" alt="ALC" width="56" height="56">
    <div class="spinner" id="spinner" aria-hidden="true"></div>
    <p id="status" role="status" aria-live="polite">Abrindo ALC Atendimento...</p>
    <form method="POST" action="${action}" id="transfer">
      <input type="hidden" name="ticket" value="${ticket}">
      <button id="manual" type="submit" hidden>Abrir ALC Atendimento</button>
      <noscript><style>.spinner,#status { display: none; }</style><button type="submit">Abrir ALC Atendimento</button></noscript>
    </form>
  </main>
  <script>
    try { document.getElementById('transfer').submit(); }
    catch {
      document.getElementById('loading').setAttribute('aria-busy', 'false');
      document.getElementById('spinner').hidden = true;
      document.getElementById('status').textContent = 'Não foi possível abrir automaticamente.';
      document.getElementById('manual').hidden = false;
    }
  </script>
</body>
</html>`;
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
