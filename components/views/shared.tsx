import { ChevronDown, Filter, Inbox } from "lucide-react";

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

export function ColumnSelectFilter({
  ariaLabel,
  value,
  options,
  onChange,
  allValue = "TODOS",
  allLabel = "Todos",
}: {
  ariaLabel: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  allValue?: string;
  allLabel?: string;
}) {
  const active = value !== allValue;
  const currentLabel = active ? options.find((option) => option.value === value)?.label ?? allLabel : "Filtrar";

  return (
    <label
      title={active ? currentLabel : ariaLabel}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 20,
        maxWidth: 124,
        marginLeft: 6,
        padding: "0 6px",
        verticalAlign: "middle",
        color: active ? "#b8000b" : "#7f8289",
        background: active ? "#fff3f4" : "#f1f2f4",
        border: `1px solid ${active ? "#f5c5c9" : "#e4e5e8"}`,
        borderRadius: 999,
        fontSize: 7,
        fontWeight: 600,
        letterSpacing: 0,
        lineHeight: 1,
        textTransform: "none",
        cursor: "pointer",
      }}
    >
      <Filter size={9} strokeWidth={1.8} />
      <span style={{ maxWidth: 88, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentLabel}</span>
      <ChevronDown size={9} strokeWidth={1.8} />
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
      >
        <option value={allValue}>{allLabel}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="table-wrap"><table>{children}</table></div>;
}
