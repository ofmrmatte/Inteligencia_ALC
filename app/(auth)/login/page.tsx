import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/components/login-form";
import { BRAND } from "@/lib/constants/brand";
import { getCurrentSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Login | ALC Admin Center",
};

export default async function LoginPage() {
  const { user } = await getCurrentSession();
  if (user) redirect("/dashboard");

  return (
    <main className="login-page">
      <section className="login-page__brand" aria-label="ALC Admin Center">
        <Image src={BRAND.assets.lockupDark} alt="ALC Admin Center" width={360} height={116} priority />
        <div>
          <span>Painel de Inteligencia Operacional</span>
          <h1>Controle operacional com a identidade ALC.</h1>
        </div>
      </section>

      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-panel__header">
          <span>Acesso seguro</span>
          <h2 id="login-title">Entrar</h2>
          <p>Use sua conta autorizada para acessar os modulos do painel.</p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
