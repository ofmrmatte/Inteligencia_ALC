import { LoginForm } from "@/components/login-form";
export default function Login() {
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand">
          <span className="brand-mark">ALC</span> Atendimento
        </div>
        <div>
          <p className="eyebrow">OPERAÇÃO CONECTADA</p>
          <h1>
            Cada entrega.
            <br />
            Uma conversa
            <br />
            que resolve.
          </h1>
          <p>
            Clientes, motoristas e equipe Loss no mesmo fluxo de atendimento.
          </p>
        </div>
        <div className="login-tags">
          <span>WhatsApp</span>
          <span>PNRs</span>
          <span>Case Center</span>
        </div>
      </section>
      <section className="login-card">
        <p className="eyebrow">BEM-VINDO À ALC</p>
        <h2>Acesse seu atendimento</h2>
        <p className="muted">Use sua conta do Inteligência ALC.</p>
        <LoginForm />
        <p className="login-foot">
          Acesso conforme seu perfil e suas bases operacionais.
        </p>
      </section>
    </main>
  );
}
