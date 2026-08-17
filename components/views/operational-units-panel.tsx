"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Building2, Edit3, Plus, Save, Search, X } from "lucide-react";
import type { OperationalDirectoryPayload, OperationalUnit } from "@/lib/operational-directory";
import { Panel, StatusBadge } from "@/components/ui";
import { TableWrap } from "./shared";
import styles from "./operational-units-panel.module.css";

interface UnitDraft {
  originalUnitKey?: string;
  sigla: string;
  baseName: string;
  coordinator: string;
  supervisors: string;
  active: boolean;
}

interface XptRecord {
  xptCode: string;
  svcSiglas: string[];
  active: boolean;
}

interface XptPayload {
  xpts: XptRecord[];
  svcSiglas: string[];
}

interface XptDraft {
  originalXptCode?: string;
  xptCode: string;
  svcSiglas: string;
  active: boolean;
}

const EMPTY_DRAFT: UnitDraft = {
  sigla: "",
  baseName: "",
  coordinator: "",
  supervisors: "",
  active: true,
};

const EMPTY_XPT_DRAFT: XptDraft = {
  xptCode: "",
  svcSiglas: "",
  active: true,
};

async function readJson<T>(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || fallback);
  return body as T;
}

function draftFromUnit(unit: OperationalUnit): UnitDraft {
  return {
    originalUnitKey: unit.unitKey,
    sigla: unit.sigla,
    baseName: unit.baseName,
    coordinator: unit.coordinator,
    supervisors: unit.supervisors.join("\n"),
    active: unit.active,
  };
}

function draftFromXpt(xpt: XptRecord): XptDraft {
  return {
    originalXptCode: xpt.xptCode,
    xptCode: xpt.xptCode,
    svcSiglas: xpt.svcSiglas.join("\n"),
    active: xpt.active,
  };
}

export function OperationalUnitsPanel() {
  const [payload, setPayload] = useState<OperationalDirectoryPayload | null>(null);
  const [xptPayload, setXptPayload] = useState<XptPayload>({ xpts: [], svcSiglas: [] });
  const [draft, setDraft] = useState<UnitDraft>(EMPTY_DRAFT);
  const [xptDraft, setXptDraft] = useState<XptDraft>(EMPTY_XPT_DRAFT);
  const [search, setSearch] = useState("");
  const [xptSearch, setXptSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingXpt, setSavingXpt] = useState(false);
  const [message, setMessage] = useState("");
  const [xptMessage, setXptMessage] = useState("");

  async function load() {
    try {
      const [unitsBody, xptsBody] = await Promise.all([
        readJson<OperationalDirectoryPayload>(await fetch("/api/settings/operational-units", { cache: "no-store" }), "Falha ao carregar bases."),
        readJson<XptPayload>(await fetch("/api/settings/operational-xpts", { cache: "no-store" }), "Falha ao carregar XPTs."),
      ]);
      setPayload(unitsBody);
      setXptPayload(xptsBody);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao carregar estrutura operacional.");
    }
  }

  useEffect(() => { void load(); }, []);

  const units = useMemo(() => (payload?.units ?? []).filter((unit) => {
    const haystack = `${unit.sigla} ${unit.baseName} ${unit.coordinator} ${unit.supervisors.join(" ")}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  }).sort((a, b) => `${a.sigla}|${a.baseName}`.localeCompare(`${b.sigla}|${b.baseName}`, "pt-BR")), [payload, search]);

  const xpts = useMemo(() => xptPayload.xpts.filter((xpt) => {
    const haystack = `${xpt.xptCode} ${xpt.svcSiglas.join(" ")}`.toLowerCase();
    return haystack.includes(xptSearch.toLowerCase());
  }).sort((a, b) => a.xptCode.localeCompare(b.xptCode, "pt-BR")), [xptPayload, xptSearch]);

  const coordinatorCount = new Set((payload?.units ?? []).map((unit) => unit.coordinator).filter(Boolean)).size;
  const svcCount = new Set((payload?.units ?? []).map((unit) => unit.sigla).filter(Boolean)).size;

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const editing = Boolean(draft.originalUnitKey);
      const body = await readJson<OperationalDirectoryPayload & { ok?: boolean }>(await fetch("/api/settings/operational-units", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          supervisors: draft.supervisors.split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean),
        }),
      }), editing ? "Falha ao atualizar base." : "Falha ao cadastrar base.");
      setPayload(body);
      setDraft(EMPTY_DRAFT);
      setMessage(editing ? "Base e hierarquia atualizadas." : "Nova base cadastrada.");
      const refreshedXpts = await readJson<XptPayload>(await fetch("/api/settings/operational-xpts", { cache: "no-store" }), "Falha ao atualizar vínculos XPT.");
      setXptPayload(refreshedXpts);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar base.");
    } finally {
      setSaving(false);
    }
  }

  async function saveXpt(event: FormEvent) {
    event.preventDefault();
    setSavingXpt(true);
    setXptMessage("");
    try {
      const editing = Boolean(xptDraft.originalXptCode);
      const body = await readJson<XptPayload & { ok?: boolean }>(await fetch("/api/settings/operational-xpts", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...xptDraft,
          svcSiglas: xptDraft.svcSiglas.split(/[\n,;]+/).map((value) => value.trim().toUpperCase()).filter(Boolean),
        }),
      }), editing ? "Falha ao atualizar XPT." : "Falha ao cadastrar XPT.");
      setXptPayload(body);
      setXptDraft(EMPTY_XPT_DRAFT);
      setXptMessage(editing ? "XPT e relações regionais atualizados." : "Novo XPT cadastrado.");
      const refreshedUnits = await readJson<OperationalDirectoryPayload>(await fetch("/api/settings/operational-units", { cache: "no-store" }), "Falha ao atualizar estrutura SVC.");
      setPayload(refreshedUnits);
    } catch (error) {
      setXptMessage(error instanceof Error ? error.message : "Falha ao salvar XPT.");
    } finally {
      setSavingXpt(false);
    }
  }

  return (
    <div className={styles.stack}>
      <Panel title="SVC e bases" subtitle="Cadastro mestre independente de SVC → Base → Coordenador → Supervisor">
        <div className={styles.summary}>
          <span><Building2 size={15} /><strong>{payload?.units.length ?? 0}</strong> bases</span>
          <span><strong>{svcCount}</strong> SVCs</span>
          <span><strong>{coordinatorCount}</strong> coordenadores</span>
          <span className={styles.masterBadge}>Fonte oficial de SVC e bases</span>
        </div>

        <form className={styles.form} onSubmit={save}>
          <div className={styles.formTitle}>
            <div><strong>{draft.originalUnitKey ? "Editar base" : "Cadastrar nova base"}</strong><span>O XPT não faz parte da identidade da base e é gerenciado separadamente.</span></div>
            {draft.originalUnitKey ? <button className={styles.closeButton} type="button" onClick={() => setDraft(EMPTY_DRAFT)} title="Cancelar edição"><X size={15} /></button> : null}
          </div>
          <div className={styles.grid}>
            <label><span>Sigla SVC</span><input required value={draft.sigla} onChange={(event) => setDraft({ ...draft, sigla: event.target.value.toUpperCase() })} placeholder="SSP5" /></label>
            <label className={styles.wide}><span>Base</span><input required value={draft.baseName} onChange={(event) => setDraft({ ...draft, baseName: event.target.value })} placeholder="BARUERI" /></label>
            <label className={styles.wide}><span>Coordenador responsável</span><input required value={draft.coordinator} onChange={(event) => setDraft({ ...draft, coordinator: event.target.value })} placeholder="Nome do coordenador" /></label>
            <label className={styles.supervisors}><span>Supervisor(es)</span><textarea value={draft.supervisors} onChange={(event) => setDraft({ ...draft, supervisors: event.target.value })} placeholder="Um supervisor por linha" rows={3} /></label>
            <label className={styles.active}><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /><span>Base ativa</span></label>
          </div>
          <div className={styles.actions}>
            <small>A identidade da unidade é somente SVC + Base. Coordenador e supervisores pertencem à estrutura da base.</small>
            <button className="primary-button primary-button--small" type="submit" disabled={saving}>{draft.originalUnitKey ? <Save size={14} /> : <Plus size={14} />}{draft.originalUnitKey ? "Salvar alterações" : "Cadastrar base"}</button>
          </div>
        </form>

        {message ? <p className={styles.message}>{message}</p> : null}

        <div className={styles.tableTop}>
          <div><strong>Bases cadastradas</strong><span>SVC e base permanecem independentes do cadastro de XPT.</span></div>
          <label className={styles.search}><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar SVC, base ou responsável" /></label>
        </div>
        <TableWrap>
          <thead><tr><th>SVC / Base</th><th>Coordenador</th><th>Supervisores</th><th>Status</th><th className="align-right">Ação</th></tr></thead>
          <tbody>
            {units.map((unit) => (
              <tr key={unit.unitKey}>
                <td><strong>{unit.sigla} - {unit.baseName}</strong><small className="cell-subtitle">{unit.unitKey}</small></td>
                <td>{unit.coordinator || "Não informado"}</td>
                <td><span className={styles.supervisorText}>{unit.supervisors.length ? unit.supervisors.join(" · ") : "Não informado"}</span></td>
                <td><StatusBadge tone={unit.active ? "green" : "amber"}>{unit.active ? "Ativa" : "Inativa"}</StatusBadge></td>
                <td className="align-right"><button className="table-action" type="button" title="Editar base" onClick={() => setDraft(draftFromUnit(unit))}><Edit3 size={14} /></button></td>
              </tr>
            ))}
            {!units.length ? <tr><td colSpan={5}>Nenhuma base encontrada.</td></tr> : null}
          </tbody>
        </TableWrap>
      </Panel>

      <Panel title="XPT" subtitle="Cadastro independente; a relação com SVC representa somente a abrangência regional">
        <div className={styles.summary}>
          <span><Building2 size={15} /><strong>{xptPayload.xpts.length}</strong> XPTs</span>
          <span><strong>{xptPayload.xpts.filter((xpt) => xpt.active).length}</strong> ativos</span>
          <span className={styles.masterBadge}>Estrutura independente de XPT</span>
        </div>

        <form className={styles.form} onSubmit={saveXpt}>
          <div className={styles.formTitle}>
            <div><strong>{xptDraft.originalXptCode ? "Editar XPT" : "Cadastrar novo XPT"}</strong><span>Associe SVCs apenas para representar a região atendida. O XPT continua sendo uma unidade independente.</span></div>
            {xptDraft.originalXptCode ? <button className={styles.closeButton} type="button" onClick={() => setXptDraft(EMPTY_XPT_DRAFT)} title="Cancelar edição"><X size={15} /></button> : null}
          </div>
          <div className={styles.xptGrid}>
            <label><span>Código XPT</span><input required value={xptDraft.xptCode} onChange={(event) => setXptDraft({ ...xptDraft, xptCode: event.target.value.toUpperCase() })} placeholder="EGO17" /></label>
            <label className={styles.xptRelations}><span>SVCs da região</span><textarea value={xptDraft.svcSiglas} onChange={(event) => setXptDraft({ ...xptDraft, svcSiglas: event.target.value })} placeholder="Uma sigla SVC por linha" rows={3} /></label>
            <label className={styles.active}><input type="checkbox" checked={xptDraft.active} onChange={(event) => setXptDraft({ ...xptDraft, active: event.target.checked })} /><span>XPT ativo</span></label>
          </div>
          <div className={styles.actions}>
            <small>SVCs disponíveis: {xptPayload.svcSiglas.join(" · ") || "nenhuma cadastrada"}.</small>
            <button className="primary-button primary-button--small" type="submit" disabled={savingXpt}>{xptDraft.originalXptCode ? <Save size={14} /> : <Plus size={14} />}{xptDraft.originalXptCode ? "Salvar XPT" : "Cadastrar XPT"}</button>
          </div>
        </form>

        {xptMessage ? <p className={styles.message}>{xptMessage}</p> : null}

        <div className={styles.tableTop}>
          <div><strong>XPTs cadastrados</strong><span>O vínculo regional não transforma XPT em SVC, base ou nível hierárquico.</span></div>
          <label className={styles.search}><Search size={14} /><input value={xptSearch} onChange={(event) => setXptSearch(event.target.value)} placeholder="Buscar XPT ou SVC relacionada" /></label>
        </div>
        <TableWrap>
          <thead><tr><th>XPT</th><th>SVCs da região</th><th>Status</th><th className="align-right">Ação</th></tr></thead>
          <tbody>
            {xpts.map((xpt) => (
              <tr key={xpt.xptCode}>
                <td><strong>{xpt.xptCode}</strong></td>
                <td><span className={styles.supervisorText}>{xpt.svcSiglas.length ? xpt.svcSiglas.join(" · ") : "Nenhuma SVC vinculada"}</span></td>
                <td><StatusBadge tone={xpt.active ? "green" : "amber"}>{xpt.active ? "Ativo" : "Inativo"}</StatusBadge></td>
                <td className="align-right"><button className="table-action" type="button" title="Editar XPT" onClick={() => setXptDraft(draftFromXpt(xpt))}><Edit3 size={14} /></button></td>
              </tr>
            ))}
            {!xpts.length ? <tr><td colSpan={4}>Nenhum XPT encontrado.</td></tr> : null}
          </tbody>
        </TableWrap>
      </Panel>
    </div>
  );
}
