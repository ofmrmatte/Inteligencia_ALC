import { redirect } from "next/navigation";
import Image from "next/image";
import { getCurrentProfile } from "@/lib/auth-server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const profile = await getCurrentProfile();
  if (profile) redirect("/");

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand" aria-label="Inteligência ALC">
          <strong>Inteligência <b>ALC</b></strong>
          <span>PNR • PRÉ-FATURAMENTO • GESTÃO DE MOTORISTAS</span>
        </div>
        <div className="login-copy">
          <span>PLATAFORMA OPERACIONAL ALC</span>
          <h1 id="login-title">Acesso Administrativo</h1>
          <p>Gestão integrada de PNR, pré-faturamento, pacotes e atendimento aos motoristas por base.</p>
        </div>
        <LoginForm supabaseReady={isSupabaseConfigured()} />
      </section>
      <aside className="login-aside" aria-label="Inteligência ALC">
        <Image className="login-aside__logo" src="/brand/alc-logo.png" alt="ALC Pereira Filho & Transportes" width={380} height={380} priority />
        <div><strong>Operação por base</strong><span>Acompanhamento de PNR, pacotes, pagamentos e contestações.</span></div>
        <div><strong>Gestão de Motoristas</strong><span>Documentos, pendências e atendimentos centralizados.</span></div>
        <div><strong>Acesso por perfil</strong><span>Gestor, Administrativo e Motorista com permissões protegidas.</span></div>
      </aside>
    </main>
  );
}
