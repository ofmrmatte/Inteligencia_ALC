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
  xptCode: string;
  coordinator: string;
  supervisors: string;
  active: boolean;
}

const EMPTY_DRAFT: UnitDraft = {
  sigla: "",
  baseName: "",
  xptCode: "",
  coordinator: "",
  supervisors: "",
  active: true,
};

async function readJson(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || fallback);
  return body as OperationalDirectoryPayload & { ok?: boolean };
}

function draftFromUnit(unit: OperationalUnit): UnitDraft {
  return {
    originalUnitKey: unit.unitKey,
    sigla: unit.sigla,
    baseName: unit.baseName,
    xptCode: unit.xptCode,
    coordinator: unit.coordinator,
    supervisors: unit.supervisors.join("\n"),
    active: unit.active,
  };
}

export function OperationalUnitsPanel() {
  const [payload, setPayload] = useState<OperationalDirectoryPayload | null>(null);
  const [draft, setDraft] = useState<UnitDraft>(EMPTY_DRAFT);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const body = await readJson(await fetch("/api/settings/operational-units", { cache: "no-store" }), "Falha ao carregar bases.");
      setPayload(body);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao carregar bases.");
    }
  }

  useEffect(() => { void load(); }, []);

  const units = useMemo(() => (payload?.units ?? []).filter((unit) => {
    const haystack = `${unit.xptCode} ${unit.sigla} ${unit.baseName} ${unit.coordinator} ${unit.supervisors.join(" ")}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  }).sort((a, b) => `${a.xptCode}|${a.sigla}|${a.baseName}`.localeCompare(`${b.xptCode}|${b.sigla}|${b.baseName}`, "pt-BR")), [payload, search]);

  const xptCount = new Set((payload?.units ?? []).map((unit) => unit.xptCode).filter(Boolean)).size;
  const coordinatorCount = new Set((payload?.units ?? []).map((unit) => unit.coordinator).filter(Boolean)).size;

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const editing = Boolean(draft.originalUnitKey);
      const body = await readJson(await fetch("/api/settings/operational-units", {
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar base.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Bases e estrutura operacional" subtitle="Cadastro mestre de Filial XPT → SVC/Sigla → Base → Coordenador → Supervisor">
      <div className={styles.summary}>
        <span><Building2 size={15} /><strong>{payload?.units.length ?? 0}</strong> bases/SVC</span>
        <span><strong>{xptCount}</strong> filiais XPT</span>
        <span><strong>{coordinatorCount}</strong> coordenadores</span>
        <span className={styles.masterBadge}>Fonte oficial do painel</span>
      </div>

      <form className={styles.form} onSubmit={save}>
        <div className={styles.formTitle}>
          <div><strong>{draft.originalUnitKey ? "Editar base" : "Cadastrar nova base"}</strong><span>Use a mesma estrutura das planilhas operacionais.</span></div>
          {draft.originalUnitKey ? <button className={styles.closeButton} type="button" onClick={() => setDraft(EMPTY_DRAFT)} title="Cancelar edição"><X size={15} /></button> : null}
        </div>
        <div className={styles.grid}>
          <label><span>Filial XPT</span><input required={!draft.originalUnitKey} value={draft.xptCode} onChange={(event) => setDraft({ ...draft, xptCode: event.target.value.toUpperCase() })} placeholder="EGO17" /></label>
          <label><span>Sigla SVC</span><input required value={draft.sigla} onChange={(event) => setDraft({ ...draft, sigla: event.target.value.toUpperCase() })} placeholder="SSP5" /></label>
          <label className={styles.wide}><span>Base</span><input required value={draft.baseName} onChange={(event) => setDraft({ ...draft, baseName: event.target.value })} placeholder="BARUERI" /></label>
          <label className={styles.wide}><span>Coordenador responsável</span><input required={!draft.originalUnitKey} value={draft.coordinator} onChange={(event) => setDraft({ ...draft, coordinator: event.target.value })} placeholder="Nome do coordenador" /></label>
          <label className={styles.supervisors}><span>Supervisor(es)</span><textarea value={draft.supervisors} onChange={(event) => setDraft({ ...draft, supervisors: event.target.value })} placeholder="Um supervisor por linha" rows={3} /></label>
          <label className={styles.active}><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /><span>Base ativa</span></label>
        </div>
        <div className={styles.actions}>
          <small>A combinação SVC + Base é a identidade da unidade. O XPT representa a filial responsável.</small>
          <button className="primary-button primary-button--small" type="submit" disabled={saving}>{draft.originalUnitKey ? <Save size={14} /> : <Plus size={14} />}{draft.originalUnitKey ? "Salvar alterações" : "Cadastrar base"}</button>
        </div>
      </form>

      {message ? <p className={styles.message}>{message}</p> : null}

      <div className={styles.tableTop}>
        <div><strong>Bases cadastradas</strong><span>As bases enviadas nas planilhas XPT/SVC e Coordenadores já estão cadastradas abaixo.</span></div>
        <label className={styles.search}><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar XPT, SVC, base ou responsável" /></label>
      </div>
      <TableWrap>
        <thead><tr><th>Filial XPT</th><th>SVC / Base</th><th>Coordenador</th><th>Supervisores</th><th>Status</th><th className="align-right">Ação</th></tr></thead>
        <tbody>
          {units.map((unit) => (
            <tr key={unit.unitKey}>
              <td><strong>{unit.xptCode || "—"}</strong></td>
              <td><strong>{unit.sigla} - {unit.baseName}</strong><small className="cell-subtitle">{unit.unitKey}</small></td>
              <td>{unit.coordinator || "Não informado"}</td>
              <td><span className={styles.supervisorText}>{unit.supervisors.length ? unit.supervisors.join(" · ") : "Não informado"}</span></td>
              <td><StatusBadge tone={unit.active ? "green" : "amber"}>{unit.active ? "Ativa" : "Inativa"}</StatusBadge></td>
              <td className="align-right"><button className="table-action" type="button" title="Editar base" onClick={() => setDraft(draftFromUnit(unit))}><Edit3 size={14} /></button></td>
            </tr>
          ))}
          {!units.length ? <tr><td colSpan={6}>Nenhuma base encontrada.</td></tr> : null}
        </tbody>
      </TableWrap>
    </Panel>
  );
}
