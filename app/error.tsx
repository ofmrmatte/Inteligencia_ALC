"use client";

import { ErrorState } from "@/components/feedback/error-state";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="content-container">
      <ErrorState reset={reset} />
    </main>
  );
}
