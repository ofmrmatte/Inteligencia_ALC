export type AlertSeverity = "critical" | "attention" | "info";

export type AlertModule = "desvios_pnr" | "pacotes_faltantes" | "processamento";

export type AlertCountInput = {
  pnrAwaitingProof: number;
  missingExpired: number;
  missingNearDeadline: number;
  missingPending: number;
  processingIssues: number;
  includeAdmin: boolean;
};

export type OperationalAlert = {
  id: string;
  module: AlertModule;
  severity: AlertSeverity;
  title: string;
  summary: string;
  context: string;
  count: number;
  href: string;
};

export type OperationalAlertsResponse = {
  total: number;
  generatedAt: string;
  alerts: OperationalAlert[];
  errors: string[];
};

function countText(count: number, singular: string, plural: string) {
  return `${count.toLocaleString("pt-BR")} ${count === 1 ? singular : plural}`;
}

export function buildOperationalAlerts(input: AlertCountInput): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];

  if (input.pnrAwaitingProof > 0) {
    alerts.push({
      id: "desvios-pnr-awaiting-proof",
      module: "desvios_pnr",
      severity: "attention",
      title: "PNRs aguardando comprovante",
      summary: countText(input.pnrAwaitingProof, "registro pendente", "registros pendentes"),
      context: "Status PNR existente: Aguardando Comprovante",
      count: input.pnrAwaitingProof,
      href: "/desvios-pnr?status=Aguardando+Comprovante",
    });
  }

  if (input.missingExpired > 0) {
    alerts.push({
      id: "pacotes-faltantes-expired",
      module: "pacotes_faltantes",
      severity: "critical",
      title: "Pacotes faltantes vencidos",
      summary: countText(input.missingExpired, "tratativa vencida", "tratativas vencidas"),
      context: "Situação de prazo existente: Vencido",
      count: input.missingExpired,
      href: "/pacotes-faltantes?prazo=Vencido",
    });
  }

  if (input.missingNearDeadline > 0) {
    alerts.push({
      id: "pacotes-faltantes-near-deadline",
      module: "pacotes_faltantes",
      severity: "attention",
      title: "Pacotes faltantes próximos do prazo",
      summary: countText(input.missingNearDeadline, "tratativa próxima do vencimento", "tratativas próximas do vencimento"),
      context: "Situação de prazo existente: Próximo do vencimento",
      count: input.missingNearDeadline,
      href: "/pacotes-faltantes?prazo=Pr%C3%B3ximo+do+vencimento",
    });
  }

  if (input.missingPending > 0) {
    alerts.push({
      id: "pacotes-faltantes-pending",
      module: "pacotes_faltantes",
      severity: "info",
      title: "Pacotes faltantes pendentes",
      summary: countText(input.missingPending, "caso pendente", "casos pendentes"),
      context: "Status de caso existente: Pendente",
      count: input.missingPending,
      href: "/pacotes-faltantes?statusCaso=Pendente",
    });
  }

  if (input.includeAdmin && input.processingIssues > 0) {
    alerts.push({
      id: "processing-files-issues",
      module: "processamento",
      severity: "critical",
      title: "Arquivos com processamento pendente ou erro",
      summary: countText(input.processingIssues, "arquivo fora de processed", "arquivos fora de processed"),
      context: "Alerta administrativo derivado de dashboard_files.status",
      count: input.processingIssues,
      href: "/configuracoes",
    });
  }

  return alerts.sort((a, b) => {
    const weight: Record<AlertSeverity, number> = { critical: 0, attention: 1, info: 2 };
    return weight[a.severity] - weight[b.severity] || b.count - a.count;
  });
}
