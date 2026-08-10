"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  MISSING_PACKAGE_CASE_STATUSES,
  MISSING_PACKAGE_CONTACT_STATUSES,
} from "@/features/pacotes-faltantes/domain";

export function MissingPackageStatusControl({
  id,
  statusCaso,
  statusContato,
}: {
  id: string;
  statusCaso: string | null;
  statusContato: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function update(field: "status_caso" | "status_contato_meli", value: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/pacotes-faltantes/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, [field]: value }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Falha ao atualizar status.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao atualizar status.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="status-control">
      <label>
        <span>Caso</span>
        <select
          defaultValue={statusCaso || "Pendente"}
          disabled={loading}
          onChange={(event) => update("status_caso", event.currentTarget.value)}
        >
          {MISSING_PACKAGE_CASE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </label>
      <label>
        <span>MELI</span>
        <select
          defaultValue={statusContato || "E-mail Enviado"}
          disabled={loading}
          onChange={(event) => update("status_contato_meli", event.currentTarget.value)}
        >
          {MISSING_PACKAGE_CONTACT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </label>
      {error ? <small>{error}</small> : null}
    </div>
  );
}
