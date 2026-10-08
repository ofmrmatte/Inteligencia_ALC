"use client";
import Link from "next/link";
import {
  ArrowUpRight,
  MessageSquare,
  ClipboardList,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { useData, when } from "./data";
type OverviewData = {
  open: number;
  proof: number;
  penalty: number;
  human: number;
  conversations: number;
  competence: string;
  source: { lastSync?: string; origin?: string };
};
export function Overview() {
  const { data, error } = useData<OverviewData>("overview", 30_000);
  return (
    <main className="page">
      <div className="page-title">
        <div>
          <p className="eyebrow">ATENDIMENTO & PREVENÇÃO DE PERDAS</p>
          <h1>Sua operação, em conversa.</h1>
          <p className="muted">
            Acompanhe as PNRs e os atendimentos da equipe.
          </p>
        </div>
        <Link className="primary" href="/conversas">
          Abrir conversas
          <ArrowUpRight size={17} />
        </Link>
      </div>
      {error ? (
        <p role="alert" className="notice error">
          {error}
        </p>
      ) : null}
      <div className="stats">
        {[
          ["PNRs em aberto", data?.open, "Competência vigente"],
          ["Aguardando comprovante", data?.proof, "Contato com cliente"],
          ["Com penalidade", data?.penalty, "Tratativa e acompanhamento"],
          ["Aguardando equipe", data?.human, "Atendimento humano"],
        ].map(([label, value, note]) => (
          <article className="stat" key={String(label)}>
            <p>{label}</p>
            <strong>{value ?? "—"}</strong>
            <small>{note}</small>
          </article>
        ))}
      </div>
      <div className="overview-grid">
        <section className="card">
          <div className="card-heading">
            <h2>Do caso à resolução</h2>
            <span className="badge">Dois canais</span>
          </div>
          <Link className="flow-link" href="/pnrs">
            <span className="icon-tile">
              <ClipboardList />
            </span>
            <div>
              <h3>Tratativas de clientes</h3>
              <p>Recebimento, data, produto e encaminhamento à equipe.</p>
            </div>
            <ArrowUpRight />
          </Link>
          <Link className="flow-link" href="/conversas">
            <span className="icon-tile">
              <MessageSquare />
            </span>
            <div>
              <h3>Consultas de motoristas</h3>
              <p>Nome, base e telefone validados para consultar suas PNRs.</p>
            </div>
            <ArrowUpRight />
          </Link>
          <div className="inline-info">
            <ShieldCheck size={18} />
            Ao assumir uma conversa, a equipe pausa o robô.
          </div>
        </section>
        <section className="card source-card">
          <Clock size={24} />
          <p className="eyebrow">ORIGEM DOS DADOS</p>
          <h2>Uma operação atualizada.</h2>
          <p>
            Coleta a cada 30 minutos, enquanto o computador de teste e as abas
            autenticadas estiverem disponíveis.
          </p>
          <dl>
            <dt>Competência</dt>
            <dd>{data?.competence || "—"}</dd>
            <dt>Última atualização da fonte</dt>
            <dd>{when(data?.source?.lastSync)}</dd>
          </dl>
          <Link href="/admin" className="text-link">
            Ver integrações →
          </Link>
        </section>
      </div>
      <div className="notice">
        As competências anteriores ficam disponíveis para consultas dos
        motoristas. Casos encerrados são preservados no histórico.
      </div>
    </main>
  );
}
