"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  BadgeDollarSign,
  Building2,
  FileSearch,
  Gift,
  History,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Truck,
  UploadCloud,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatNumber, KpiCard, PageIntro, Panel, StatusBadge } from "@/components/ui";
import { DISCOUNT_DIRECTIONS, DISCOUNT_DIRECTION_LABELS, type DiscountDirection } from "@/lib/discount-management";
import { TableWrap } from "./shared";
import styles from "./discount-management-view.module.css";

type DiscountRow = {
  id: string;
  shipment_id: string;
  allocation_no: number;
  allocation_amount: number | null;
  allocation_target_id: string | null;
  allocation_target_name: string | null;
  direction: DiscountDirection;
  note: string | null;
  manual_amount: number | null;
  manual_route_id: string | null;
  manual_date: string | null;
  manual_driver_id: string | null;
  manual_driver_name: string | null;
  manual_base_key: string | null;
  manual_base_name: string | null;
  manual_sigla: string | null;
  source_kind: string;
  source_period: string | null;
  discount_month: string | null;
  source_file: string | null;
  source_sheet: string | null;
  created_by: string | null;
  updated_at: string;
  driver_id: string | null;
  driver_name: string | null;
  base_key: string | null;
  base_name: string | null;
  sigla: string | null;
  xpt_code: string | null;
  route_id: string | null;
  event_date: string | null;
  amount: number;
  amount_source: string;
  pnr_status: string | null;
  month: string | null;
  fortnight: string | null;
  operational_month?: string | null;
  operational_fortnight?: string | null;
  matched_prefatura: boolean;
  matched_pnr: boolean;
  awaiting_match: boolean;
  origin: string;
};

type HistoryEvent = {
  id: string;
  event_type: string;
  from_direction: string | null;
  to_direction: string | null;
  note: string | null;
  created_at: string;
  source_period: string | null;
  source_file: string | null;
  source_sheet: string | null;
  actor?: { full_name: string; email: string } | null;
};

type LookupMatch = Partial<DiscountRow> & { shipment_id: string; amount: number; awaiting_match: boolean; origin: string };
type LookupInfo = { existingCount: number; allocatedTotal: number; existingEntries: DiscountRow[] };

type FilterState = {
  search: string;
  month: string;
  fortnight: string;
  base: string;
  xpt: string;
  driver: string;
  direction: string;
  origin: string;
  pnrStatus: string;
};

type EditForm = {
  direction: DiscountDirection;
  note: string;
  discountMonth: string;
  allocationAmount: string;
  allocationTargetId: string;
  allocationTargetName: string;
  manualAmount: string;
  manualRouteId: string;
  manualDate: string;
  manualDriverId: string;
  manualDriverName: string;
  manualBaseKey: string;
  manualBaseName: string;
  manualSigla: string;
};

const API = "/api/discount-management-v2";
const IMPORT_API = "/api/discount-management-v2/import";
const PAGE_SIZE = 50;
const ALL = "TODOS";
const EMPTY_FILTERS: FilterState = { search: "", month: ALL, fortnight: ALL, base: ALL, xpt: ALL, driver: ALL, direction: ALL, origin: ALL, pnrStatus: ALL };

function currentMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? String(new Date().getFullYear());
  const month = parts.find((part) => part.type === "month")?.value ?? String(new Date().getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function defaultFortnight(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const day = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", day: "2-digit" }).format(new Date()));
  return `0${day <= 15 ? 1 : 2}Q${match[2]}${match[1]}`;
}

function emptyForm(month = currentMonth()): EditForm {
  return {
    direction: "em_analise",
    note: "",
    discountMonth: month,
    allocationAmount: "",
    allocationTargetId: "",
    allocationTargetName: "",
    manualAmount: "",
    manualRouteId: "",
    manualDate: "",
    manualDriverId: "",
    manualDriverName: "",
    manualBaseKey: "",
    manualBaseName: "",
    manualSigla: "",
  };
}

function rowToForm(row: DiscountRow): EditForm {
  return {
    direction: row.direction,
    note: row.note || "",
    discountMonth: row.discount_month || row.month || currentMonth(),
    allocationAmount: row.allocation_amount == null ? "" : String(row.allocation_amount),
    allocationTargetId: row.allocation_target_id || "",
    allocationTargetName: row.allocation_target_name || "",
    manualAmount: row.manual_amount == null ? "" : String(row.manual_amount),
    manualRouteId: row.manual_route_id || "",
    manualDate: row.manual_date || "",
    manualDriverId: row.manual_driver_id || "",
    manualDriverName: row.manual_driver_name || "",
    manualBaseKey: row.manual_base_key || "",
    manualBaseName: row.manual_base_name || "",
    manualSigla: row.manual_sigla || "",
  };
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => (value || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function formatMonth(value: string | null | undefined) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(Number(match[1]), Number(match[2]) - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatFortnight(value: string | null | undefined) {
  if (!value) return "—";
  const match = /^(0?[12])Q(\d{2})(\d{4})$/i.exec(value);
  if (!match) return value;
  const month = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(Number(match[3]), Number(match[2]) - 1, 1));
  return `${Number(match[1])}Q · ${month}/${match[3]}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

function directionTone(direction: string): "neutral" | "red" | "green" | "amber" | "blue" {
  if (direction === "em_analise") return "amber";
  if (direction === "desconto_driver") return "red";
  if (direction === "desconto_dispatcher") return "blue";
  if (direction === "absorvido_alc" || direction === "abono") return "green";
  return "neutral";
}

function statusTone(status: string | null): "neutral" | "red" | "green" | "amber" | "blue" {
  const normalized = (status || "").toLocaleLowerCase("pt-BR");
  if (normalized.includes("penal")) return "red";
  if (normalized.includes("fatur")) return "green";
  if (normalized.includes("revis")) return "blue";
  if (normalized.includes("aguard") || normalized.includes("comprov")) return "amber";
  return "neutral";
}

async function readJson(response: Response, fallback: string) {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : fallback);
  return body;
}

export function DiscountManagementViewV3() {
  const [rows, setRows] = useState<DiscountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [newOpen, setNewOpen] = useState(false);
  const [lookupId, setLookupId] = useState("");
  const [lookupMatch, setLookupMatch] = useState<LookupMatch | null>(null);
  const [lookupInfo, setLookupInfo] = useState<LookupInfo>({ existingCount: 0, allocatedTotal: 0, existingEntries: [] });
  const [lookupLoading, setLookupLoading] = useState(false);
  const [newForm, setNewForm] = useState<EditForm>(emptyForm());
  const [selected, setSelected] = useState<DiscountRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(emptyForm());
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [importingSheet, setImportingSheet] = useState(false);

  function updateFilters(next: Parameters<typeof setFilters>[0]) {
    setFilters(next);
    setPage(1);
  }

  async function loadRows(showToast = false) {
    setLoading(true);
    try {
      const body = await readJson(await fetch(API, { cache: "no-store" }), "Falha ao carregar a Gestão de Descontos.");
      setRows((body.rows as DiscountRow[]) ?? []);
      if (showToast) toast.success("Gestão de Descontos atualizada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar a Gestão de Descontos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { queueMicrotask(() => void loadRows()); }, []);
  useEffect(() => {
    const refresh = () => void loadRows();
    window.addEventListener("alc-inteligencia:global-data-sync", refresh);
    return () => window.removeEventListener("alc-inteligencia:global-data-sync", refresh);
  }, []);

  const shipmentCounts = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) => map.set(row.shipment_id, (map.get(row.shipment_id) ?? 0) + 1));
    return map;
  }, [rows]);
  const uniqueIds = shipmentCounts.size;

  const options = useMemo(() => ({
    months: unique(rows.map((row) => row.discount_month || row.month)),
    fortnights: unique(rows.map((row) => row.fortnight)),
    bases: unique(rows.map((row) => row.base_name || row.base_key || row.sigla)),
    xpts: unique(rows.map((row) => row.xpt_code)),
    drivers: unique(rows.map((row) => row.driver_name || row.driver_id)),
    origins: unique(rows.map((row) => row.origin)),
    pnrStatuses: unique(rows.map((row) => row.pnr_status)),
  }), [rows]);

  const filtered = useMemo(() => {
    const search = filters.search.trim().toLocaleLowerCase("pt-BR");
    return rows.filter((row) => {
      if (search) {
        const haystack = [row.shipment_id, row.driver_name, row.driver_id, row.allocation_target_name, row.allocation_target_id, row.route_id, row.base_name, row.base_key, row.sigla, row.xpt_code, row.note].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
        if (!haystack.includes(search)) return false;
      }
      if (filters.month !== ALL && (row.discount_month || row.month) !== filters.month) return false;
      if (filters.fortnight !== ALL && row.fortnight !== filters.fortnight) return false;
      if (filters.base !== ALL && (row.base_name || row.base_key || row.sigla) !== filters.base) return false;
      if (filters.xpt !== ALL && row.xpt_code !== filters.xpt) return false;
      if (filters.driver !== ALL && (row.driver_name || row.driver_id) !== filters.driver) return false;
      if (filters.direction !== ALL && row.direction !== filters.direction) return false;
      if (filters.origin !== ALL && row.origin !== filters.origin) return false;
      if (filters.pnrStatus !== ALL && row.pnr_status !== filters.pnrStatus) return false;
      return true;
    });
  }, [rows, filters]);


  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalValue = filtered.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const summary = DISCOUNT_DIRECTIONS.reduce<Record<DiscountDirection, { count: number; value: number }>>((acc, direction) => {
    const group = filtered.filter((row) => row.direction === direction);
    acc[direction] = { count: group.length, value: group.reduce((sum, row) => sum + Number(row.amount || 0), 0) };
    return acc;
  }, { em_analise: { count: 0, value: 0 }, desconto_driver: { count: 0, value: 0 }, desconto_dispatcher: { count: 0, value: 0 }, absorvido_alc: { count: 0, value: 0 }, abono: { count: 0, value: 0 }, outro: { count: 0, value: 0 } });

  function replaceRow(row: DiscountRow) {
    setRows((current) => current.map((item) => item.id === row.id ? row : item));
    setSelected((current) => current?.id === row.id ? row : current);
  }

  async function updateCompetence(id: string, discountMonth: string, sourcePeriod?: string | null) {
    const body = await readJson(await fetch("/api/discount-management/competence", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, discountMonth, sourcePeriod }),
    }), "Falha ao atualizar o mês do desconto.");
    const reloaded = await readJson(await fetch(`${API}?history=${encodeURIComponent(id)}`, { cache: "no-store" }), "Falha ao recarregar o direcionamento.");
    return (reloaded.row ?? body.row) as DiscountRow;
  }

  async function quickDirection(row: DiscountRow, direction: DiscountDirection) {
    setBusyId(row.id);
    try {
      const body = await readJson(await fetch(API, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, direction }) }), "Falha ao atualizar o direcionamento.");
      replaceRow(body.row as DiscountRow);
      toast.success("Direcionamento atualizado.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao atualizar."); }
    finally { setBusyId(""); }
  }

  async function importSpreadsheet(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportingSheet(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const body = await readJson(await fetch(IMPORT_API, { method: "POST", body: form }), "Falha ao importar a planilha.");
      await loadRows();
      toast.success(`${Number(body.processed ?? 0).toLocaleString("pt-BR")} registro(s) importado(s) para ${formatMonth(String(body.month ?? ""))}.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao importar planilha."); }
    finally { setImportingSheet(false); }
  }

  async function lookupShipment() {
    const id = lookupId.replace(/\D/g, "");
    if (!id) return toast.error("Informe o ID do pacote.");
    setLookupLoading(true); setLookupMatch(null); setLookupInfo({ existingCount: 0, allocatedTotal: 0, existingEntries: [] });
    try {
      const body = await readJson(await fetch(`${API}?lookup=${encodeURIComponent(id)}`, { cache: "no-store" }), "Falha ao localizar o ID.");
      setLookupMatch(body.match as LookupMatch);
      setLookupInfo({
        existingCount: Number(body.existingCount ?? 0),
        allocatedTotal: Number(body.allocatedTotal ?? 0),
        existingEntries: (body.existingEntries as DiscountRow[]) ?? [],
      });
      if (Number(body.existingCount ?? 0) > 0) toast.info("Este ID já possui direcionamento(s). O novo lançamento será mantido separado.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao localizar o ID."); }
    finally { setLookupLoading(false); }
  }

  async function createDirection() {
    if (!lookupMatch) return;
    if (!/^\d{4}-\d{2}$/.test(newForm.discountMonth)) return toast.error("Informe o mês do desconto.");
    if (lookupInfo.existingCount > 0 && !newForm.allocationAmount.trim()) return toast.error("Informe o valor deste novo direcionamento para o mesmo ID.");
    setBusyId("new");
    try {
      const body = await readJson(await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipmentId: lookupMatch.shipment_id,
          allowDuplicate: lookupInfo.existingCount > 0,
          direction: newForm.direction,
          note: newForm.note,
          allocationAmount: newForm.allocationAmount,
          allocationTargetId: newForm.allocationTargetId,
          allocationTargetName: newForm.allocationTargetName,
          manualAmount: lookupMatch.awaiting_match ? newForm.manualAmount : "",
          manualRouteId: newForm.manualRouteId,
          manualDate: newForm.manualDate,
          manualDriverId: newForm.manualDriverId,
          manualDriverName: newForm.manualDriverName,
          manualBaseKey: newForm.manualBaseKey,
          manualBaseName: newForm.manualBaseName,
          manualSigla: newForm.manualSigla,
        }),
      }), "Falha ao criar o direcionamento.");
      const created = body.row as DiscountRow;
      const sourcePeriod = filters.fortnight !== ALL ? filters.fortnight : defaultFortnight(newForm.discountMonth);
      const row = await updateCompetence(created.id, newForm.discountMonth, sourcePeriod);
      setRows((current) => [row, ...current.filter((item) => item.id !== row.id)]);
      setNewOpen(false); setLookupId(""); setLookupMatch(null); setLookupInfo({ existingCount: 0, allocatedTotal: 0, existingEntries: [] }); setNewForm(emptyForm());
      toast.success(row.allocation_no > 1 ? "Novo lançamento criado para o mesmo ID, sem mesclar com os anteriores." : "Novo direcionamento criado.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao criar direcionamento."); }
    finally { setBusyId(""); }
  }

  async function openDetails(row: DiscountRow) {
    setSelected(row); setEditForm(rowToForm(row)); setHistory([]); setHistoryLoading(true);
    try {
      const body = await readJson(await fetch(`${API}?history=${encodeURIComponent(row.id)}`, { cache: "no-store" }), "Falha ao carregar o histórico.");
      const current = body.row as DiscountRow;
      setSelected(current); setEditForm(rowToForm(current)); setHistory((body.events as HistoryEvent[]) ?? []); replaceRow(current);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao carregar histórico."); }
    finally { setHistoryLoading(false); }
  }

  async function saveDetails() {
    if (!selected) return;
    setBusyId(selected.id);
    try {
      await readJson(await fetch(API, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          direction: editForm.direction,
          note: editForm.note,
          allocationAmount: editForm.allocationAmount,
          allocationTargetId: editForm.allocationTargetId,
          allocationTargetName: editForm.allocationTargetName,
          manualAmount: editForm.manualAmount,
          manualRouteId: editForm.manualRouteId,
          manualDate: editForm.manualDate,
          manualDriverId: editForm.manualDriverId,
          manualDriverName: editForm.manualDriverName,
          manualBaseKey: editForm.manualBaseKey,
          manualBaseName: editForm.manualBaseName,
          manualSigla: editForm.manualSigla,
        }),
      }), "Falha ao salvar o direcionamento.");
      const row = await updateCompetence(selected.id, editForm.discountMonth, selected.source_period);
      replaceRow(row); await openDetails(row); toast.success("Tratativa salva.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao salvar."); }
    finally { setBusyId(""); }
  }

  async function deleteDirection(row: DiscountRow) {
    const siblingCount = shipmentCounts.get(row.shipment_id) ?? 1;
    const confirmed = window.confirm(
      siblingCount > 1
        ? `Excluir somente o lançamento ${row.allocation_no} do ID ${row.shipment_id}?\n\nOs outros ${siblingCount - 1} direcionamento(s) deste mesmo ID serão mantidos.`
        : `Excluir o ID ${row.shipment_id} da Gestão de Descontos?\n\nO registro sairá da gestão ativa, mas a exclusão ficará preservada para auditoria.`,
    );
    if (!confirmed) return;
    setBusyId(row.id);
    try {
      await readJson(await fetch(`${API}?id=${encodeURIComponent(row.id)}`, { method: "DELETE" }), "Falha ao excluir o direcionamento.");
      setRows((current) => current.filter((item) => item.id !== row.id));
      if (selected?.id === row.id) setSelected(null);
      toast.success(siblingCount > 1 ? "Lançamento excluído. Os demais direcionamentos do ID foram mantidos." : "ID removido da Gestão de Descontos.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao excluir."); }
    finally { setBusyId(""); }
  }

  return (
    <div className={styles.stack}>
      <PageIntro
        description="A data do ID permanece operacional. O mesmo ID pode ter múltiplos lançamentos quando o valor é dividido entre pessoas, Dispatcher ou absorção pela ALC."
        chips={[`${formatNumber(rows.length)} lançamentos`, `${formatNumber(uniqueIds)} IDs únicos`, "1 ID pode ter vários direcionamentos"]}
      />

      <div className={styles.cardGrid}>
        <KpiCard label="Valor sob gestão" value={formatCurrency(totalValue)} detail={`${formatNumber(filtered.length)} lançamentos no recorte`} icon={<BadgeDollarSign size={19} />} />
        <KpiCard label="Em análise" value={formatCurrency(summary.em_analise.value)} detail={`${formatNumber(summary.em_analise.count)} lançamentos`} icon={<FileSearch size={19} />} tone="amber" />
        <KpiCard label="Desconto Driver" value={formatCurrency(summary.desconto_driver.value)} detail={`${formatNumber(summary.desconto_driver.count)} lançamentos`} icon={<UserRound size={19} />} tone="red" />
        <KpiCard label="Desconto Dispatcher" value={formatCurrency(summary.desconto_dispatcher.value)} detail={`${formatNumber(summary.desconto_dispatcher.count)} lançamentos`} icon={<Truck size={19} />} />
        <KpiCard label="Absorvido ALC" value={formatCurrency(summary.absorvido_alc.value)} detail={`${formatNumber(summary.absorvido_alc.count)} lançamentos assumidos pela empresa`} icon={<Building2 size={19} />} tone="green" />
        <KpiCard label="Abono" value={formatCurrency(summary.abono.value)} detail={`${formatNumber(summary.abono.count)} lançamentos`} icon={<Gift size={19} />} tone="green" />
      </div>

      <Panel title="Filtros da Gestão de Descontos" subtitle="Mês e quinzena filtram a competência financeira do desconto, não a data real do pacote." action={<div className={styles.panelAction}>
        <button className={styles.secondaryButton} onClick={() => { updateFilters(EMPTY_FILTERS); setPage(1); }}>Limpar filtros</button>
        <label className={styles.secondaryButton} aria-disabled={importingSheet}><UploadCloud size={15} />{importingSheet ? "Importando…" : "Importar planilha"}<input hidden type="file" accept=".xlsx,.xlsm,.xls" disabled={importingSheet} onChange={(event) => void importSpreadsheet(event)} /></label>
        <button className={styles.primaryButton} onClick={() => { const month = filters.month !== ALL ? filters.month : currentMonth(); setNewOpen(true); setLookupMatch(null); setLookupInfo({ existingCount: 0, allocatedTotal: 0, existingEntries: [] }); setLookupId(""); setNewForm(emptyForm(month)); }}><Plus size={15} />Novo direcionamento</button>
      </div>}>
        <div className={styles.toolbar}>
          <label className={styles.field}><span>Buscar</span><div className={styles.searchWrap}><Search size={15} /><input value={filters.search} onChange={(event) => updateFilters((current) => ({ ...current, search: event.target.value }))} placeholder="ID, motorista, responsável, rota ou base" /></div></label>
          <label className={styles.field}><span>Mês do desconto</span><select value={filters.month} onChange={(event) => updateFilters((current) => ({ ...current, month: event.target.value }))}><option value={ALL}>Todos</option>{options.months.map((value) => <option value={value} key={value}>{formatMonth(value)}</option>)}</select></label>
          <label className={styles.field}><span>Quinzena</span><select value={filters.fortnight} onChange={(event) => updateFilters((current) => ({ ...current, fortnight: event.target.value }))}><option value={ALL}>Todas</option>{options.fortnights.map((value) => <option value={value} key={value}>{formatFortnight(value)}</option>)}</select></label>
          <label className={styles.field}><span>Base</span><select value={filters.base} onChange={(event) => updateFilters((current) => ({ ...current, base: event.target.value }))}><option value={ALL}>Todas</option>{options.bases.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
          <label className={styles.field}><span>XPT</span><select value={filters.xpt} onChange={(event) => updateFilters((current) => ({ ...current, xpt: event.target.value }))}><option value={ALL}>Todos</option>{options.xpts.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
        </div>
        <div className={styles.toolbarSecondary}>
          <label className={styles.field}><span>Motorista</span><select value={filters.driver} onChange={(event) => updateFilters((current) => ({ ...current, driver: event.target.value }))}><option value={ALL}>Todos</option>{options.drivers.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
          <label className={styles.field}><span>Direcionamento</span><select value={filters.direction} onChange={(event) => updateFilters((current) => ({ ...current, direction: event.target.value }))}><option value={ALL}>Todos</option>{DISCOUNT_DIRECTIONS.map((direction) => <option value={direction} key={direction}>{DISCOUNT_DIRECTION_LABELS[direction]}</option>)}</select></label>
          <label className={styles.field}><span>Origem</span><select value={filters.origin} onChange={(event) => updateFilters((current) => ({ ...current, origin: event.target.value }))}><option value={ALL}>Todas</option>{options.origins.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
          <label className={styles.field}><span>Status PNR</span><select value={filters.pnrStatus} onChange={(event) => updateFilters((current) => ({ ...current, pnrStatus: event.target.value }))}><option value={ALL}>Todos</option>{options.pnrStatuses.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
        </div>
      </Panel>

      <Panel title="Direcionamentos" subtitle="Cada linha é um lançamento financeiro. O mesmo ID pode aparecer mais de uma vez sem que os direcionamentos sejam mesclados." action={<button className={styles.secondaryButton} onClick={() => void loadRows(true)} disabled={loading}><RefreshCw size={14} className={loading ? styles.spin : ""} />Atualizar cruzamento</button>}>
        {loading ? <div className={styles.loading}>Carregando e cruzando os IDs...</div> : filtered.length === 0 ? <div className={styles.empty}><FileSearch size={28} /><strong>Nenhum direcionamento neste recorte</strong><span>Importe uma planilha ou cadastre um novo ID.</span></div> : <>
          <TableWrap>
            <thead><tr><th>ID</th><th>Motorista do pacote</th><th>Base</th><th>Rota / Data ID</th><th>Mês do desconto</th><th>Origem</th><th>Status PNR</th><th>Direcionamento</th><th>Observação</th><th className="align-right">Valor</th><th className="align-right">Ações</th></tr></thead>
            <tbody>{visibleRows.map((row) => <tr key={row.id}>
              <td><strong className="mono">{row.shipment_id}</strong><small className="cell-subtitle">Lançamento {row.allocation_no}{(shipmentCounts.get(row.shipment_id) ?? 1) > 1 ? ` de ${shipmentCounts.get(row.shipment_id)}` : ""}</small></td>
              <td><strong>{row.driver_name || "Não identificado"}</strong><small className="cell-subtitle">{row.driver_id ? `ID ${row.driver_id}` : "Sem ID de motorista"}</small></td>
              <td><div className={styles.baseCell}><strong>{row.sigla && row.base_name ? `${row.sigla} · ${row.base_name}` : row.base_name || row.base_key || row.sigla || "Não conciliada"}</strong><small>{row.xpt_code ? `XPT ${row.xpt_code}` : "Sem XPT vinculado"}</small></div></td>
              <td><strong className="mono">{row.route_id || "—"}</strong><small className="cell-subtitle">{formatDate(row.event_date)}</small></td>
              <td><strong>{formatMonth(row.discount_month || row.month)}</strong></td>
              <td><div className={styles.sourceLine}><StatusBadge tone={row.awaiting_match ? "amber" : row.matched_prefatura && row.matched_pnr ? "blue" : "neutral"}>{row.origin}</StatusBadge><small>{row.awaiting_match ? "Aguardando cruzamento" : row.amount_source}</small></div></td>
              <td>{row.pnr_status ? <StatusBadge tone={statusTone(row.pnr_status)}>{row.pnr_status}</StatusBadge> : <span className="muted">—</span>}</td>
              <td><select className={styles.directionSelect} value={row.direction} disabled={busyId === row.id} onChange={(event) => void quickDirection(row, event.target.value as DiscountDirection)}>{DISCOUNT_DIRECTIONS.map((direction) => <option value={direction} key={direction}>{DISCOUNT_DIRECTION_LABELS[direction]}</option>)}</select>{row.allocation_target_name || row.allocation_target_id ? <small className="cell-subtitle">Para: {row.allocation_target_name || row.allocation_target_id}{row.allocation_target_name && row.allocation_target_id ? ` · ${row.allocation_target_id}` : ""}</small> : null}</td>
              <td><div className={styles.notePreview} title={row.note || ""}>{row.note || "—"}</div></td>
              <td className="align-right"><div className={styles.amountCell}><strong>{formatCurrency(Number(row.amount || 0))}</strong><small>{row.amount_source}</small></div></td>
              <td className="align-right"><div style={{ display: "inline-flex", gap: 6 }}><button className={styles.iconButton} onClick={() => void openDetails(row)} title="Abrir detalhes e histórico"><History size={14} /></button><button className={styles.iconButton} onClick={() => void deleteDirection(row)} disabled={busyId === row.id} title="Excluir este lançamento"><Trash2 size={14} /></button></div></td>
            </tr>)}</tbody>
          </TableWrap>
          <div className={styles.pagination}><span>Exibindo {formatNumber((page - 1) * PAGE_SIZE + 1)}–{formatNumber(Math.min(page * PAGE_SIZE, filtered.length))} de {formatNumber(filtered.length)} lançamentos.</span><div className={styles.paginationActions}><button className={styles.secondaryButton} disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button><button className={styles.secondaryButton} disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Próxima</button></div></div>
        </>}
      </Panel>

      {newOpen ? <div className={styles.modalBackdrop} role="dialog" aria-modal="true"><div className={styles.modal}>
        <div className={styles.modalHeader}><div><small className="muted">GESTÃO DE DESCONTOS</small><h3>Novo direcionamento</h3><p>Se o ID já existir, o novo lançamento será criado separado. Nenhum direcionamento anterior será sobrescrito.</p></div><button className={styles.iconButton} onClick={() => setNewOpen(false)}><X size={16} /></button></div>
        <div className={styles.lookupRow}><label className={styles.field}><span>ID do pacote/envio</span><input inputMode="numeric" value={lookupId} onChange={(event) => setLookupId(event.target.value.replace(/\D/g, ""))} placeholder="Ex.: 47233445584" /></label><button className={styles.primaryButton} disabled={lookupLoading || !lookupId} onClick={() => void lookupShipment()}>{lookupLoading ? <RefreshCw size={14} className={styles.spin} /> : <Search size={14} />}Buscar ID</button></div>
        <div className={styles.modalGrid}><label className={styles.field}><span>Mês do desconto</span><input type="month" value={newForm.discountMonth} onChange={(event) => setNewForm((current) => ({ ...current, discountMonth: event.target.value }))} /></label><label className={styles.field}><span>Direcionamento</span><select value={newForm.direction} onChange={(event) => setNewForm((current) => ({ ...current, direction: event.target.value as DiscountDirection }))}>{DISCOUNT_DIRECTIONS.map((direction) => <option value={direction} key={direction}>{DISCOUNT_DIRECTION_LABELS[direction]}</option>)}</select></label></div>
        {lookupMatch ? <>
          {lookupInfo.existingCount > 0 ? <div className={styles.alert}><BadgeDollarSign size={16} /><div><strong>Este ID já possui {lookupInfo.existingCount} lançamento(s).</strong><br />O novo direcionamento não será cruzado nem mesclado com eles. Informe o valor específico desta nova parcela. Atualmente há {formatCurrency(lookupInfo.allocatedTotal)} em lançamentos ativos para o ID.</div></div> : null}
          <div className={`${styles.lookupCard} ${lookupMatch.awaiting_match ? styles.awaiting : styles.matched}`}><div className={styles.lookupCardHeader}><strong>{lookupMatch.awaiting_match ? "ID ainda não encontrado nas bases internas" : "Dados operacionais encontrados"}</strong><StatusBadge tone={lookupMatch.awaiting_match ? "amber" : "green"}>{lookupMatch.origin}</StatusBadge></div><div className={styles.lookupMeta}><div><span>Data real do ID</span><strong>{formatDate(lookupMatch.event_date)}</strong></div><div><span>Motorista do pacote</span><strong>{lookupMatch.driver_name || "Não identificado"}</strong></div><div><span>Base</span><strong>{lookupMatch.base_name || lookupMatch.base_key || "—"}</strong></div><div><span>Valor de referência</span><strong>{formatCurrency(Number(lookupMatch.amount || 0))}</strong></div></div></div>
          <div className={styles.modalGrid}><label className={styles.field}><span>Valor deste direcionamento{lookupInfo.existingCount > 0 ? " *" : ""}</span><input inputMode="decimal" value={newForm.allocationAmount} onChange={(event) => setNewForm((current) => ({ ...current, allocationAmount: event.target.value }))} placeholder={lookupInfo.existingCount > 0 ? "Obrigatório para ID repetido" : "Deixe vazio para usar o valor de referência"} /></label><label className={styles.field}><span>Direcionado para</span><input value={newForm.allocationTargetName} onChange={(event) => setNewForm((current) => ({ ...current, allocationTargetName: event.target.value }))} placeholder="Nome da pessoa / responsável" /></label><label className={styles.field}><span>ID do responsável</span><input value={newForm.allocationTargetId} onChange={(event) => setNewForm((current) => ({ ...current, allocationTargetId: event.target.value }))} placeholder="Opcional" /></label></div>
          <label className={styles.field}><span>Observação / justificativa</span><textarea value={newForm.note} onChange={(event) => setNewForm((current) => ({ ...current, note: event.target.value }))} /></label>
          {lookupMatch.awaiting_match ? <><div className={styles.sectionTitle}>Dados de contingência</div><div className={styles.modalGrid}><label className={styles.field}><span>Valor de referência</span><input inputMode="decimal" value={newForm.manualAmount} onChange={(event) => setNewForm((current) => ({ ...current, manualAmount: event.target.value }))} /></label><label className={styles.field}><span>Data real do ID</span><input type="date" value={newForm.manualDate} onChange={(event) => setNewForm((current) => ({ ...current, manualDate: event.target.value }))} /></label><label className={styles.field}><span>Motorista do pacote</span><input value={newForm.manualDriverName} onChange={(event) => setNewForm((current) => ({ ...current, manualDriverName: event.target.value }))} /></label><label className={styles.field}><span>ID motorista</span><input value={newForm.manualDriverId} onChange={(event) => setNewForm((current) => ({ ...current, manualDriverId: event.target.value }))} /></label><label className={styles.field}><span>Base</span><input value={newForm.manualBaseName} onChange={(event) => setNewForm((current) => ({ ...current, manualBaseName: event.target.value }))} /></label><label className={styles.field}><span>Sigla</span><input value={newForm.manualSigla} onChange={(event) => setNewForm((current) => ({ ...current, manualSigla: event.target.value }))} /></label><label className={styles.field}><span>Rota</span><input value={newForm.manualRouteId} onChange={(event) => setNewForm((current) => ({ ...current, manualRouteId: event.target.value }))} /></label></div></> : null}
          <div className={styles.actions}><button className={styles.secondaryButton} onClick={() => setNewOpen(false)}>Cancelar</button><button className={styles.primaryButton} disabled={busyId === "new"} onClick={() => void createDirection()}><Save size={14} />{lookupInfo.existingCount > 0 ? "Adicionar novo lançamento" : "Salvar direcionamento"}</button></div>
        </> : null}
      </div></div> : null}

      {selected ? <div className={styles.modalBackdrop} role="dialog" aria-modal="true"><div className={styles.modal}>
        <div className={styles.modalHeader}><div><small className="muted">ID DO PACOTE · LANÇAMENTO {selected.allocation_no}</small><h3 className="mono">{selected.shipment_id}</h3><p>Este lançamento é independente dos demais direcionamentos do mesmo ID.</p></div><button className={styles.iconButton} onClick={() => setSelected(null)}><X size={16} /></button></div>
        <div className={styles.lookupCard}><div className={styles.lookupMeta}><div><span>Data real do ID</span><strong>{formatDate(selected.event_date)}</strong></div><div><span>Mês do desconto</span><strong>{formatMonth(selected.discount_month || selected.month)}</strong></div><div><span>Quinzena financeira</span><strong>{formatFortnight(selected.fortnight)}</strong></div><div><span>Valor deste lançamento</span><strong>{formatCurrency(Number(selected.amount || 0))}</strong></div></div></div>
        <div className={styles.modalGrid}><label className={styles.field}><span>Mês do desconto</span><input type="month" value={editForm.discountMonth} onChange={(event) => setEditForm((current) => ({ ...current, discountMonth: event.target.value }))} /></label><label className={styles.field}><span>Direcionamento</span><select value={editForm.direction} onChange={(event) => setEditForm((current) => ({ ...current, direction: event.target.value as DiscountDirection }))}>{DISCOUNT_DIRECTIONS.map((direction) => <option value={direction} key={direction}>{DISCOUNT_DIRECTION_LABELS[direction]}</option>)}</select></label><label className={styles.field}><span>Valor deste direcionamento</span><input inputMode="decimal" value={editForm.allocationAmount} onChange={(event) => setEditForm((current) => ({ ...current, allocationAmount: event.target.value }))} placeholder="Vazio = valor operacional" /></label><label className={styles.field}><span>Direcionado para</span><input value={editForm.allocationTargetName} onChange={(event) => setEditForm((current) => ({ ...current, allocationTargetName: event.target.value }))} /></label><label className={styles.field}><span>ID do responsável</span><input value={editForm.allocationTargetId} onChange={(event) => setEditForm((current) => ({ ...current, allocationTargetId: event.target.value }))} /></label></div>
        <label className={styles.field}><span>Observação / justificativa</span><textarea value={editForm.note} onChange={(event) => setEditForm((current) => ({ ...current, note: event.target.value }))} /></label>
        <div className={styles.actions}><button className={styles.secondaryButton} onClick={() => void deleteDirection(selected)} disabled={busyId === selected.id}><Trash2 size={14} />Excluir lançamento</button><button className={styles.secondaryButton} onClick={() => setSelected(null)}>Fechar</button><button className={styles.primaryButton} disabled={busyId === selected.id} onClick={() => void saveDetails()}><Save size={14} />Salvar alterações</button></div>
        <div className={styles.sectionTitle}>Histórico</div>
        <div className={styles.history}>{historyLoading ? <div className={styles.loading}>Carregando histórico...</div> : history.length ? history.map((event) => <div className={styles.historyItem} key={event.id}><div className={styles.historyDirection}><strong>{event.event_type.replaceAll("_", " ")}</strong>{event.to_direction ? <StatusBadge tone={directionTone(event.to_direction)}>{DISCOUNT_DIRECTION_LABELS[event.to_direction as DiscountDirection] ?? event.to_direction}</StatusBadge> : null}</div>{event.note ? <p>{event.note}</p> : null}<small>{formatDateTime(event.created_at)} · {event.actor?.full_name || event.actor?.email || "Sistema"}{event.source_file ? ` · ${event.source_file}` : ""}</small></div>) : <span className="muted">Sem eventos registrados.</span>}</div>
      </div></div> : null}
    </div>
  );
}
