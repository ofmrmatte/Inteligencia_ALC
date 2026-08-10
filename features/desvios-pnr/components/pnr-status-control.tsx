"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PNR_ALLOWED_STATUSES } from "@/features/desvios-pnr/domain";

export function PnrStatusControl({ id, status }: { id: string; status: string | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function update(value: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/desvios-pnr/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status: value }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Falha ao atualizar PNR.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao atualizar PNR.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="status-control">
      <label>
        <span>Status</span>
        <select defaultValue={status || ""} disabled={loading} onChange={(event) => update(event.currentTarget.value)}>
          <option value="" disabled>Selecionar</option>
          {PNR_ALLOWED_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      {error ? <small>{error}</small> : null}
    </div>
  );
}
