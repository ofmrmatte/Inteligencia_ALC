"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarDays, Clock3, Download, FileText, Pencil, Plus, RefreshCw, Save, Trash2, UsersRound, X } from "lucide-react";
import { toast } from "sonner";
import { KpiCard, Panel, PageIntro, StatusBadge, formatCurrency } from "@/components/ui";
import { NoResults, TableWrap } from "./shared";
import type { AuthProfile } from "@/lib/auth";
import { canManageHr, canReadSensitiveHr } from "@/lib/hr/permissions";
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, LEAVE_STATUSES, LEAVE_TYPES, OCCURRENCE_TYPES, SECULLUM_FIELDS, type HrOverview, type HrRow, type ColumnMapping, type SecullumPreview } from "@/lib/hr/types";
import styles from "./hr-view.module.css";

const LABELS: Record<string, string> = { ACTIVE: "Ativo", LEAVE: "Afastado", TERMINATED: "Desligado", VACATION: "Férias", MEDICAL: "Afastamento médico", LICENSE: "Licença", OTHER: "Outro", HOME_OFFICE: "Home office", ABSENCE: "Falta", MEDICAL_LEAVE: "Atestado", LATE: "Atraso", EXTRA_HOURS: "Horas extras", DAY_OFF: "Folga", PLANNED: "Planejado", APPROVED: "Aprovado", FINISHED: "Concluído", CANCELED: "Cancelado", MONTHLY: "Mensal", HOURLY: "Por hora", CREATE: "Cadastro", UPDATE: "Alteração", DELETE: "Remoção", IMPORT: "Importação", employees: "Colaborador", leave: "Ausência", contracts: "Contrato", occurrences: "Ocorrência", compensation: "Remuneração", documents: "Documento", attendance: "Jornada", time_import_batches: "Importação Secullum", employee_code: "Matrícula Secullum", date: "Data", worked_minutes: "Minutos trabalhados", expected_minutes: "Minutos previstos", first_entry: "Entrada", last_exit: "Saída", late_minutes: "Minutos de atraso", extra_minutes: "Minutos extras", absence: "Falta", divergence: "Divergência" };
const label = (v: unknown) => LABELS[String(v)] ?? String(v ?? "—");
const str = (v: unknown) => v == null ? "" : String(v);
const date = (v: unknown) => v ? str(v).slice(0, 10).split("-").reverse().join("/") : "—";
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const duration = (v: unknown) => v == null ? "—" : `${Math.floor(Number(v) / 60)}h ${Number(v) % 60}min`;
function attendanceSituation(r: HrRow) {
  return [r.absence && "Falta", r.divergence && "Divergência", r.home_office && "Home office", r.medical_leave && "Atestado", r.day_off && "Folga", Number(r.late_minutes) > 0 && "Atraso"].filter(Boolean).join(" · ") || (Number(r.worked_minutes) > 0 ? "Presente" : "Sem batidas");
}
type List = { rows: HrRow[]; total: number; limit: number; kpis?: Record<string, number> };
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/hr/${path}`, { ...init, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Operação RH indisponível.");
  return body as T;
}
function useHrData<T>(path: string) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const timer = setTimeout(() => {
      setLoading(true); setError(""); setValue(null);
      void api<T>(path, { signal: controller.signal }).then((v) => { if (!disposed) setValue(v); })
        .catch((e: Error) => { if (!disposed) setError(e.message); })
        .finally(() => { if (!disposed) setLoading(false); });
    }, 150);
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, [path, revision]);
  return { value, error, loading, reload };
}
function LoadState({ loading, error, retry, children, framed = false }: { loading: boolean; error: string; retry: () => void; children: ReactNode; framed?: boolean }) {
  if (loading) return <div className="view-loading" role="status" aria-label="Carregando RH"><span /><span /><span /></div>;
  if (error) {
    const pending = error === "Banco de Recursos Humanos ainda não configurado.";
    const content = <div className="view-stack" role="alert"><p className="admin-message">{error}</p>{pending && <p className="admin-message">Os dados estarão disponíveis após a configuração do banco dedicado do RH.</p>}<div><button className="secondary-button" onClick={retry}><RefreshCw size={15} />Tentar novamente</button></div></div>;
    return framed ? <Panel className={styles.configuration} title={pending ? "Configuração do RH" : "Dados do RH"} action={<StatusBadge tone="amber">{pending ? "Aguardando configuração" : "Indisponível"}</StatusBadge>}>{content}</Panel> : content;
  }
  return children;
}
const TABS = ["Visão geral", "Colaboradores", "Jornada", "Férias e ausências", "Documentos", "Estrutura", "Recrutamento"];
export function HrView({ profile }: { profile: AuthProfile }) {
  const [tab, setTab] = useState(0);
  const manager = canManageHr(profile);
  return <div className="view-stack">
    <nav className={styles.tabs} aria-label="Recursos Humanos">{TABS.map((text, i) => <button key={text} aria-current={tab === i ? "page" : undefined} disabled={i === 6 || (i === 5 && !manager)} onClick={() => setTab(i)}>{text}{i === 6 && <StatusBadge>Em preparação</StatusBadge>}</button>)}</nav>
    {tab === 0 && <Overview />}
    {tab === 1 && <Employees profile={profile} />}
    {tab === 2 && <Attendance manager={manager} />}
    {tab === 3 && <Leave manager={manager} />}
    {tab === 4 && <Documents manager={manager} />}
    {tab === 5 && manager && <Structure />}
  </div>;
}
function Kpis({ values }: { values: Array<[string, string, string?]> }) {
  return <div className={`kpi-grid ${styles.kpis}`}>{values.map(([title, value, detail]) => <KpiCard key={title} label={title} value={value} detail={detail ?? ""} icon={<UsersRound size={18} />} />)}</div>;
}
function Overview() {
  const data = useHrData<HrOverview>("overview");
  const v = data.value;
  return <LoadState {...data} retry={data.reload} framed>{v && <>
    <Kpis values={[["Headcount ativo", str(v.kpis.active)], ["Afastados", str(v.kpis.leave)], ["Férias hoje", str(v.kpis.vacation)], ["Home office hoje", str(v.kpis.home_office)], ["Faltas hoje", str(v.kpis.absence)], ["Atrasos hoje", str(v.kpis.late)], ["Divergências hoje", str(v.kpis.divergence)]]} />
    <div className={`content-grid ${styles.panels}`}>
      <Summary title="Distribuição por setor" rows={v.departments} />
      <Summary title="Distribuição por vínculo" rows={v.employmentTypes} />
      <RecordPanel title="Movimentações recentes" rows={v.movements} render={(r) => <><b>{r.employee_name || label(r.entity_type)}</b><span>{label(r.action)} · {date(r.created_at)}</span></>} />
      <RecordPanel title="Férias e afastamentos próximos" rows={v.upcomingLeave} render={(r) => <><b>{r.employee_name}</b><span>{label(r.type)} · {date(r.start_date)} a {date(r.end_date)}</span></>} />
      <RecordPanel title="Alertas de jornada hoje" rows={v.attendanceAlerts} render={(r) => <><b>{r.employee_name}</b><span>{r.absence ? "Falta" : r.divergence ? "Divergência" : `Atraso de ${duration(r.late_minutes)}`}</span></>} />
      <RecordPanel title="Documentos a vencer em 30 dias" rows={v.expiringDocuments} render={(r) => <><b>{r.employee_name}</b><span>{r.title} · {date(r.expires_at)}</span></>} />
    </div>
  </>}</LoadState>;
}
function RecordPanel({ title, rows, render }: { title: string; rows: HrRow[]; render: (r: HrRow) => ReactNode }) {
  return <Panel title={title}>{rows.length ? <ul className={styles.records}>{rows.map((r, i) => <li key={str(r.id) || i}>{render(r)}</li>)}</ul> : <NoResults title="Nenhum registro" detail="" />}</Panel>;
}
function Summary({ title, rows }: { title: string; rows: HrRow[] }) {
  return <RecordPanel title={title} rows={rows} render={(r) => <><b>{label(r.label)}</b><span>{r.count}</span></>} />;
}
function Pager({ offset, total, onChange }: { offset: number; total: number; onChange: (n: number) => void }) {
  return <div className={styles.pager}><span>{total ? `${offset + 1}–${Math.min(offset + 100, total)} de ${total}` : "0 registros"}</span><button className="secondary-button" disabled={!offset} onClick={() => onChange(offset - 100)}>Anterior</button><button className="secondary-button" disabled={offset + 100 >= total} onClick={() => onChange(offset + 100)}>Próxima</button></div>;
}
function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return <button className="table-action" title={title} aria-label={title} onClick={onClick}>{children}</button>;
}
type Field = { name: string; title: string; kind?: "text" | "date" | "number" | "textarea" | "select" | "checkbox" | "employee" | "email"; options?: Array<[string, string]>; required?: boolean; min?: number; max?: number };
const options = (values: readonly string[]) => values.map((v): [string, string] => [v, label(v)]);
function EmployeePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [search, setSearch] = useState("");
  const data = useHrData<List>(`employees?search=${encodeURIComponent(search)}`);
  return <div className={styles.picker}><input className="inline-select" aria-label="Buscar colaborador por nome ou matrícula" placeholder="Nome ou matrícula" value={search} onChange={(e) => setSearch(e.target.value)} /><select className="inline-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Selecionar colaborador"><option value="">Selecionar</option>{value && !data.value?.rows.some((r) => r.id === value) && <option value={value}>Colaborador selecionado</option>}{data.value?.rows.map((r) => <option key={str(r.id)} value={str(r.id)}>{r.employee_code ? `${r.employee_code} · ${r.full_name}` : r.full_name}</option>)}</select>{data.error && <small role="alert">{data.error}</small>}</div>;
}
function Dialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={`case-center-install-dialog ${styles.dialog}`} onCancel={close} aria-label={title}><div className={styles.dialogHead}><h2>{title}</h2><IconButton title="Fechar" onClick={close}><X size={18} /></IconButton></div>{children}</dialog>;
}
function EditForm({ title, resource, fields: allFields, initial = {}, employeeId, close, done }: { title: string; resource: string; fields: Field[]; initial?: HrRow; employeeId?: string; close: () => void; done: () => void }) {
  const fields = employeeId ? allFields.filter((f) => f.name !== "employee_id") : allFields;
  const [values, setValues] = useState<Record<string, string | boolean>>(() => Object.fromEntries(fields.map((f) => [f.name, f.kind === "checkbox" ? initial[f.name] === undefined ? true : Boolean(initial[f.name]) : str(initial[f.name])])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if ((values.status === "TERMINATED" && initial.status !== "TERMINATED") || (values.active === false && initial.active !== false)) {
      if (!window.confirm("Confirmar desligamento ou inativação? O histórico será preservado.")) return;
    }
    setSaving(true); setError("");
    try {
      const payload = Object.fromEntries(fields.map((f) => [f.name, values[f.name] === "" ? null : f.kind === "number" ? Number(values[f.name]) : values[f.name]]));
      if (employeeId) payload.employee_id = employeeId;
      await api(`${resource}${initial.id ? `/${initial.id}` : ""}`, { method: initial.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json", ...(initial.updated_at ? { "If-Match": JSON.stringify(str(initial.updated_at)) } : {}) }, body: JSON.stringify(payload) });
      toast.success("Registro salvo."); done(); close();
    } catch (e) { const message = e instanceof Error ? e.message : "Falha ao salvar."; setError(message); toast.error(message); }
    finally { setSaving(false); }
  }
  return <Dialog title={title} close={() => { if (!saving) close(); }}><form onSubmit={(e) => void save(e)} className={styles.form}><fieldset disabled={saving}><div className={`user-admin-form ${styles.fields}`}>{fields.map((f) => <label key={f.name}><span>{f.title}{f.required ? " *" : ""}</span>
    {f.kind === "employee" ? <EmployeePicker value={str(values[f.name])} onChange={(v) => setValues({ ...values, [f.name]: v })} />
      : f.kind === "select" ? <select required={f.required} value={str(values[f.name])} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}><option value="">Selecionar</option>{f.options?.map(([v, text]) => <option key={v} value={v}>{text}</option>)}</select>
      : f.kind === "checkbox" ? <input type="checkbox" checked={Boolean(values[f.name])} onChange={(e) => setValues({ ...values, [f.name]: e.target.checked })} />
      : f.kind === "textarea" ? <textarea className="inline-select" maxLength={4000} value={str(values[f.name])} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
      : <input required={f.required} type={f.kind ?? "text"} min={f.min} max={f.max} step={f.kind === "number" ? "0.01" : undefined} maxLength={f.name.includes("code") ? 80 : 160} value={str(values[f.name])} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />}
  </label>)}</div></fieldset>{error && <p role="alert" className={styles.error}>{error}</p>}<div className={styles.actions}><button type="button" className="secondary-button" disabled={saving} onClick={close}>Cancelar</button><button className="primary-button" disabled={saving}><Save size={16} />{saving ? "Salvando…" : "Salvar"}</button></div></form></Dialog>;
}
function Employees({ profile }: { profile: AuthProfile }) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<HrRow | null>(null);
  const [edit, setEdit] = useState<HrRow | null>(null);
  const departments = useDirectory("departments");
  const positions = useDirectory("positions");
  const data = useHrData<List>(`employees?${new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), offset: String(offset) })}`);
  const overview = useHrData<HrOverview>("overview");
  const manager = canManageHr(profile);
  const change = (key: string, value: string) => { setOffset(0); setFilters({ ...filters, [key]: value }); };
  const refresh = () => { data.reload(); overview.reload(); };
  return <>
    {overview.value && <Kpis values={[["Ativos", str(overview.value.kpis.active)], ["Afastados", str(overview.value.kpis.leave)], ["Férias hoje", str(overview.value.kpis.vacation)], ["Admissões no mês", str(overview.value.kpis.admissions)], ["Ausências hoje", str(overview.value.kpis.absence)]]} />}
    <Panel title="Colaboradores" action={manager && <button className="primary-button" onClick={() => setEdit({ status: "ACTIVE", employment_type: "CLT" })}><Plus size={16} />Cadastrar</button>}>
      <div className={`user-admin-form ${styles.filters}`}><label><span>Nome ou matrícula</span><input value={filters.search ?? ""} onChange={(e) => change("search", e.target.value)} /></label>
        <Filter title="Status" values={options(EMPLOYEE_STATUSES)} value={filters.status} onChange={(v) => change("status", v)} />
        <Filter title="Setor" values={departments.map((r) => [str(r.id), str(r.name)])} value={filters.department_id} onChange={(v) => change("department_id", v)} />
        <Filter title="Cargo" values={positions.map((r) => [str(r.id), str(r.title)])} value={filters.position_id} onChange={(v) => change("position_id", v)} />
        <Filter title="Vínculo" values={options(EMPLOYMENT_TYPES)} value={filters.employment_type} onChange={(v) => change("employment_type", v)} />
      </div>
      <LoadState {...data} retry={data.reload}><Rows rows={data.value?.rows ?? []} columns={["Matrícula", "Nome", "Cargo", "Setor", "Vínculo", "Status", "Admissão", "Ações"]} render={(r) => <><td>{r.employee_code || "—"}</td><td><button className={styles.link} onClick={() => setSelected(r)}>{r.full_name}</button></td><td>{r.position_title || "—"}</td><td>{r.department_name || "—"}</td><td>{label(r.employment_type)}</td><td><StatusBadge>{label(r.status)}</StatusBadge></td><td>{date(r.admission_date)}</td><td>{manager && <IconButton title="Editar colaborador" onClick={() => setEdit(r)}><Pencil size={16} /></IconButton>}</td></>} /><Pager offset={offset} total={data.value?.total ?? 0} onChange={setOffset} /></LoadState>
    </Panel>
    {edit && <EditForm title={edit.id ? "Editar colaborador" : "Cadastrar colaborador"} resource="employees" initial={edit} fields={employeeFields(departments, positions, edit)} close={() => setEdit(null)} done={refresh} />}
    {selected && <EmployeeDrawer employee={selected} profile={profile} close={() => setSelected(null)} />}
  </>;
}
function Filter({ title, value, values, onChange }: { title: string; value?: string; values: Array<[string, string]>; onChange: (v: string) => void }) {
  return <label><span>{title}</span><select value={value ?? ""} onChange={(e) => onChange(e.target.value)}><option value="">Todos</option>{values.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>;
}
function Rows({ rows, columns, render }: { rows: HrRow[]; columns: string[]; render: (r: HrRow) => ReactNode }) {
  return rows.length ? <TableWrap><thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((r) => <tr key={str(r.id)}>{render(r)}</tr>)}</tbody></TableWrap> : <NoResults title="Nenhum registro" detail="" />;
}
function useDirectory(resource: "departments" | "positions", revision = 0) {
  const [rows, setRows] = useState<HrRow[]>([]);
  useEffect(() => {
    let disposed = false;
    void (async () => {
      const records: HrRow[] = [];
      let offset = 0;
      while (!disposed) { const page = await api<List>(`${resource}?offset=${offset}`); records.push(...page.rows); if (offset + 100 >= page.total) break; offset += 100; }
      if (!disposed) setRows(records);
    })().catch(() => { /* Main views display API errors; directory inputs remain empty. */ });
    return () => { disposed = true; };
  }, [resource, revision]);
  return rows;
}
function employeeFields(departments: HrRow[], positions: HrRow[], initial: HrRow): Field[] {
  return [
    { name: "employee_code", title: "Matrícula" }, { name: "full_name", title: "Nome completo", required: true }, { name: "preferred_name", title: "Nome preferido" },
    { name: "corporate_email", title: "E-mail corporativo", kind: "email" }, { name: "phone", title: "Telefone" },
    { name: "status", title: "Status", kind: "select", options: options(EMPLOYEE_STATUSES), required: true },
    { name: "department_id", title: "Setor", kind: "select", options: departments.filter((r) => r.active || r.id === initial.department_id).map((r) => [str(r.id), str(r.name)]) },
    { name: "position_id", title: "Cargo", kind: "select", options: positions.filter((r) => r.active || r.id === initial.position_id).map((r) => [str(r.id), `${r.title} · ${departments.find((d) => d.id === r.department_id)?.name ?? ""}`]) },
    { name: "manager_employee_id", title: "Gestor", kind: "employee" }, { name: "admission_date", title: "Admissão", kind: "date" }, { name: "termination_date", title: "Desligamento", kind: "date" },
    { name: "employment_type", title: "Vínculo", kind: "select", options: options(EMPLOYMENT_TYPES) }, { name: "secullum_employee_code", title: "Matrícula Secullum" }, { name: "notes", title: "Observações", kind: "textarea" },
  ];
}
function EmployeeDrawer({ employee, profile, close }: { employee: HrRow; profile: AuthProfile; close: () => void }) {
  const [tab, setTab] = useState(0);
  const data = useHrData<HrRow>(`employees/${employee.id}`);
  const manager = canManageHr(profile);
  return <Dialog title={str(employee.full_name)} close={close}><nav className={styles.tabs} aria-label="Colaborador">{["Dados gerais", "Contrato", "Jornada", "Férias/Ausências", "Documentos", "Histórico"].map((text, i) => <button key={text} aria-current={tab === i ? "page" : undefined} onClick={() => setTab(i)}>{text}</button>)}</nav><div className={styles.drawerBody}>
    {tab === 0 && <LoadState {...data} retry={data.reload}>{data.value && <dl className={styles.details}>{employeeFields([], [], employee).map((f) => <div key={f.name}><dt>{f.title}</dt><dd>{f.kind === "date" ? date(data.value?.[f.name]) : ["department_id", "position_id"].includes(f.name) ? employee[f.name === "department_id" ? "department_name" : "position_title"] || "—" : label(data.value?.[f.name])}</dd></div>)}</dl>}</LoadState>}
    {tab === 1 && <><Contracts employeeId={str(employee.id)} manager={manager} />{canReadSensitiveHr(profile) && <Compensation employeeId={str(employee.id)} />}</>}
    {tab === 2 && <Attendance employeeId={str(employee.id)} manager={false} />}
    {tab === 3 && <Leave employeeId={str(employee.id)} manager={manager} />}
    {tab === 4 && <Documents employeeId={str(employee.id)} manager={manager} />}
    {tab === 5 && <History employeeId={str(employee.id)} />}
  </div></Dialog>;
}
function Period({ start, end, change }: { start: string; end: string; change: (key: "start" | "end", value: string) => void }) {
  return <div className={`user-admin-form ${styles.filters}`}><label><span>De</span><input type="date" value={start} onChange={(e) => change("start", e.target.value)} /></label><label><span>Até</span><input type="date" value={end} onChange={(e) => change("end", e.target.value)} /></label></div>;
}
function Attendance({ manager, employeeId }: { manager: boolean; employeeId?: string }) {
  const [period, setPeriod] = useState({ start: today(), end: today() });
  const [offset, setOffset] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const data = useHrData<List>(`attendance?${new URLSearchParams({ ...period, offset: str(offset), ...(employeeId ? { employee_id: employeeId } : {}) })}`);
  const v = data.value;
  return <>
    {v?.kpis && <Kpis values={[[period.start === today() && period.end === today() ? "Presentes hoje" : "Presenças no período", str(v.kpis.present)], ["Atrasos", str(v.kpis.late)], ["Faltas", str(v.kpis.absence)], ["Divergências", str(v.kpis.divergence)], ["Horas extras", duration(v.kpis.extra)]]} />}
    <Panel title="Jornada" action={manager && <button className="primary-button" onClick={() => setImportOpen(true)}><Plus size={16} />Importar Secullum</button>}><Period {...period} change={(key, value) => { setPeriod({ ...period, [key]: value }); setOffset(0); }} />
      <LoadState {...data} retry={data.reload}><Rows rows={v?.rows ?? []} columns={["Colaborador", "Data", "Entrada", "Saída", "Trabalhadas", "Previstas", "Atraso", "Extras", "Situação"]} render={(r) => <><td>{r.employee_name}</td><td>{date(r.attendance_date)}</td><td>{r.first_entry || "—"}</td><td>{r.last_exit || "—"}</td><td>{duration(r.worked_minutes)}</td><td>{r.expected_minutes == null ? "—" : duration(r.expected_minutes)}</td><td>{duration(r.late_minutes)}</td><td>{duration(r.extra_minutes)}</td><td><StatusBadge tone={r.absence || r.divergence ? "amber" : r.home_office ? "blue" : "neutral"}>{attendanceSituation(r)}</StatusBadge></td></>} /><Pager offset={offset} total={v?.total ?? 0} onChange={setOffset} /></LoadState>
    </Panel>{importOpen && <SecullumImport close={() => setImportOpen(false)} done={data.reload} />}
  </>;
}
type Preview = SecullumPreview & { total: number; accepted: number; rejected: number };
function SecullumImport({ close, done }: { close: () => void; done: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ total: number; accepted: number; rejected: number; errors: Array<{ row: number; error: string }> } | null>(null);
  const previewAbort = useRef<AbortController | null>(null);
  useEffect(() => () => previewAbort.current?.abort(), []);
  async function send(mode: "preview" | "import") {
    if (!file || busy) return;
    setBusy(true); setError("");
    const controller = new AbortController(); previewAbort.current = controller;
    const form = new FormData(); form.set("file", file); form.set("mapping", JSON.stringify(mapping)); form.set("mode", mode);
    try {
      if (mode === "preview") { const v = await api<Preview>("attendance/import", { method: "POST", body: form, signal: controller.signal }); setPreview(v); setColumns(v.columns); setMapping(v.mapping); }
      else { const r = await api<NonNullable<typeof result>>("attendance/import", { method: "POST", body: form }); setResult(r); toast.success(`${r.accepted} linhas importadas; ${r.rejected} rejeitadas.`); done(); }
    } catch (e) { if (!(e instanceof Error && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Importação indisponível."); }
    finally { setBusy(false); }
  }
  return <Dialog title="Importar jornada Secullum" close={() => { if (!busy) close(); }}><div className={styles.drawerBody}><label className={styles.upload}>Arquivo CSV ou XLSX<input className="inline-select" disabled={busy || Boolean(result)} type="file" accept=".csv,.xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setColumns([]); setMapping({}); setError(""); }} /></label>
    {columns.length > 0 && !result && <div className={`user-admin-form ${styles.fields}`}>{SECULLUM_FIELDS.map((field) => <label key={field}><span>{label(field)}{["employee_code", "date", "worked_minutes"].includes(field) && " *"}</span><select disabled={busy} value={mapping[field] ?? ""} onChange={(e) => { setMapping({ ...mapping, [field]: e.target.value || undefined }); setPreview(null); }}><option value="">Não mapeado</option>{columns.map((col) => <option key={col}>{col}</option>)}</select></label>)}</div>}
    {preview && !result && <><PageIntro description={`${preview.total} linhas`} chips={[`${preview.accepted} válidas`, `${preview.rejected} rejeitadas`]} /><TableWrap><thead><tr><th>Linha</th><th>Matrícula</th><th>Data</th><th>Resultado</th></tr></thead><tbody>{preview.rows.map((r) => <tr key={r.rowNumber}><td>{r.rowNumber}</td><td>{r.entry?.employee_code || "—"}</td><td>{date(r.entry?.attendance_date)}</td><td>{r.error || "Válida"}</td></tr>)}</tbody></TableWrap></>}
    {result && <><PageIntro description="Importação concluída" chips={[`${result.accepted} aceitas`, `${result.rejected} rejeitadas`]} /><ul className={styles.records}>{result.errors.map((r) => <li key={r.row}>Linha {r.row}: {r.error}</li>)}</ul></>}
    {error && <p role="alert" className={styles.error}>{error}</p>}<div className={styles.actions}>{!result && <><button disabled={!file || busy} className="secondary-button" onClick={() => void send("preview")}><RefreshCw size={16} />Validar e pré-visualizar</button><button disabled={busy || !preview || preview.missing.length > 0 || preview.accepted === 0} className="primary-button" onClick={() => { if (preview?.rejected && !window.confirm(`Importar ${preview.accepted} linhas válidas e arquivar ${preview.rejected} rejeitadas?`)) return; void send("import"); }}><Save size={16} />{busy ? "Processando…" : "Importar"}</button></>}</div>
  </div></Dialog>;
}
const leaveFields: Field[] = [{ name: "employee_id", title: "Colaborador", kind: "employee", required: true }, { name: "type", title: "Tipo", kind: "select", options: options(LEAVE_TYPES), required: true }, { name: "start_date", title: "Início", kind: "date", required: true }, { name: "end_date", title: "Fim", kind: "date", required: true }, { name: "status", title: "Status", kind: "select", options: options(LEAVE_STATUSES), required: true }, { name: "notes", title: "Observações", kind: "textarea" }];
const occurrenceFields: Field[] = [{ name: "employee_id", title: "Colaborador", kind: "employee", required: true }, { name: "occurrence_date", title: "Data", kind: "date", required: true }, { name: "type", title: "Tipo", kind: "select", options: options(OCCURRENCE_TYPES), required: true }, { name: "minutes", title: "Minutos", kind: "number", min: 0, max: 1440 }, { name: "description", title: "Descrição", kind: "textarea" }];
function Leave({ manager, employeeId }: { manager: boolean; employeeId?: string }) {
  const [alertCutoff] = useState(() => { const day = new Date(`${today()}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + 7); return day.toISOString().slice(0, 10); });
  const [period, setPeriod] = useState({ start: "", end: "" });
  const [revision, setRevision] = useState(0);
  const [offset, setOffset] = useState(0);
  const [edit, setEdit] = useState<{ resource: "leave" | "occurrences"; row: HrRow } | null>(null);
  const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(period).filter(([, v]) => v)), offset: str(offset), ...(employeeId ? { employee_id: employeeId } : {}) });
  const data = useHrData<List>(`leave?${query}`);
  const occurrences = useHrData<List>(`occurrences?${query}`);
  const rows = data.value?.rows ?? [];
  const active = rows.filter((r) => ["APPROVED", "ACTIVE"].includes(str(r.status)) && str(r.start_date) <= today() && str(r.end_date) >= today());
  const upcoming = rows.filter((r) => str(r.end_date) >= today() && (r.status === "PLANNED" || (["APPROVED", "ACTIVE"].includes(str(r.status)) && str(r.start_date) > today())));
  const currentIds = new Set([...active, ...upcoming].map((r) => r.id));
  const historical = rows.filter((r) => !currentIds.has(r.id));
  const refresh = () => { data.reload(); occurrences.reload(); setRevision((v) => v + 1); };
  const renderLeave = (r: HrRow) => <><td>{r.employee_name}</td><td>{label(r.type)}</td><td>{date(r.start_date)}</td><td>{date(r.end_date)}</td><td><StatusBadge>{label(r.status)}</StatusBadge></td><td>{manager && <IconButton title="Editar ausência" onClick={() => setEdit({ resource: "leave", row: r })}><Pencil size={16} /></IconButton>}</td></>;
  return <>
    {!employeeId && <LeaveIndicators key={revision} total={data.value?.total} />}
    <div className={styles.alerts}>{active.map((r) => <StatusBadge key={str(r.id)} tone="amber">{r.employee_name} · {label(r.type)} · até {date(r.end_date)}{str(r.end_date) <= alertCutoff ? " · terminando" : ""}</StatusBadge>)}{rows.filter((r) => ["PLANNED", "APPROVED"].includes(str(r.status)) && str(r.start_date) > today() && str(r.start_date) <= alertCutoff).map((r) => <StatusBadge key={str(r.id)}>{r.employee_name} · {label(r.type)} · início {date(r.start_date)}</StatusBadge>)}</div>
    <Panel title="Férias e ausências" action={manager && <button className="primary-button" onClick={() => setEdit({ resource: "leave", row: { employee_id: employeeId ?? "", type: "VACATION", status: "PLANNED" } })}><CalendarDays size={16} />Registrar</button>}><Period {...period} change={(key, value) => { setPeriod({ ...period, [key]: value }); setOffset(0); }} /></Panel>
    <LoadState {...data} retry={data.reload} framed>
      <div className={`content-grid ${styles.panels}`}>{([["Em andamento", active], ["Próximas", upcoming], ["Histórico", historical]] as const).map(([title, records]) => <Panel key={title} title={title} subtitle="Registros da página atual"><Rows rows={records} columns={["Colaborador", "Tipo", "Início", "Fim", "Status", "Ações"]} render={renderLeave} /></Panel>)}</div>
      <Pager offset={offset} total={data.value?.total ?? 0} onChange={setOffset} />
    </LoadState>
    <Panel title="Ocorrências pontuais" action={manager && <button className="secondary-button" onClick={() => setEdit({ resource: "occurrences", row: { employee_id: employeeId ?? "", occurrence_date: today(), type: "HOME_OFFICE" } })}><Clock3 size={16} />Registrar ocorrência</button>}><LoadState {...occurrences} retry={occurrences.reload}><Rows rows={occurrences.value?.rows ?? []} columns={["Data", "Colaborador", "Tipo", "Minutos", "Ações"]} render={(r) => <><td>{date(r.occurrence_date)}</td><td>{r.employee_name}</td><td>{label(r.type)}</td><td>{r.minutes ?? "—"}</td><td>{manager && <><IconButton title="Editar ocorrência" onClick={() => setEdit({ resource: "occurrences", row: r })}><Pencil size={16} /></IconButton><IconButton title="Remover ocorrência" onClick={() => void remove(`occurrences/${r.id}`, refresh)}><Trash2 size={16} /></IconButton></>}</td></>} /><Pager offset={offset} total={occurrences.value?.total ?? 0} onChange={setOffset} /></LoadState></Panel>
    {edit && <EditForm title={edit.resource === "leave" ? "Férias / ausência" : "Ocorrência pontual"} resource={edit.resource} initial={edit.row} fields={edit.resource === "leave" ? leaveFields : occurrenceFields} employeeId={employeeId} close={() => setEdit(null)} done={refresh} />}
  </>;
}
function LeaveIndicators({ total }: { total?: number }) {
  const data = useHrData<HrOverview>("overview");
  return data.value && <Kpis values={[["Férias hoje", str(data.value.kpis.vacation)], ["Afastados", str(data.value.kpis.leave)], ["Registros no recorte", total === undefined ? "—" : str(total)]]} />;
}
async function remove(path: string, refresh: () => void) {
  if (!window.confirm("Confirmar remoção? Esta ação ficará registrada no histórico.")) return;
  try { const body = await api<{ warning?: string }>(path, { method: "DELETE" }); if (body.warning) toast.warning(body.warning); else toast.success("Registro removido."); refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Falha na remoção."); }
}
function Documents({ manager, employeeId }: { manager: boolean; employeeId?: string }) {
  const [offset, setOffset] = useState(0);
  const [upload, setUpload] = useState(false);
  const data = useHrData<List>(`documents?offset=${offset}${employeeId ? `&employee_id=${employeeId}` : ""}`);
  async function download(id: string) {
    try { const { url } = await api<{ url: string }>(`documents/${id}/download`); window.open(url, "_blank", "noopener,noreferrer"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Documento indisponível."); }
  }
  const cutoff = new Date(`${today()}T12:00:00Z`); cutoff.setUTCDate(cutoff.getUTCDate() + 30);
  const soon = cutoff.toISOString().slice(0, 10);
  return <><Panel title="Documentos" action={manager && <button className="primary-button" onClick={() => setUpload(true)}><Plus size={16} />Adicionar</button>}><LoadState {...data} retry={data.reload}><Rows rows={data.value?.rows ?? []} columns={["Colaborador", "Documento", "Categoria", "Envio", "Vencimento", "Status", "Ações"]} render={(r) => {
    const expiry = str(r.expires_at).slice(0, 10);
    const expired = Boolean(expiry && expiry < today());
    const near = Boolean(expiry && !expired && expiry <= soon);
    return <><td>{r.employee_name}</td><td>{r.title}</td><td>{r.category}</td><td>{date(r.created_at)}</td><td>{date(r.expires_at)}</td><td><div className={styles.alerts}><StatusBadge tone={expired ? "red" : near ? "amber" : "green"}>{expired ? "Vencido" : near ? "Próximo do vencimento" : "Válido"}</StatusBadge>{r.is_sensitive && <StatusBadge>Sensível</StatusBadge>}</div></td><td><div className="row-actions"><IconButton title="Baixar documento" onClick={() => void download(str(r.id))}><Download size={16} /></IconButton>{manager && <IconButton title="Remover documento" onClick={() => void remove(`documents/${r.id}`, data.reload)}><Trash2 size={16} /></IconButton>}</div></td></>;
  }} /><Pager offset={offset} total={data.value?.total ?? 0} onChange={setOffset} /></LoadState></Panel>{upload && <DocumentUpload employeeId={employeeId} close={() => setUpload(false)} done={data.reload} />}</>;
}
function DocumentUpload({ employeeId, close, done }: { employeeId?: string; close: () => void; done: () => void }) {
  const [employee, setEmployee] = useState(employeeId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget); form.set("employee_id", employee); form.set("is_sensitive", form.get("is_sensitive") ? "true" : "false");
    try { await api("documents", { method: "POST", body: form }); toast.success("Documento armazenado."); done(); close(); }
    catch (e) { setError(e instanceof Error ? e.message : "Upload indisponível."); }
    finally { setBusy(false); }
  }
  return <Dialog title="Adicionar documento privado" close={() => { if (!busy) close(); }}><form className={styles.form} onSubmit={(e) => void save(e)}><fieldset disabled={busy}><div className={`user-admin-form ${styles.fields}`}>{!employeeId && <label><span>Colaborador</span><EmployeePicker value={employee} onChange={setEmployee} /></label>}<label><span>Título</span><input name="title" required maxLength={160} /></label><label><span>Categoria</span><input name="category" required maxLength={160} /></label><label><span>Vencimento</span><input name="expires_at" type="date" /></label><label><span>Arquivo PDF, PNG ou JPEG</span><input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg" required /></label><label className="mini-check"><input name="is_sensitive" type="checkbox" defaultChecked />Sensível</label></div></fieldset>{error && <p role="alert" className={styles.error}>{error}</p>}<button className="primary-button" disabled={busy || !employee}><FileText size={16} />{busy ? "Enviando…" : "Enviar"}</button></form></Dialog>;
}
function Structure() {
  const [revision, setRevision] = useState(0);
  const departments = useDirectory("departments", revision);
  return <div className={`content-grid ${styles.panels}`}><StructureList section="departments" departments={departments} changed={() => setRevision((v) => v + 1)} /><StructureList section="positions" departments={departments} changed={() => setRevision((v) => v + 1)} /></div>;
}
function StructureList({ section, departments, changed }: { section: "departments" | "positions"; departments: HrRow[]; changed: () => void }) {
  const [offset, setOffset] = useState(0);
  const [edit, setEdit] = useState<HrRow | null>(null);
  const data = useHrData<List>(`${section}?offset=${offset}`);
  const fields: Field[] = [{ name: section === "departments" ? "name" : "title", title: "Nome", required: true }, ...(section === "positions" ? [{ name: "department_id", title: "Setor", kind: "select" as const, options: departments.map((r): [string, string] => [str(r.id), str(r.name)]), required: true }] : []), { name: "description", title: "Descrição", kind: "textarea" }, { name: "active", title: "Ativo", kind: "checkbox" }];
  return <Panel title={section === "departments" ? "Setores" : "Cargos"} action={<button className="primary-button" onClick={() => setEdit({ active: true })}><Plus size={16} />Cadastrar</button>}><LoadState {...data} retry={data.reload}><Rows rows={data.value?.rows ?? []} columns={["Nome", section === "departments" ? "Descrição" : "Setor", "Status", "Ações"]} render={(r) => <><td>{r.name ?? r.title}</td><td>{section === "departments" ? r.description || "—" : departments.find((d) => d.id === r.department_id)?.name ?? "—"}</td><td><StatusBadge tone={r.active ? "green" : "neutral"}>{r.active ? "Ativo" : "Inativo"}</StatusBadge></td><td><IconButton title="Editar estrutura" onClick={() => setEdit(r)}><Pencil size={16} /></IconButton></td></>} /><Pager offset={offset} total={data.value?.total ?? 0} onChange={setOffset} /></LoadState>{edit && <EditForm title={section === "departments" ? "Setor" : "Cargo"} resource={section} fields={fields} initial={edit} close={() => setEdit(null)} done={() => { data.reload(); changed(); }} />}</Panel>;
}
const contractFields: Field[] = [{ name: "employee_id", title: "Colaborador", kind: "employee", required: true }, { name: "contract_type", title: "Vínculo", kind: "select", options: options(EMPLOYMENT_TYPES), required: true }, { name: "start_date", title: "Início", kind: "date", required: true }, { name: "end_date", title: "Fim", kind: "date" }, { name: "weekly_hours", title: "Horas semanais", kind: "number", min: 0, max: 168 }, { name: "status", title: "Status", kind: "select", options: options(["ACTIVE", "FINISHED", "CANCELED"]), required: true }, { name: "notes", title: "Observações", kind: "textarea" }];
function Contracts({ employeeId, manager }: { employeeId: string; manager: boolean }) {
  const [edit, setEdit] = useState<HrRow | null>(null);
  const [offset, setOffset] = useState(0);
  const data = useHrData<List>(`contracts?employee_id=${employeeId}&offset=${offset}`);
  return <Panel title="Contratos" action={manager && <button className="secondary-button" onClick={() => setEdit({ employee_id: employeeId, contract_type: "CLT", status: "ACTIVE" })}><Plus size={16} />Contrato</button>}><LoadState {...data} retry={data.reload}><Rows rows={data.value?.rows ?? []} columns={["Vínculo", "Início", "Fim", "Horas semanais", "Status", "Ações"]} render={(r) => <><td>{label(r.contract_type)}</td><td>{date(r.start_date)}</td><td>{date(r.end_date)}</td><td>{r.weekly_hours ?? "—"}</td><td>{label(r.status)}</td><td>{manager && <IconButton title="Editar contrato" onClick={() => setEdit(r)}><Pencil size={16} /></IconButton>}</td></>} /><Pager offset={offset} total={data.value?.total ?? 0} onChange={setOffset} /></LoadState>{edit && <EditForm title="Contrato" resource="contracts" fields={contractFields} employeeId={employeeId} initial={edit} close={() => setEdit(null)} done={data.reload} />}</Panel>;
}
function Compensation({ employeeId }: { employeeId: string }) {
  const [edit, setEdit] = useState<HrRow | null>(null);
  const [offset, setOffset] = useState(0);
  const data = useHrData<List>(`compensation?employee_id=${employeeId}&offset=${offset}`);
  const fields: Field[] = [{ name: "employee_id", title: "Colaborador", kind: "employee", required: true }, { name: "effective_from", title: "Vigência inicial", kind: "date", required: true }, { name: "effective_to", title: "Vigência final", kind: "date" }, { name: "salary_amount", title: "Valor (R$)", kind: "number", min: 0, max: 99999999 }, { name: "salary_type", title: "Tipo", kind: "select", options: options(["MONTHLY", "HOURLY", "OTHER"]), required: true }, { name: "notes", title: "Observações", kind: "textarea" }];
  return <Panel title="Remuneração · acesso restrito" action={<button className="secondary-button" onClick={() => setEdit({ employee_id: employeeId, salary_type: "MONTHLY", effective_from: today() })}><Plus size={16} />Registrar</button>}><LoadState {...data} retry={data.reload}><Rows rows={data.value?.rows ?? []} columns={["Início", "Fim", "Valor", "Tipo", "Ações"]} render={(r) => <><td>{date(r.effective_from)}</td><td>{date(r.effective_to)}</td><td>{r.salary_amount == null ? "—" : formatCurrency(Number(r.salary_amount))}</td><td>{label(r.salary_type)}</td><td><IconButton title="Editar remuneração" onClick={() => setEdit(r)}><Pencil size={16} /></IconButton></td></>} /><Pager offset={offset} total={data.value?.total ?? 0} onChange={setOffset} /></LoadState>{edit && <EditForm title="Remuneração" resource="compensation" fields={fields} employeeId={employeeId} initial={edit} close={() => setEdit(null)} done={data.reload} />}</Panel>;
}
function History({ employeeId }: { employeeId: string }) {
  const [offset, setOffset] = useState(0);
  const data = useHrData<List>(`audit?employee_id=${employeeId}&offset=${offset}`);
  return <Panel title="Histórico de alterações"><LoadState {...data} retry={data.reload}><Rows rows={data.value?.rows ?? []} columns={["Data", "Ação", "Registro"]} render={(r) => <><td>{date(r.created_at)}</td><td>{label(r.action)}</td><td>{label(r.entity_type)}</td></>} /><Pager offset={offset} total={data.value?.total ?? 0} onChange={setOffset} /></LoadState></Panel>;
}
