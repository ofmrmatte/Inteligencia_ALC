import { Inbox } from "lucide-react";

export function NoResults({ title = "Nenhum registro neste recorte", detail = "Revise os filtros globais ou importe uma fonte compatível." }: { title?: string; detail?: string }) {
  return <div className="no-results"><Inbox size={28} /><strong>{title}</strong><p>{detail}</p></div>;
}

export function ChartTooltip({ active, payload, label, currency = false }: { active?: boolean; payload?: Array<{ name?: string; value?: unknown; color?: string }>; label?: string; currency?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => <span key={item.name}><i style={{ background: item.color }} />{item.name}: <b>{currency ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(item.value) || 0) : new Intl.NumberFormat("pt-BR").format(Number(item.value) || 0)}</b></span>)}
    </div>
  );
}

export function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="table-wrap"><table>{children}</table></div>;
}
