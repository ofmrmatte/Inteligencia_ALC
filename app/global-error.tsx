"use client";

import { ErrorState } from "@/components/feedback/error-state";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body>
        <main className="content-container">
          <ErrorState title="Falha critica ao iniciar" message="Recarregue a pagina ou tente novamente." reset={reset} />
        </main>
      </body>
    </html>
  );
}
