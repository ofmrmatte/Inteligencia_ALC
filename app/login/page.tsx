import { redirect } from "next/navigation";
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
          <span>Acesso restrito</span>
          <h1 id="login-title">Inteligência ALC</h1>
          <p>Entre com seu usuário Supabase para acessar os dados conforme o perfil liberado: Coordenador, Supervisor, Diretor ou ADM.</p>
        </div>
        <LoginForm supabaseReady={isSupabaseConfigured()} />
      </section>
      <aside className="login-aside" aria-label="Perfis de acesso">
        <div><strong>Coordenador</strong><span>Bases, supervisores, motoristas e pacotes sob sua responsabilidade.</span></div>
        <div><strong>Supervisor</strong><span>Operação do próprio escopo e consulta de indicadores autorizados.</span></div>
        <div><strong>Diretor / ADM</strong><span>Visão completa, importações oficiais e gestão administrativa.</span></div>
      </aside>
    </main>
  );
}
