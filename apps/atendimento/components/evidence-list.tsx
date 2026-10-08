"use client";
import { useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { useData, when } from "./data";

type EvidenceRow = {
  id: string;
  phone: string;
  case_id: string;
  updated_at: string;
  message_count: number;
};

export function EvidenceList() {
  const { data, error } = useData<{ records: EvidenceRow[]; limit: number }>("evidence");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  async function saveEvidence(row: EvidenceRow) {
    setBusy(row.id);
    setNotice("");
    try {
      const response = await fetch(`/api/evidence/${encodeURIComponent(row.id)}`, {
        credentials: "same-origin", cache: "no-store",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || "Não foi possível gerar o comprovante.");
      }
      const archive = await response.blob();
      const fileUrl = URL.createObjectURL(archive);
      try {
        const anchor = document.createElement("a");
        anchor.href = fileUrl;
        anchor.download = `comprovante-${row.case_id}.zip`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        URL.revokeObjectURL(fileUrl);
      }
      setNotice("Pacote gerado: pasta da PNR, prints numerados e manifesto de integridade.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Comprovante indisponível.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <main className="page">
      <div className="page-tools">
        <p className="muted">
          Comprovantes em imagens curtas no estilo de conversa WhatsApp Web, extraídos do histórico real.
        </p>
        <span className="badge">Sem nomes de clientes</span>
      </div>
      <p className="notice">
        O pacote ZIP contém a pasta com o ID da PNR, imagens print-01.png, print-02.png etc. e um manifesto. Não é uma
        captura nativa do WhatsApp Web. A exportação exige tratativa concluída, pelo
        menos três mensagens e nenhum trecho desconhecido, pendente ou omitido.
      </p>
      {error ? <p role="alert" className="notice error">{error}</p> : null}
      {notice ? <p role="status" className="notice">{notice}</p> : null}
      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th>Contato</th><th>PNR / caso</th><th>Mensagens</th><th>Conclusão</th><th /></tr>
          </thead>
          <tbody>
            {(data?.records || []).map((row) => (
              <tr key={row.id}>
                <td>+{row.phone}</td>
                <td>{row.case_id}</td>
                <td>{row.message_count}</td>
                <td>{when(row.updated_at)}</td>
                <td>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void saveEvidence(row)}
                  >
                    <Download size={15} />
                    {busy === row.id ? "Gerando…" : "Baixar comprovantes ZIP"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.records.length ? (
          <div className="empty">
            <ShieldCheck size={25} />
            <h3>Nenhuma tratativa concluída</h3>
            <p>Os comprovantes estarão disponíveis quando houver conversas concluídas e verificáveis.</p>
          </div>
        ) : null}
      </div>
      {data && data.records.length >= data.limit ? (
        <p className="notice">Lista limitada a 200 conversas recentes; nenhuma conversa é excluída do banco.</p>
      ) : null}
    </main>
  );
}
