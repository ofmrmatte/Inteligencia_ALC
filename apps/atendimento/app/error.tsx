"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="page">
      <div className="card narrow">
        <h1>Não foi possível abrir o Atendimento</h1>
        <p>
          Verifique seu acesso ou tente novamente. Se persistir, a equipe deve
          conferir a conexão e as permissões do perfil.
        </p>
        <button className="primary" onClick={reset}>
          Tentar novamente
        </button>
        <a className="text-link" href="/login">
          Voltar ao acesso
        </a>
      </div>
    </main>
  );
}
