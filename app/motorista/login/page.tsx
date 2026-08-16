import Image from "next/image";
import { DriverLoginForm } from "./driver-login-form";

export default function DriverLoginPage() {
  return (
    <main className="driver-auth-page">
      <section className="driver-auth-card">
        <div className="login-brand"><strong>Portal do <b>Motorista</b></strong><span>Pagamentos, pendências e contestações</span></div>
        <div className="login-copy"><span>Acesso externo ALC</span><h1>Consulte seus lançamentos e PDFs de pagamento.</h1><p>Entre com seu ID de motorista. No primeiro acesso, confirme sua base e o código seguro liberado pelo administrativo.</p></div>
        <DriverLoginForm />
      </section>
      <aside className="driver-auth-aside">
        <Image src="/brand/alc-logo.png" width={360} height={360} alt="ALC Pereira Filho Transportes" priority />
        <div><strong>Canal seguro de conferência</strong><span>Os documentos são privados e os links de abertura expiram em poucos minutos.</span></div>
        <div><strong>Histórico preservado</strong><span>Contestações, decisões e versões corrigidas permanecem registradas.</span></div>
      </aside>
    </main>
  );
}
