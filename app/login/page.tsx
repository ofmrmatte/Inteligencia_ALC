import { redirect } from "next/navigation";
import Image from "next/image";
import { Brand } from "@/components/brand";
import { getCurrentProfile } from "@/lib/auth-server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const profile = await getCurrentProfile();
  if (profile) redirect("/");

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <Brand />
        <div className="login-copy">
          <span>Painel operacional ALC</span>
          <h1 id="login-title">Inteligência ALC</h1>
          <p>Monitoramento de PNR, pré-faturamento, pacotes, risco logístico e decisões por base.</p>
        </div>
        <LoginForm supabaseReady={isSupabaseConfigured()} />
      </section>
      <aside className="login-aside" aria-label="Inteligência ALC">
        <Image className="login-aside__logo" src="/brand/alc-logo.png" alt="ALC Pereira Filho & Transportes" width={380} height={380} priority />
        <div><strong>Controle por quinzena</strong><span>Acompanhamento operacional por mês, Q1/Q2, base, motorista e status.</span></div>
        <div><strong>Decisão orientada por dados</strong><span>Prioridades de cobrança, revisão, documentação, faturamento e encerramento.</span></div>
        <div><strong>Acesso por perfil</strong><span>Coordenador, Supervisor, Diretor e ADM com escopo protegido no banco.</span></div>
      </aside>
    </main>
  );
}
