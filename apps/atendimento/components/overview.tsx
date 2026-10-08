"use client";
import { useState } from "react";
import { request } from "./collector";
import { connectorStatus, type ConnectorPing } from "../lib/connector-status";
import connector from "alc-pnr-connector/package.json";
import Link from "next/link";
import {
  Clock3,
  FileQuestion,
  MessageSquare,
  ShieldAlert,
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
  collector: {
    enabled: boolean;
    lastSync: string | null;
    completed: boolean;
    channelSync?: Partial<Record<"client" | "driver", {
      lastSync: string;
      completed: boolean;
    }>>;
  };
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
  const [collecting, setCollecting] = useState<"client" | "driver" | null>(null);
  const [collectionNotice, setCollectionNotice] = useState("");
  const [collectionError, setCollectionError] = useState(false);
  async function collect(channel: "client" | "driver") {
    setCollecting(channel);
    setCollectionNotice("");
    setCollectionError(false);
    try {
      const ping = await request<ConnectorPing>("PING", {}, 20_000);
      const status = connectorStatus(ping, connector.version, true);
      if (!status.ready) {
        throw new Error(`${status.label} Acesse Ajustes > Conector & dados.`);
      }
      if (!ping.mlTabAvailable) {
        throw new Error("O Case Center não pôde ser preparado em segundo plano. Confira a sessão Mercado Livre e o conector.");
      }
      const result = await request<{ message: string }>("ATENDIMENTO_COLLECT", { channel });
      setCollectionNotice(result.message || "Coleta de dados concluída, sem disparos.");
      await refresh();
    } catch (cause) {
      setCollectionError(true);
      setCollectionNotice(cause instanceof Error ? cause.message : "Não foi possível coletar dados.");
    } finally {
      setCollecting(null);
    }
  }
  return (
    <main className="page">

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
          <p className="muted">
            Sincronização de dados do Case Center. Estes botões não enviam mensagens.
          </p>
          <div className="actions">
            <button
              className="primary"
              type="button"
              disabled={collecting !== null}
              onClick={() => void collect("client")}
            >
              {collecting === "client" ? "Coletando clientes…" : "Coletar Cliente"}
            </button>
            <button
              type="button"
              disabled={collecting !== null}
              onClick={() => void collect("driver")}
            >
              {collecting === "driver" ? "Coletando motoristas…" : "Coletar Driver"}
            </button>
          </div>
          <dl>
            <dt>Última coleta de clientes</dt>
            <dd>{when(data?.collector.channelSync?.client?.lastSync)}</dd>
            <dt>Última coleta de motoristas</dt>
            <dd>{when(data?.collector.channelSync?.driver?.lastSync)}</dd>
          </dl>
          {collectionNotice ? (
            <p role="status" className={collectionError ? "notice error" : "notice"}>
              {collectionNotice}
              {collectionError ? <> <Link href="/admin">Verificar extensão nos Ajustes</Link></> : null}
            </p>
          ) : null}
        </Panel>
      </div>
    </main>
  );
}
