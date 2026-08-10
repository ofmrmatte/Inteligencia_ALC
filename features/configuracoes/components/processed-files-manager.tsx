"use client";

import { FileClock, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ProcessedFileRow } from "@/features/configuracoes/data/queries";

type ModuleKey = "all" | "pre_fatura" | "gestao_pacotes" | "desvios_pnr" | "pacotes_faltantes";

const MODULES: Array<{ key: ModuleKey; label: string }> = [
  { key: "pre_fatura", label: "Pré-Fatura" },
  { key: "gestao_pacotes", label: "Gestão de Pacotes" },
  { key: "desvios_pnr", label: "Desvios PNR" },
  { key: "pacotes_faltantes", label: "Pacotes Faltantes" },
  { key: "all", label: "Todos" },
];

function number(value: number) {
  return value.toLocaleString("pt-BR");
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function moduleLabel(moduleKey: string | null) {
  return MODULES.find((item) => item.key === moduleKey)?.label || moduleKey || "Sem categoria";
}

export function ProcessedFilesManager({ files }: { files: ProcessedFileRow[] }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ModuleKey>("pre_fatura");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    files.forEach((file) => map.set(file.module_key || "", (map.get(file.module_key || "") || 0) + 1));
    return map;
  }, [files]);

  const visibleFiles = useMemo(
    () => activeTab === "all" ? files : files.filter((file) => file.module_key === activeTab),
    [activeTab, files],
  );

  const visibleIds = visibleFiles.map((file) => file.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  function changeTab(tab: ModuleKey) {
    setActiveTab(tab);
    setSelected(new Set());
    setFeedback(null);
  }

  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleVisible() {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function deleteSelected() {
    const ids = [...selected];
    if (!ids.length || pending) return;

    const selectedFiles = files.filter((file) => selected.has(file.id));
    const summary = selectedFiles
      .slice(0, 4)
      .map((file) => `• ${file.file_name || "Arquivo sem nome"}`)
      .join("\n");
    const more = selectedFiles.length > 4 ? `\n• +${selectedFiles.length - 4} arquivo(s)` : "";

    const confirmed = window.confirm(
      `Excluir ${selectedFiles.length} arquivo(s) da base?\n\n${summary}${more}\n\n` +
      "Esta ação remove os registros importados vinculados aos arquivos, o histórico de processamento e o cadastro do arquivo. Não pode ser desfeita.",
    );
    if (!confirmed) return;

    setFeedback(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/configuracoes/settings", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ processedFileIds: ids }),
        });
        const payload = await response.json().catch(() => null) as {
          error?: string;
          deletedFiles?: number;
          deletedRows?: number;
        } | null;

        if (!response.ok) {
          setFeedback({ tone: "bad", text: payload?.error || "Não foi possível excluir os arquivos." });
          return;
        }

        setSelected(new Set());
        setFeedback({
          tone: "good",
          text: `${number(payload?.deletedFiles || ids.length)} arquivo(s) excluído(s) da base; ${number(payload?.deletedRows || 0)} registro(s) importado(s) removido(s).`,
        });
        router.refresh();
      } catch {
        setFeedback({ tone: "bad", text: "Falha de conexão ao excluir os arquivos." });
      }
    });
  }

  return (
    <Card className="settings-panel">
      <div className="section-header">
        <div>
          <span>Arquivos</span>
          <h2>Histórico processado</h2>
        </div>
        <FileClock size={20} aria-hidden="true" />
      </div>

      <div
        role="tablist"
        aria-label="Categorias de arquivos processados"
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}
      >
        {MODULES.map((item) => {
          const count = item.key === "all" ? files.length : counts.get(item.key) || 0;
          return (
            <Button
              key={item.key}
              type="button"
              size="sm"
              variant={activeTab === item.key ? "primary" : "secondary"}
              role="tab"
              aria-selected={activeTab === item.key}
              onClick={() => changeTab(item.key)}
            >
              {item.label} ({number(count)})
            </Button>
          );
        })}
      </div>

      <div
        className="toolbar-row"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}
      >
        <label className="checkbox-row" style={{ minHeight: 38 }}>
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleVisible}
            disabled={!visibleFiles.length || pending}
          />
          <span>Selecionar todos desta aba</span>
        </label>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
            {selected.size ? `${number(selected.size)} selecionado(s)` : `${number(visibleFiles.length)} arquivo(s) nesta categoria`}
          </span>
          <Button
            type="button"
            size="sm"
            variant="danger"
            icon={<Trash2 size={16} aria-hidden="true" />}
            onClick={deleteSelected}
            disabled={!selected.size || pending}
          >
            {pending ? "Excluindo..." : "Excluir da base"}
          </Button>
        </div>
      </div>

      {feedback ? (
        <div className={feedback.tone === "good" ? "inline-success" : "inline-warning"} style={{ marginBottom: 12 }}>
          {feedback.text}
        </div>
      ) : null}

      <div className="data-table-shell">
        <table className="data-table">
          <thead>
            <tr>
              <th aria-label="Selecionar" style={{ width: 42 }} />
              <th>Módulo</th>
              <th>Arquivo</th>
              <th>Competência</th>
              <th>Linhas</th>
              <th>Status</th>
              <th>Processado em</th>
            </tr>
          </thead>
          <tbody>
            {visibleFiles.length ? visibleFiles.map((file) => (
              <tr key={file.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Selecionar ${file.file_name || "arquivo"}`}
                    checked={selected.has(file.id)}
                    onChange={() => toggleOne(file.id)}
                    disabled={pending}
                  />
                </td>
                <td>{moduleLabel(file.module_key)}</td>
                <td><strong>{file.file_name || "-"}</strong></td>
                <td>{file.competencia || "-"}</td>
                <td>{number(file.row_count || 0)}</td>
                <td><Badge tone={file.status === "processed" ? "success" : "warning"}>{file.status || "-"}</Badge></td>
                <td>{formatDate(file.processed_at)}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={7}>
                  <div style={{ padding: "26px 12px", textAlign: "center", color: "var(--text-muted)" }}>
                    Nenhum arquivo processado nesta categoria.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
