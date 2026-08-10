"use client";

import Link from "next/link";
import { Bell, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { AlertSeverity, OperationalAlertsResponse } from "@/features/operational-alerts/domain";

type AlertState = "loading" | "ready" | "error";

function emptyPayload(): OperationalAlertsResponse {
  return { total: 0, generatedAt: "", alerts: [], errors: [] };
}

function severityLabel(severity: AlertSeverity) {
  if (severity === "critical") return "Crítico";
  if (severity === "attention") return "Atenção";
  return "Informativo";
}

function severityTone(severity: AlertSeverity): "danger" | "warning" | "neutral" {
  if (severity === "critical") return "danger";
  if (severity === "attention") return "warning";
  return "neutral";
}

export function OperationalAlertsButton() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AlertState>("loading");
  const [payload, setPayload] = useState<OperationalAlertsResponse>(() => emptyPayload());
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const visibleCount = payload.total > 99 ? "99+" : payload.total.toLocaleString("pt-BR");

  const groupedAlerts = useMemo(() => {
    return payload.alerts.reduce<Record<string, typeof payload.alerts>>((groups, alert) => {
      const label = alert.module === "desvios_pnr"
        ? "Desvios PNR"
        : alert.module === "pacotes_faltantes"
          ? "Pacotes Faltantes"
          : "Processamento";
      groups[label] = [...(groups[label] || []), alert];
      return groups;
    }, {});
  }, [payload]);

  async function loadAlerts(showLoading = true) {
    if (showLoading) setState("loading");
    try {
      const response = await fetch("/api/alerts", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Falha ao carregar alertas.");
      const data = await response.json() as OperationalAlertsResponse;
      setPayload(data);
      setState("ready");
    } catch {
      setPayload(emptyPayload());
      setState("error");
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/alerts", { headers: { Accept: "application/json" }, signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Falha ao carregar alertas.");
        return response.json() as Promise<OperationalAlertsResponse>;
      })
      .then((data) => {
        setPayload(data);
        setState("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setPayload(emptyPayload());
        setState("error");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="alerts-menu">
      <button
        ref={buttonRef}
        type="button"
        className="icon-button alerts-menu__trigger"
        aria-label={`Alertas operacionais: ${payload.total.toLocaleString("pt-BR")}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell size={18} aria-hidden="true" />
        {payload.total > 0 ? <span className="alerts-menu__badge">{visibleCount}</span> : null}
      </button>

      {open ? (
        <div ref={panelRef} className="alerts-menu__panel" role="dialog" aria-label="Central de Alertas Operacionais">
          <div className="alerts-menu__header">
            <div>
              <span>Central</span>
              <strong>Alertas operacionais</strong>
            </div>
            <div className="alerts-menu__actions">
              <button type="button" className="icon-button" aria-label="Atualizar alertas" onClick={() => void loadAlerts()}>
                <RefreshCw size={16} aria-hidden="true" />
              </button>
              <button type="button" className="icon-button" aria-label="Fechar alertas" onClick={() => setOpen(false)}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          {state === "loading" ? (
            <div className="alerts-menu__placeholder" aria-live="polite">Carregando alertas...</div>
          ) : null}

          {state === "error" ? (
            <div className="alerts-menu__placeholder" role="alert">Não foi possível carregar os alertas agora.</div>
          ) : null}

          {state === "ready" && !payload.alerts.length ? (
            <div className="alerts-menu__placeholder">Nenhuma pendência operacional encontrada.</div>
          ) : null}

          {state === "ready" && Object.entries(groupedAlerts).map(([module, alerts]) => (
            <section className="alerts-menu__group" key={module} aria-label={module}>
              <h2>{module}</h2>
              {alerts.map((alert) => (
                <Link key={alert.id} href={alert.href} className="alerts-menu__item" onClick={() => setOpen(false)}>
                  <div>
                    <Badge tone={severityTone(alert.severity)}>{severityLabel(alert.severity)}</Badge>
                    <strong>{alert.title}</strong>
                  </div>
                  <span>{alert.summary}</span>
                  <small>{alert.context}</small>
                </Link>
              ))}
            </section>
          ))}

          {payload.errors.length ? (
            <div className="alerts-menu__warning">Algumas fontes não responderam ao cálculo.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
