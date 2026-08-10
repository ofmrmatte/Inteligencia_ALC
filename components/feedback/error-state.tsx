"use client";

import { Button } from "@/components/ui/button";

type ErrorStateProps = {
  title?: string;
  message?: string;
  reset?: () => void;
};

export function ErrorState({
  title = "Não foi possível carregar esta área",
  message = "Tente novamente em instantes.",
  reset,
}: ErrorStateProps) {
  return (
    <div className="error-state">
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
      {reset ? (
        <Button type="button" variant="secondary" onClick={reset}>
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}
