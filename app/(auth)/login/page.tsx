import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/components/login-form";
import { BRAND } from "@/lib/constants/brand";
import { getCurrentSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Login",
};

export default async function LoginPage() {
  const { user } = await getCurrentSession();
  if (user) redirect("/dashboard");

  return (
    <main className="login-page login-page--inteligencia-alc">
      <section className="login-page__brand login-page__brand--inteligencia-alc" aria-label="Inteligência ALC">
        <div className="login-brand">
          <Image src={BRAND.assets.symbolDark} alt="Inteligência ALC" width={52} height={52} priority />
          <div>
            <strong>Inteligência ALC</strong>
            <span>ALC Pereira &amp; Filho</span>
          </div>
        </div>

        <div className="login-hero">
          <span>PAINEL OPERACIONAL</span>
          <h1>Informação clara para decisões mais rápidas.</h1>
          <p>
            Acompanhe Pré-Fatura, Gestão de Pacotes, Desvios PNR e indicadores
            operacionais em um único ambiente.
          </p>
        </div>

        <div className="login-brand-footer">
          <span>Inteligência operacional</span>
          <strong>ALC</strong>
        </div>
      </section>

      <section className="login-panel login-panel--inteligencia-alc" aria-labelledby="login-title">
        <div className="login-panel__mobile-brand" aria-hidden="true">
          <Image src={BRAND.assets.symbolDark} alt="" width={40} height={40} />
          <div>
            <strong>Inteligência ALC</strong>
            <span>ALC Pereira &amp; Filho</span>
          </div>
        </div>

        <div className="login-panel__header">
          <span>ACESSO RESTRITO</span>
          <h2 id="login-title">Bem-vindo</h2>
          <p>Entre com sua conta corporativa para acessar o painel.</p>
        </div>

        <LoginForm />

        <p className="login-panel__security">
          Ambiente corporativo - acesso destinado a usuários autorizados
        </p>
      </section>
    </main>
  );
}
