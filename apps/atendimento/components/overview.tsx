"use client";
import Link from "next/link";
import {
  Clock3,
  FileQuestion,
  MessageSquare,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";
import { KpiCard, Panel, StatusBadge } from "@alc/ui/components";
import { useData, when } from "./data";
type OverviewData = {
  open: number;
  proof: number;
  penalty: number;
  human: number;
  pending: number;
  unread: number;
  competence: string;
  source: { lastSync?: string };
  collector: { enabled: boolean; lastSync: string | null; completed: boolean };
  queue: {
    id: string;
    name: string;
    phone: string;
    channel: string;
    status: string;
    unread: number;
    updated_at: string;
  }[];
};
export function Overview() {
  const { data, error, refresh } = useData<OverviewData>("overview", 15_000);
  return (
    <main className="page">
      <div className="page-title">
        <div>
          <p className="eyebrow">MONITORAMENTO OPERACIONAL</p>
          <h1>Visão Geral</h1>
        </div>
        <button
          className="icon-button"
          title="Atualizar indicadores"
          aria-label="Atualizar indicadores"
          onClick={() => void refresh()}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <div className="stats">
        <KpiCard
          label="PNRs em aberto"
          value={String(data?.open ?? "—")}
          detail={data?.competence || "Competência vigente"}
          icon={<FileQuestion size={18} />}
          tone="red"
        />
        <KpiCard
          label="Com penalidade"
          value={String(data?.penalty ?? "—")}
          detail={`${data?.proof ?? "—"} aguardando comprovante`}
          icon={<ShieldAlert size={18} />}
          tone="amber"
        />
        <KpiCard
          label="Atendimento humano"
          value={String(data?.human ?? "—")}
          detail={`${data?.unread ?? "—"} mensagens não lidas`}
          icon={<MessageSquare size={18} />}
        />
        <KpiCard
          label="Pendentes"
          value={String(data?.pending ?? "—")}
          detail="Aguardando continuidade"
          icon={<Clock3 size={18} />}
          tone="amber"
        />
      </div>
      <div className="overview-grid">
        <Panel
          title="Fila da equipe"
          action={
            <Link className="text-link" href="/conversas?status=all">
              Ver caixa
            </Link>
          }
        >
          {!data && !error && <div role="status">Carregando fila…</div>}
          {data?.queue.map((c) => (
            <Link
              className="queue-row"
              href={`/conversas?id=${c.id}&status=all`}
              key={c.id}
            >
              <span>
                <strong>{c.name || `+${c.phone}`}</strong>
                <small>
                  {c.channel === "driver" ? "Motoristas" : "Disparo Cliente"} ·{" "}
                  {when(c.updated_at)}
                </small>
              </span>
              <StatusBadge tone={c.status === "pending" ? "amber" : "neutral"}>
                {c.status === "pending" ? "Pendente" : "Atendente"} · {c.unread}{" "}
                não lidas
              </StatusBadge>
            </Link>
          ))}
          {data && !data.queue.length && (
            <div className="empty">Nenhuma pendência na fila.</div>
          )}
        </Panel>
        <Panel title="Coleta Mercado Livre">
          <dl>
            <dt>Competência</dt>
            <dd>{data?.competence || "—"}</dd>
            <dt>Última sincronização</dt>
            <dd>{when(data?.source.lastSync)}</dd>
            <dt>Coletor</dt>
            <dd>
              {data?.collector.enabled
                ? "Agendado · 30 minutos"
                : "Não agendado"}
            </dd>
            <dt>Carga</dt>
            <dd>
              {data?.collector.completed
                ? "Última coleta concluída"
                : "Coleta ainda não concluída"}
            </dd>
          </dl>
          <div className="actions">
            <Link className="primary" href="/conversas?channel=client">
              Disparo Cliente
            </Link>
            <Link className="text-link" href="/conversas?channel=driver">
              Atendimento motoristas
            </Link>
          </div>
        </Panel>
      </div>
    </main>
  );
}
