"use client";
import { useEffect, useState, type ReactNode } from "react";
import { request } from "./collector";
import { connectorStatus, type ConnectorPing } from "../lib/connector-status";
import connector from "alc-pnr-connector/package.json";
import Link from "next/link";
import {
  Banknote,
  Clock3,
  FileQuestion,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  GitCompareArrows,
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
  automated?: number;
  purchase_value_confirmed?: string | null;
  purchase_value_unknown?: number;
  penalty_value_confirmed?: string | null;
  proof_value_confirmed?: string | null;
  authorship?: Record<string, number>;
  conversationsByOperator?: {
    assigned_to: string;
    operator_name?: string;
    conversations: number;
  }[];
  recentCases?: {
    case_id: string;
    classification: string;
    base_key: string;
    sigla: string;
    updated_at: string;
  }[];
  competence: string;
  source: {
    lastSync?: string | null;
    lastCompletedSync?: string | null;
    syncStats?: Record<string, number>;
  };
  collector: {
    enabled: boolean;
    lastSync: string | null;
    completed: boolean;
    channelSync?: Partial<
      Record<
        "client" | "driver",
        {
          lastSync: string;
          completed: boolean;
        }
      >
    >;
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
  const [collecting, setCollecting] = useState<"client" | "driver" | null>(
    null,
  );
  const [collectionNotice, setCollectionNotice] = useState("");
  const [collectionError, setCollectionError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const syncStats = data?.source.syncStats || {};
  const syncStale =
    data?.source.lastCompletedSync &&
    now - Date.parse(data.source.lastCompletedSync) > 45 * 60_000;
  const brl = (value: string | null | undefined) =>
    value == null || value.trim() === "" || !Number.isFinite(Number(value))
      ? "—"
      : Number(value).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });
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
        throw new Error(
          "O Case Center não pôde ser preparado em segundo plano. Confira a sessão Mercado Livre e o conector.",
        );
      }
      const result = await request<{ message: string }>("ATENDIMENTO_COLLECT", {
        channel,
      });
      setCollectionNotice(
        result.message || "Coleta de dados concluída, sem disparos.",
      );
      await refresh();
    } catch (cause) {
      setCollectionError(true);
      setCollectionNotice(
        cause instanceof Error
          ? cause.message
          : "Não foi possível coletar dados.",
      );
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
          detail={`${data?.automated ?? "—"} automatizados`}
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
            <dd>{when(data?.source.lastSync ?? undefined)}</dd>
            <dt>Último sync concluído</dt>
            <dd>
              {data?.source.lastCompletedSync
                ? when(data.source.lastCompletedSync)
                : "Sem conclusão confirmada"}
            </dd>
            <dt>Atualidade</dt>
            <dd>
              {syncStale
                ? "Sincronização desatualizada"
                : data?.source.lastCompletedSync
                  ? "Sincronização recente"
                  : "Ainda sem sincronização concluída"}
            </dd>
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
            Sincronização de dados do Case Center. Estes botões não enviam
            mensagens.
          </p>
          <div className="actions">
            <button
              className="primary"
              type="button"
              disabled={collecting !== null}
              onClick={() => void collect("client")}
            >
              {collecting === "client"
                ? "Coletando clientes…"
                : "Coletar Cliente"}
            </button>
            <button
              type="button"
              disabled={collecting !== null}
              onClick={() => void collect("driver")}
            >
              {collecting === "driver"
                ? "Coletando motoristas…"
                : "Coletar Driver"}
            </button>
          </div>
          <dl>
            <dt>Última coleta de clientes</dt>
            <dd>{when(data?.collector.channelSync?.client?.lastSync)}</dd>
            <dt>Última coleta de motoristas</dt>
            <dd>{when(data?.collector.channelSync?.driver?.lastSync)}</dd>
          </dl>
          {collectionNotice ? (
            <p
              role="status"
              className={collectionError ? "notice error" : "notice"}
            >
              {collectionNotice}
              {collectionError ? (
                <>
                  {" "}
                  <Link href="/admin">Verificar extensão nos Ajustes</Link>
                </>
              ) : null}
            </p>
          ) : null}
        </Panel>
      </div>
      <section className="sync-summary" aria-labelledby="sync-title">
        <h2 id="sync-title">Resumo da sincronização</h2>
        <SyncGroup
          title="Indicadores financeiros"
          icon={<Banknote size={16} />}
          items={[
            [
              "PNRs abertas",
              brl(data?.purchase_value_confirmed),
              "Subtotal confirmado",
            ],
            [
              "Com penalidade",
              brl(data?.penalty_value_confirmed),
              "Subtotal confirmado",
            ],
            [
              "Aguardando comprovante",
              brl(data?.proof_value_confirmed),
              "Subtotal confirmado",
            ],
            [
              "PNRs sem valor confirmado",
              data?.purchase_value_unknown,
              "Valor desconhecido, não incluído nos subtotais",
            ],
          ]}
        />
        <SyncGroup
          title="Sincronização"
          icon={<RefreshCw size={16} />}
          items={[
            ["PNRs novas", syncStats.new],
            ["PNRs atualizadas", syncStats.updated],
            ["PNRs inalteradas", syncStats.unchanged],
            ["PNRs obsoletas", syncStats.stale],
            ["Erros na última sincronização", syncStats.errors],
          ]}
        />
        <SyncGroup
          title="Mudanças detectadas"
          icon={<GitCompareArrows size={16} />}
          items={[
            ["Classificações alteradas", syncStats.classificationChanged],
            ["Telefones verificados adicionados", syncStats.verifiedPhoneAdded],
            ["Bases alteradas", syncStats.scopeChanged],
            [
              "Contatos verificados em conflito",
              syncStats.verifiedContactConflicts,
            ],
          ]}
        />
        <SyncGroup
          title="Atendimento"
          icon={<MessageSquare size={16} />}
          items={[
            ["Mensagens por IA", data?.authorship?.ai],
            ["Mensagens humanas", data?.authorship?.human],
          ]}
        />
      </section>
      <div className="overview-grid sync-secondary">
        <Panel title="Conversas por atendente">
          <ul className="sync-list">
            {data?.conversationsByOperator?.map((item) => (
              <li key={item.assigned_to}>
                <span>{item.operator_name || "Atendente indisponível"}</span>
                <strong>{item.conversations}</strong>
              </li>
            ))}
          </ul>
          {!data?.conversationsByOperator?.length && (
            <p className="muted">
              {data
                ? "Nenhuma conversa atribuída."
                : "Dados ainda indisponíveis."}
            </p>
          )}
        </Panel>
        <Panel title="PNRs recentemente atualizadas">
          <ul className="sync-list">
            {data?.recentCases?.map((item) => (
              <li key={item.case_id}>
                <strong>PNR {item.case_id}</strong>
                <span>
                  {item.sigla || item.base_key} · {when(item.updated_at)}
                </span>
              </li>
            ))}
          </ul>
          {!data?.recentCases?.length && (
            <p className="muted">
              {data
                ? "Sem atualizações recentes."
                : "Dados ainda indisponíveis."}
            </p>
          )}
        </Panel>
      </div>
    </main>
  );
}

function SyncGroup({
  title,
  items,
  icon,
}: {
  title: string;
  items: [string, string | number | undefined, string?][];
  icon: ReactNode;
}) {
  return (
    <section className="sync-group" aria-label={title}>
      <h3>{title}</h3>
      <div className="sync-metrics">
        {items.map(([label, value, detail]) => (
          <KpiCard
            key={label}
            label={label}
            value={
              typeof value === "number"
                ? value.toLocaleString("pt-BR")
                : (value ?? "—")
            }
            detail={detail || ""}
            icon={icon}
          />
        ))}
      </div>
    </section>
  );
}
