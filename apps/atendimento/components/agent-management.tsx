"use client";
import { useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Save, X } from "lucide-react";
import { api, useData, when } from "./data";
import type { Unit } from "@/lib/operator-directory";

const roles = {
  agent: "Atendente",
  supervisor: "Supervisor",
  coordinator: "Coordenador",
  manager: "Gerente",
  director: "Diretor",
  admin: "Administrador",
};
type Operator = {
  user_id: string;
  name: string;
  roles: string[];
  active: boolean;
  available: boolean;
  receiving: boolean;
  identityEnabled: boolean;
  conversations: number;
  bases: { unit_key: string; responsibility: "primary" | "substitute" }[];
};
type Directory = {
  profiles: { id: string; name: string }[];
  units: Unit[];
  records: Operator[];
};
type Edit = {
  userId: string;
  roles: string[];
  active: boolean;
  available: boolean;
  receiving: boolean;
  bases: { unitKey: string; responsibility: "primary" | "substitute" }[];
};
const empty: Edit = {
  userId: "",
  roles: ["agent"],
  active: true,
  available: false,
  receiving: false,
  bases: [],
};
export function AgentManagement({
  section = "operators",
}: {
  section?: "operators" | "bases" | "queue";
}) {
  const { data, error, refresh } = useData<Directory>("operators"),
    [edit, setEdit] = useState<Edit | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!edit) return;
    setBusy(true);
    setNotice("");
    try {
      await api("operators", edit);
      setEdit(null);
      await refresh();
      setNotice("Cadastro operacional salvo.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="page operator-page">
      {(error || notice) && (
        <p className="notice" role="status">
          {error || notice}
        </p>
      )}
      {!data && !error && <p role="status">Carregando gestão operacional…</p>}
      {data && section !== "queue" && (
        <>
          {section === "bases" && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Sigla</th>
                    <th>Base</th>
                    <th>Vínculo XPT</th>
                    <th>Coordenador</th>
                    <th>Supervisores</th>
                  </tr>
                </thead>
                <tbody>
                  {data.units.map((u) => (
                    <tr key={u.unit_key}>
                      <td>{u.sigla}</td>
                      <td>{u.base_name}</td>
                      <td>{u.xpt_code || "—"}</td>
                      <td>{u.coordinator_name || "—"}</td>
                      <td>{u.supervisors.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="page-tools">
            <input
              aria-label="Buscar atendente"
              placeholder="Buscar responsável"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              onClick={() => {
                setEdit(empty);
                setNotice("");
              }}
            >
              <Plus size={16} />
              Cadastrar função
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Responsável</th>
                  <th>Funções</th>
                  <th>Bases / siglas</th>
                  <th>Disponibilidade</th>
                  <th>Conversas</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.records
                  .filter((o) =>
                    o.name
                      .toLocaleLowerCase()
                      .includes(search.toLocaleLowerCase()),
                  )
                  .map((o) => (
                    <tr key={o.user_id}>
                      <td>
                        {o.name}
                        {!o.identityEnabled && (
                          <small> · acesso central desabilitado</small>
                        )}
                      </td>
                      <td>
                        {o.roles
                          .map((r) => roles[r as keyof typeof roles])
                          .join(", ")}
                      </td>
                      <td>
                        {o.bases.map((b) => {
                          const u = data.units.find(
                            (u) => u.unit_key === b.unit_key,
                          );
                          return (
                            <span className="badge" key={b.unit_key}>
                              {u
                                ? `${u.sigla} · ${u.base_name}`
                                : "Unidade inativa"}{" "}
                              ·{" "}
                              {b.responsibility === "primary"
                                ? "Principal"
                                : "Substituto"}
                            </span>
                          );
                        })}
                      </td>
                      <td>
                        {!o.active
                          ? "Suspenso"
                          : !o.roles.includes("agent")
                            ? "Somente supervisão"
                            : !o.available
                              ? "Indisponível"
                              : !o.receiving
                                ? "Novos atendimentos pausados"
                                : "Recebendo"}
                      </td>
                      <td>{o.conversations}</td>
                      <td>
                        <button
                          className="icon-button"
                          title={`Editar ${o.name}`}
                          aria-label={`Editar ${o.name}`}
                          onClick={() =>
                            setEdit({
                              userId: o.user_id,
                              roles: o.roles,
                              active: o.active,
                              available: o.available,
                              receiving: o.receiving,
                              bases: o.bases.map((b) => ({
                                unitKey: b.unit_key,
                                responsibility: b.responsibility,
                              })),
                            })
                          }
                        >
                          <Pencil size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                {!data.records.length && (
                  <tr>
                    <td colSpan={6}>Nenhuma função operacional cadastrada.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {edit && (
            <form className="operator-editor" onSubmit={save}>
              <div className="page-tools">
                <h2>Função operacional</h2>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Fechar edição"
                  onClick={() => setEdit(null)}
                >
                  <X size={16} />
                </button>
              </div>
              <label>
                Identidade central
                <select
                  required
                  value={edit.userId}
                  onChange={(e) => setEdit({ ...edit, userId: e.target.value })}
                >
                  <option value="">Selecionar</option>
                  {data.profiles.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
                  {!data.profiles.some((p) => p.id === edit.userId) &&
                    edit.userId && (
                      <option value={edit.userId}>
                        Identidade indisponível
                      </option>
                    )}
                </select>
              </label>
              <fieldset>
                <legend>Funções</legend>
                {Object.entries(roles).map(([id, label]) => (
                  <label key={id}>
                    <input
                      type="checkbox"
                      checked={edit.roles.includes(id)}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          roles: e.target.checked
                            ? [...edit.roles, id]
                            : edit.roles.filter((r) => r !== id),
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>Operação</legend>
                {[
                  ["active", "Ativo"],
                  ["available", "Disponível"],
                  ["receiving", "Receber novos atendimentos"],
                ].map(([id, label]) => (
                  <label key={id}>
                    <input
                      type="checkbox"
                      checked={edit[id as "active" | "available" | "receiving"]}
                      onChange={(e) =>
                        setEdit({ ...edit, [id]: e.target.checked })
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <fieldset className="operator-unit-list">
                <legend>Bases atribuídas</legend>
                {data.units.map((u) => {
                  const b = edit.bases.find((b) => b.unitKey === u.unit_key);
                  return (
                    <div key={u.unit_key}>
                      <label>
                        <input
                          type="checkbox"
                          checked={Boolean(b)}
                          onChange={(e) =>
                            setEdit({
                              ...edit,
                              bases: e.target.checked
                                ? [
                                    ...edit.bases,
                                    {
                                      unitKey: u.unit_key,
                                      responsibility: "primary",
                                    },
                                  ]
                                : edit.bases.filter(
                                    (b) => b.unitKey !== u.unit_key,
                                  ),
                            })
                          }
                        />
                        {u.sigla} · {u.base_name}
                        {u.xpt_code ? ` · XPT ${u.xpt_code}` : ""}
                      </label>
                      {b && (
                        <select
                          aria-label={`Responsabilidade ${u.sigla} ${u.base_name}`}
                          value={b.responsibility}
                          onChange={(e) =>
                            setEdit({
                              ...edit,
                              bases: edit.bases.map((b) =>
                                b.unitKey === u.unit_key
                                  ? {
                                      ...b,
                                      responsibility: e.target.value as
                                        | "primary"
                                        | "substitute",
                                    }
                                  : b,
                              ),
                            })
                          }
                        >
                          <option value="primary">Principal</option>
                          <option value="substitute">Substituto</option>
                        </select>
                      )}
                    </div>
                  );
                })}
              </fieldset>
              <button className="primary" disabled={busy || !edit.roles.length}>
                <Save size={16} />
                {busy ? "Salvando…" : "Salvar função e bases"}
              </button>
            </form>
          )}
        </>
      )}
      {data && section === "queue" && <AssignmentQueue directory={data} />}
    </main>
  );
}
function AssignmentQueue({ directory }: { directory: Directory }) {
  const [offset, setOffset] = useState(0),
    [history, setHistory] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const { data, error, refresh } = useData<{
    records: {
      case_id: string;
      base_key: string;
      sigla: string;
      assigned_to: string | null;
      version: number;
      reason?: string;
      created_at?: string;
    }[];
  }>(`assignments?offset=${offset}&history=${history}`);
  const { data: policy, refresh: refreshPolicy } = useData<{
    policy: { mode: string };
  }>("assignment-policy");
  async function assign(
    row: NonNullable<typeof data>["records"][number],
    assignedTo: string,
  ) {
    const reason = window.prompt("Motivo da atribuição ou transferência");
    if (!reason) return;
    setBusy(true);
    try {
      await api("assignments", {
        caseId: row.case_id,
        assignedTo: assignedTo || null,
        version: row.version,
        reason,
      });
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Falha na distribuição.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-tools">
        <label>
          Distribuição
          <select
            value={policy?.policy?.mode || "manual"}
            onChange={async (e) => {
              try {
                await api("assignment-policy", { mode: e.target.value });
                await refreshPolicy();
              } catch (e) {
                setNotice(e instanceof Error ? e.message : "Falha ao salvar.");
              }
            }}
          >
            <option value="manual">Manual</option>
            <option value="primary_then_least_loaded">
              Principal, depois menor fila
            </option>
          </select>
        </label>
        <div className="segmented">
          <button
            aria-pressed={!history}
            onClick={() => {
              setHistory(false);
              setOffset(0);
            }}
          >
            Fila de PNRs
          </button>
          <button
            aria-pressed={history}
            onClick={() => {
              setHistory(true);
              setOffset(0);
            }}
          >
            Redistribuições
          </button>
        </div>
      </div>
      {(notice || error) && (
        <p className="notice" role="alert">
          {notice || error}
        </p>
      )}
      {!data && !error && <p role="status">Carregando fila…</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>PNR</th>
              <th>Sigla</th>
              <th>Base</th>
              <th>Responsável</th>
              {history && (
                <>
                  <th>Motivo</th>
                  <th>Data</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {data?.records.map((r, i) => (
              <tr key={`${r.case_id}:${r.version}:${i}`}>
                <td>{r.case_id}</td>
                <td>{r.sigla}</td>
                <td>{r.base_key}</td>
                <td>
                  {history ? (
                    directory.records.find((o) => o.user_id === r.assigned_to)
                      ?.name || "Sem responsável"
                  ) : (
                    <select
                      disabled={busy}
                      aria-label={`Responsável PNR ${r.case_id}`}
                      value={r.assigned_to || ""}
                      onChange={(e) => void assign(r, e.target.value)}
                    >
                      <option value="">Sem responsável</option>
                      {directory.records
                        .filter(
                          (o) =>
                            o.user_id === r.assigned_to ||
                            (o.identityEnabled &&
                              o.active &&
                              o.available &&
                              o.receiving &&
                              o.roles.includes("agent") &&
                              o.bases.some((b) => {
                                const u = directory.units.find(
                                  (u) => u.unit_key === b.unit_key,
                                );
                                return (
                                  u?.base_key === r.base_key &&
                                  u?.sigla === r.sigla
                                );
                              })),
                        )
                        .map((o) => (
                          <option key={o.user_id} value={o.user_id}>
                            {o.name}
                          </option>
                        ))}
                    </select>
                  )}
                </td>
                {history && (
                  <>
                    <td>{r.reason}</td>
                    <td>{when(r.created_at)}</td>
                  </>
                )}
              </tr>
            ))}
            {data && !data.records.length && (
              <tr>
                <td colSpan={6}>Nenhum registro neste recorte.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="page-tools">
        <button
          disabled={!offset}
          aria-label="Página anterior"
          onClick={() => setOffset(offset - 30)}
        >
          <ChevronLeft size={16} />
        </button>
        <span>Página {offset / 30 + 1}</span>
        <button
          disabled={(data?.records.length || 0) < 30}
          aria-label="Próxima página"
          onClick={() => setOffset(offset + 30)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </>
  );
}
