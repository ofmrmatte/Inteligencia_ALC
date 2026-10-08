import { inteligenciaEntryUrl } from "@/lib/auth";
export default function AccessUnavailable() {
  return (
    <main className="page">
      <section className="card">
        <p className="eyebrow">ALC ATENDIMENTO</p>
        <h1>Acesso pelo Inteligência ALC</h1>
        <p>
          Não foi possível autorizar esta entrada. Abra o Atendimento pelo menu
          do Inteligência usando sua conta e permissões habituais.
        </p>
        <a className="primary" href={inteligenciaEntryUrl()}>
          Voltar ao Inteligência
        </a>
      </section>
    </main>
  );
}
