"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Bell, Download, FileText, LogOut, MessageSquarePlus, PackageSearch, RefreshCw } from "lucide-react";
import { driverSignOutAction } from "./login/actions";
import { formatCurrency } from "@/components/ui";

interface PortalTicket { id: string; type: string; operationalId: string; baseName: string; value: number; status: string; history?: Array<{ detail: string }> }
interface PortalDocument { id: string; title: string; period?: string; status: string }
interface PortalDispute { id: string; document_id: string; reason: string; status: string; decision?: string; description?: string; driver_payment_documents?: { title?: string } }
interface PortalNotification { id: string; read_at?: string | null }
interface PortalPayload {
  driver?: { fullName?: string; baseName?: string; baseKey?: string };
  tickets?: PortalTicket[];
  documents?: PortalDocument[];
  disputes?: PortalDispute[];
  notifications?: PortalNotification[];
}

function readError(response: Response, fallback: string) {
  return response.json().then((body) => body.error || fallback).catch(() => fallback);
}

export function DriverPortalApp() {
  const [data, setData] = useState<PortalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [filters, setFilters] = useState({ status: "Todos", type: "Todos" });
  const [contest, setContest] = useState({ documentId: "", reason: "", description: "", reference: "", amount: "" });

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/driver-portal", { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response, "Falha ao carregar portal."));
      setData(await response.json());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao carregar portal.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function loadInitial() {
      setLoading(true);
      setMessage("");
      try {
        const response = await fetch("/api/driver-portal", { cache: "no-store" });
        if (!response.ok) throw new Error(await readError(response, "Falha ao carregar portal."));
        const payload = await response.json();
        if (active) setData(payload);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "Falha ao carregar portal.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadInitial();
    return () => {
      active = false;
    };
  }, []);

  const tickets = useMemo(() => data?.tickets ?? [], [data]);
  const documents = useMemo(() => data?.documents ?? [], [data]);
  const disputes = useMemo(() => data?.disputes ?? [], [data]);
  const notifications = useMemo(() => data?.notifications ?? [], [data]);
  const filteredTickets = useMemo(() => tickets.filter((ticket) => {
    if (filters.status !== "Todos" && ticket.status !== filters.status) return false;
    if (filters.type !== "Todos" && ticket.type !== filters.type) return false;
    return true;
  }), [tickets, filters]);

  async function openDocument(id: string) {
    const response = await fetch(`/api/driver-documents/${id}/download`, { cache: "no-store" });
    if (!response.ok) {
      setMessage(await readError(response, "Falha ao abrir PDF."));
      return;
    }
    const payload = await response.json();
    window.open(payload.url, "_blank", "noopener,noreferrer");
  }

  async function createDispute() {
    setMessage("");
    const response = await fetch("/api/driver-disputes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contest),
    });
    if (!response.ok) {
      setMessage(await readError(response, "Falha ao abrir contestação."));
      return;
    }
    setMessage("Contestação aberta.");
    setContest({ documentId: "", reason: "", description: "", reference: "", amount: "" });
    await load();
  }

  if (loading) return <main className="driver-portal"><div className="driver-empty">Carregando portal...</div></main>;

  return (
    <main className="driver-portal">
      <header className="driver-portal__header">
        <div><span>Portal do Motorista</span><h1>{data?.driver?.fullName ?? "Motorista ALC"}</h1><p>{data?.driver?.baseName ?? data?.driver?.baseKey}</p></div>
        <form action={driverSignOutAction}><button className="icon-button" title="Sair"><LogOut size={18} /></button></form>
      </header>
      {message ? <p className="driver-message">{message}</p> : null}
      <section className="driver-summary">
        <article><PackageSearch size={20} /><strong>{tickets.length}</strong><span>Pendências</span></article>
        <article><FileText size={20} /><strong>{documents.length}</strong><span>PDFs</span></article>
        <article><MessageSquarePlus size={20} /><strong>{disputes.length}</strong><span>Contestações</span></article>
        <article><Bell size={20} /><strong>{notifications.filter((item) => !item.read_at).length}</strong><span>Novos avisos</span></article>
      </section>
      <section className="driver-card">
        <div className="driver-card__head"><h2>Minhas pendências</h2><button className="table-action" onClick={() => void load()}><RefreshCw size={15} /></button></div>
        <div className="driver-filters"><select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option>Todos</option>{[...new Set(tickets.map((ticket) => ticket.status))].map((status) => <option key={status}>{status}</option>)}</select><select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option>Todos</option>{[...new Set(tickets.map((ticket) => ticket.type))].map((type) => <option key={type}>{type}</option>)}</select></div>
        {filteredTickets.length ? <div className="driver-ticket-list">{filteredTickets.map((ticket) => <article key={ticket.id}><div><strong>{ticket.operationalId}</strong><span>{ticket.type.replaceAll("_", " ")} • {ticket.baseName}</span></div><b>{formatCurrency(ticket.value)}</b><small>{ticket.status.replaceAll("_", " ")}</small>{ticket.history?.[0] ? <p>{ticket.history[0].detail}</p> : null}</article>)}</div> : <div className="driver-empty"><AlertCircle size={18} />Nenhuma pendência no filtro atual.</div>}
      </section>
      <section className="driver-card">
        <div className="driver-card__head"><h2>Meus pagamentos</h2></div>
        {documents.length ? <div className="driver-doc-list">{documents.map((doc) => <article key={doc.id}><div><strong>{doc.title}</strong><span>{doc.period ?? "Período não informado"} • {doc.status}</span></div><button className="secondary-button primary-button--small" onClick={() => void openDocument(doc.id)}><Download size={14} />Abrir PDF</button><button className="danger-button" onClick={() => setContest({ ...contest, documentId: doc.id })}><MessageSquarePlus size={14} />Contestar</button></article>)}</div> : <div className="driver-empty">Nenhum PDF publicado para sua conta.</div>}
      </section>
      <section className="driver-card">
        <div className="driver-card__head"><h2>Nova contestação</h2></div>
        <div className="driver-contest-form">
          <select value={contest.documentId} onChange={(event) => setContest({ ...contest, documentId: event.target.value })}><option value="">Selecione o PDF</option>{documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.title}</option>)}</select>
          <input value={contest.reason} onChange={(event) => setContest({ ...contest, reason: event.target.value })} placeholder="Motivo" />
          <input value={contest.reference} onChange={(event) => setContest({ ...contest, reference: event.target.value })} placeholder="Referência do lançamento" />
          <input value={contest.amount} onChange={(event) => setContest({ ...contest, amount: event.target.value })} placeholder="Valor" />
          <textarea value={contest.description} onChange={(event) => setContest({ ...contest, description: event.target.value })} placeholder="Descreva a contestação" />
          <button className="primary-button" disabled={!contest.documentId || !contest.reason || !contest.description} onClick={() => void createDispute()}><MessageSquarePlus size={16} />Abrir contestação</button>
        </div>
      </section>
      <section className="driver-card">
        <div className="driver-card__head"><h2>Histórico de contestações</h2></div>
        {disputes.length ? <div className="driver-ticket-list">{disputes.map((dispute) => <article key={dispute.id}><div><strong>{dispute.reason}</strong><span>{dispute.driver_payment_documents?.title ?? dispute.document_id}</span></div><small>{dispute.status.replaceAll("_", " ")}</small><p>{dispute.decision || dispute.description}</p></article>)}</div> : <div className="driver-empty">Nenhuma contestação aberta.</div>}
      </section>
    </main>
  );
}
