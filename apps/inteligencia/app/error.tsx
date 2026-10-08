"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="not-found">
      <span>!</span>
      <h1>Não foi possível abrir esta tela</h1>
      <p>Os dados online permanecem preservados. Tente carregar novamente.</p>
      <button className="primary-button" onClick={reset}>Tentar novamente</button>
    </main>
  );
}
