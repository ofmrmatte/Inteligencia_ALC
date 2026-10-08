import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found">
      <span>404</span>
      <h1>Tela não encontrada</h1>
      <p>Este endereço não faz parte do painel ALC.</p>
      <Link className="primary-button" href="/">Voltar à visão geral</Link>
    </main>
  );
}
