"use client";

import { useState } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type ValidationResult = {
  fileName: string;
  acceptedRows: number;
  ignoredRows: number;
  persisted: boolean;
  persistence: { persistedRows: number } | null;
  sheets: Array<{ name: string; acceptedRows: number; ignoredRows: number }>;
  message: string;
};

export function ImportPreFaturaButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ValidationResult | null>(null);

  async function validate(formData: FormData) {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/pre-fatura/validate", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Falha ao validar planilha.");
      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao validar planilha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" variant="primary" icon={<Upload size={16} aria-hidden="true" />} onClick={() => setOpen(true)}>
        Importar
      </Button>
      {open ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="pre-fatura-import-title">
            <div className="section-header">
              <div>
                <span>Validacao</span>
                <h2 id="pre-fatura-import-title">Importar Pre-Fatura</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Fechar">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <form action={validate} className="import-form">
              <label>
                <span>Arquivo .xlsx</span>
                <input name="file" type="file" accept=".xlsx,.xlsm,.xls" required />
              </label>
              <div className="inline-warning">
                A importacao aplica as regras de total e identidade de pacote/rota antes de gravar. IDs diferentes permanecem registros separados.
              </div>
              {error ? <div className="form-alert">{error}</div> : null}
              {result ? (
                <div className="validation-result">
                  <strong>{result.message}</strong>
                  <span>{result.fileName}</span>
                  <div>
                    <span>Aceitas: {result.acceptedRows.toLocaleString("pt-BR")}</span>
                    <span>Ignoradas: {result.ignoredRows.toLocaleString("pt-BR")}</span>
                    {result.persisted ? <span>Persistidas: {result.persistence?.persistedRows.toLocaleString("pt-BR")}</span> : null}
                  </div>
                </div>
              ) : null}
              <div className="filter-form__actions">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" name="persist" value="false" variant="secondary" disabled={loading}>{loading ? "Processando..." : "Validar"}</Button>
                <Button type="submit" name="persist" value="true" disabled={loading}>{loading ? "Processando..." : "Importar"}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
