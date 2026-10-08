"use client";
import { useData, labels, when } from "./data";
type Job = {
  id: string;
  case_id: string;
  channel: string;
  phone: string;
  status: string;
  error: string;
  created_at: string;
  provider_id: string;
};
export function Dispatches() {
  const { data, error } = useData<{ records: Job[] }>("outbox", 8_000);
  return (
    <main className="page">
      <div className="page-title">
        <div>
          <p className="eyebrow">MENSAGENS OPERACIONAIS</p>
          <h1>Disparos e histórico</h1>
          <p className="muted">
            Notificações de novas PNRs e contatos de tratativa.
          </p>
        </div>
      </div>
      <div className="notice">
        Um contato inicial por PNR e telefone. Envios com resposta incerta do
        provedor exigem conferência antes de qualquer reenvio.
      </div>
      {error ? <p className="notice error">{error}</p> : null}
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Canal</th>
              <th>Contato</th>
              <th>PNR</th>
              <th>Status</th>
              <th>Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {data?.records.map((r) => (
              <tr key={r.id}>
                <td>{when(r.created_at)}</td>
                <td>{labels[r.channel]}</td>
                <td>+{r.phone}</td>
                <td>{r.case_id || "Conversa"}</td>
                <td>
                  <span className="badge">{labels[r.status] || r.status}</span>
                </td>
                <td>
                  {r.error || r.provider_id || "Aguardando processamento"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.records.length ? (
          <div className="empty">
            <h3>Histórico ainda vazio</h3>
            <p>Envios realizados e confirmações da Meta aparecerão aqui.</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
