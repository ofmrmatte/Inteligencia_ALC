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
import { KpiCard } from "@alc/ui/components";
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
};
export function Overview() {
  const { data, error, refresh } = useData<OverviewData>("overview", 15_000);
  const [collecting, setCollecting] = useState(false);
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
  async function collect() {
    setCollecting(true);
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
      // No channel means both client and driver data in one collect-only pass.
      const result = await request<{ message: string }>("ATENDIMENTO_COLLECT");
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
      setCollecting(false);
    }
  }
  return (
    <main className="page">
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <div className="overview-heading"><div><h2>Painel operacional</h2><p className="muted">Panorama da competência vigente e dos atendimentos.</p></div></div>
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
      <section className="overview-collector" aria-labelledby="overview-collector-title">
        <div className="overview-collector-header">
          <div>
            <h2 id="overview-collector-title">Coleta Mercado Livre</h2>
            <p className="muted">Sincronização única do Case Center para clientes e motoristas, sem envio ou enfileiramento de mensagens.</p>
          </div>
          <button
            className="primary"
            type="button"
            disabled={collecting}
            onClick={() => void collect()}
          >
            <RefreshCw size={16} /> {collecting ? "Coletando dados…" : "Coletar geral"}
          </button>
        </div>
        <dl className="overview-collector-details">
          <div><dt>Competência</dt><dd>{data?.competence || "—"}</dd></div>
          <div><dt>Última sincronização</dt><dd>{when(data?.source.lastSync ?? undefined)}</dd></div>
          <div><dt>Conclusão confirmada</dt><dd>{data?.source.lastCompletedSync ? when(data.source.lastCompletedSync) : "Ainda não confirmada"}</dd></div>
          <div><dt>Atualidade</dt><dd>{syncStale ? "Desatualizada" : data?.source.lastCompletedSync ? "Atualizada" : "Pendente"}</dd></div>
          <div><dt>Agendamento</dt><dd>{data?.collector.enabled ? "A cada 30 minutos" : "Não agendado"}</dd></div>
          <div><dt>Última coleta</dt><dd>{data?.collector.completed ? "Concluída" : "Ainda não concluída"}</dd></div>
        </dl>
        <div className="overview-collector-foot">
          <span>Clientes: <strong>{when(data?.collector.channelSync?.client?.lastSync)}</strong></span>
          <span>Motoristas: <strong>{when(data?.collector.channelSync?.driver?.lastSync)}</strong></span>
          <span className={Number(syncStats.errors ?? 0) > 0 ? "overview-sync-errors" : ""}>
            Erros na última sincronização: <strong>{(syncStats.errors ?? 0).toLocaleString("pt-BR")}</strong>
          </span>
        </div>
        {collectionNotice && (
          <p role="status" className={collectionError ? "notice error" : "notice"}>
            {collectionNotice}
            {collectionError && <> <Link href="/admin">Verificar extensão nos Ajustes</Link></>}
          </p>
        )}
      </section>
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
        <div className="overview-activity" aria-label="Mensagens por autoria">
          <span>Mensagens por IA <strong>{data?.authorship?.ai?.toLocaleString("pt-BR") ?? "—"}</strong></span>
          <span>Mensagens humanas <strong>{data?.authorship?.human?.toLocaleString("pt-BR") ?? "—"}</strong></span>
        </div>
      </section>
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
