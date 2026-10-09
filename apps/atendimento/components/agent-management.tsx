"use client";
import { useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Save, X } from "lucide-react";
import { api, useData, when, labels } from "./data";
import { ManagementDialog } from "./management-dialog";
import type { Unit } from "@/lib/operator-directory";

const roles = {
  agent: "Atendente",
  supervisor: "Supervisor",
  coordinator: "Coordenador",
  manager: "Gerente",
  director: "Diretor",
  admin: "Administrador",
};
type Responsibility = "primary" | "substitute";
type Member = { userId: string; responsibility: Responsibility };
type Operator = {
  user_id: string;
  name: string;
  roles: string[];
  active: boolean;
  available: boolean;
  receiving: boolean;
  identityEnabled: boolean;
  conversations: number;
  bases: { unit_key: string; responsibility: Responsibility }[];
};
type Directory = {
  profiles: { id: string; name: string; unitKeys: string[] }[];
  units: Unit[];
  records: Operator[];
};
type Edit = {
  userId: string;
  roles: string[];
  active: boolean;
  available: boolean;
  receiving: boolean;
  bases: { unitKey: string; responsibility: Responsibility }[];
};
const empty: Edit = {
  userId: "",
  roles: ["agent"],
  active: true,
  available: false,
  receiving: false,
  bases: [],
};
const normalized = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
const matches = (value: string, search: string) =>
  normalized(value).includes(normalized(search));
const ready = (o: Operator) =>
  o.identityEnabled &&
  o.active &&
  o.available &&
  o.receiving &&
  o.roles.includes("agent");
const members = (directory: Directory, unitKey: string): Member[] =>
  directory.records.flatMap((o) =>
    o.bases
      .filter((b) => b.unit_key === unitKey)
      .map((b) => ({ userId: o.user_id, responsibility: b.responsibility })),
  );
const responsibilityLabel = (value: Responsibility) =>
  value === "primary" ? "Principal" : "Substituto";
const status = (o: Operator) =>
  !o.identityEnabled
    ? "Acesso central desabilitado"
    : !o.active
      ? "Suspenso"
      : !o.roles.includes("agent")
        ? "Somente supervisão"
        : !o.available
          ? "Indisponível"
          : !o.receiving
            ? "Novos atendimentos pausados"
            : "Recebendo";

export function ManagementIndicators({
  items,
}: {
  items: [string, number | undefined][];
}) {
  return (
    <dl className="management-indicators">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value === undefined ? "—" : value.toLocaleString("pt-BR")}</dd>
        </div>
      ))}
    </dl>
  );
}
function Pagination({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
}) {
  return (
    <nav className="management-pagination" aria-label="Paginação">
      <span>
        {total
          ? `${page * 30 + 1}–${Math.min((page + 1) * 30, total)} de ${total}`
          : "0 registros"}
      </span>
      <button
        className="icon-button"
        aria-label="Página anterior"
        title="Página anterior"
        disabled={!page}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft size={16} />
      </button>
      <button
        className="icon-button"
        aria-label="Próxima página"
        title="Próxima página"
        disabled={(page + 1) * 30 >= total}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}
export function AgentManagement({
  section = "operators",
}: {
  section?: "operators" | "bases" | "queue";
}) {
  const { data, error, refresh } = useData<Directory>("operators");
  const [edit, setEdit] = useState<Edit | null>(null),
    [coverage, setCoverage] = useState<Unit | null>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [page, setPage] = useState(0),
    [notice, setNotice] = useState("");
  async function saved() {
    await refresh();
    setNotice("Configuração de atendimento salva.");
  }
  const operators = data?.records.filter((o) => o.roles.includes("agent") && matches(o.name, search)) || [];
  const units =
    data?.units.filter(
      (u) =>
        matches(`${u.sigla} ${u.base_name}`, search) &&
        (filter === "all" ||
          members(data, u.unit_key).length > 0 === (filter === "assigned")),
    ) || [];
  const agents = data?.records.filter((o) => o.roles.includes("agent")) || [];
  return (
    <main className="page operator-page">
      {(error || notice) && (
        <p className="notice" role="status">
          {error || notice}
        </p>
      )}
      {!data && !error && <p role="status">Carregando gestão operacional…</p>}
      {data &&
        (section === "queue" ? (
          <AssignmentQueue directory={data} />
        ) : (
          <>
            <div className="management-toolbar">
              <p>
                {section === "bases"
                  ? "Estrutura operacional e cobertura de atendimento por base."
                  : "Pessoas habilitadas para realizar atendimentos e suas bases de atuação."}
              </p>
              <input
                aria-label={
                  section === "bases" ? "Buscar base" : "Buscar atendente"
                }
                placeholder={
                  section === "bases" ? "Sigla ou cidade" : "Buscar atendente"
                }
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
              {section === "bases" ? (
                <select
                  aria-label="Filtrar cobertura"
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="all">Todas as bases</option>
                  <option value="assigned">Com atendimento</option>
                  <option value="unassigned">Sem atendimento</option>
                </select>
              ) : (
                <button onClick={() => setEdit(empty)}>
                  <Plus size={16} />
                  Adicionar atendente
                </button>
              )}
            </div>
            <ManagementIndicators
              items={
                section === "bases"
                  ? [
                      ["Bases", data.units.length],
                      [
                        "Com atendimento",
                        data.units.filter(
                          (u) => members(data, u.unit_key).length,
                        ).length,
                      ],
                      [
                        "Sem atendimento",
                        data.units.filter(
                          (u) => !members(data, u.unit_key).length,
                        ).length,
                      ],
                      ["Atendentes disponíveis", agents.filter(ready).length],
                    ]
                  : [
                      ["Atendentes", agents.length],
                      [
                        "Disponíveis para novos atendimentos",
                        agents.filter(ready).length,
                      ],
                      ["Indisponíveis", agents.filter((o) => !ready(o)).length],
                      [
                        "Conversas atribuídas",
                        agents.reduce((sum, o) => sum + o.conversations, 0),
                      ],
                    ]
              }
            />
            {section === "bases" && (
              <p className="management-reference">
                Coordenadores e supervisores identificam a gestão operacional da
                base e não recebem acesso ao Atendimento por constarem neste
                cadastro. Os atendentes atribuídos são responsáveis pelas PNRs e
                conversas.
              </p>
            )}
            <div className="table-wrap management-table">
              <table>
                <thead>
                  <tr>
                    {(section === "bases"
                      ? [
                          "Sigla / base",
                          "Vínculo XPT",
                          "Coordenador operacional",
                          "Supervisor operacional",
                          "Atendentes",
                          "Cobertura",
                          "Ação",
                        ]
                      : [
                          "Nome",
                          "Acesso central",
                          "Status operacional",
                          "Bases de atendimento",
                          "Conversas",
                          "Ação",
                        ]
                    ).map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section === "bases"
                    ? units.slice(page * 30, (page + 1) * 30).map((u) => {
                        const bindings = members(data, u.unit_key),
                          available = bindings.some((b) =>
                            data.records.some(
                              (o) => o.user_id === b.userId && ready(o),
                            ),
                          );
                        return (
                          <tr key={u.unit_key}>
                            <td>
                              <strong>{u.sigla}</strong>
                              <small>{u.base_name}</small>
                            </td>
                            <td>{u.xpt_code || "—"}</td>
                            <td>{u.coordinator_name || "—"}</td>
                            <td>{u.supervisors.join(", ") || "—"}</td>
                            <td>
                              {bindings.map((b) => (
                                <small key={b.userId}>
                                  {
                                    data.records.find(
                                      (o) => o.user_id === b.userId,
                                    )?.name
                                  }{" "}
                                  · {responsibilityLabel(b.responsibility)}
                                </small>
                              ))}
                              {!bindings.length && "—"}
                            </td>
                            <td>
                              {available
                                ? "Disponível"
                                : bindings.length
                                  ? "Atendentes indisponíveis"
                                  : "Sem cobertura"}
                            </td>
                            <td>
                              <button
                                className="icon-button"
                                title={`Configurar cobertura ${u.sigla} ${u.base_name}`}
                                aria-label={`Configurar cobertura ${u.sigla} ${u.base_name}`}
                                onClick={() => setCoverage(u)}
                              >
                                <Pencil size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    : operators.slice(page * 30, (page + 1) * 30).map((o) => (
                        <tr key={o.user_id}>
                          <td>
                            <strong>{o.name}</strong>
                          </td>
                          <td>
                            {o.identityEnabled ? "Autorizado" : "Desabilitado"}
                          </td>
                          <td>{status(o)}</td>
                          <td>
                            <div className="management-tags">
                              {o.bases.slice(0, 3).map((b) => {
                                const u = data.units.find(
                                  (u) => u.unit_key === b.unit_key,
                                );
                                return (
                                  <span className="badge" key={b.unit_key}>
                                    {u?.sigla || "Unidade inativa"} ·{" "}
                                    {responsibilityLabel(b.responsibility)}
                                  </span>
                                );
                              })}
                              {o.bases.length > 3 && (
                                <span className="badge">
                                  +{o.bases.length - 3}
                                </span>
                              )}
                              {!o.bases.length && "Sem bases"}
                            </div>
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
                  {!(section === "bases" ? units : operators).length && (
                    <tr>
                      <td colSpan={7}>
                        <div className="management-empty">
                          <p>
                            {search || filter !== "all"
                              ? "Nenhum resultado neste filtro."
                              : section === "bases"
                                ? "Nenhuma base operacional disponível."
                                : "Nenhum atendente cadastrado. Selecione uma identidade central autorizada para começar."}
                          </p>
                          {section === "operators" && !data.records.length && (
                            <button onClick={() => setEdit(empty)}>
                              <Plus size={16} />
                              Adicionar atendente
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              total={(section === "bases" ? units : operators).length}
              onChange={setPage}
            />
            {edit && (
              <OperatorEditor
                initial={edit}
                directory={data}
                onClose={() => setEdit(null)}
                onSaved={saved}
              />
            )}
            {coverage && (
              <CoverageEditor
                unit={coverage}
                directory={data}
                onClose={() => setCoverage(null)}
                onSaved={saved}
              />
            )}
          </>
        ))}
    </main>
  );
}

function OperatorEditor({
  initial,
  directory,
  onClose,
  onSaved,
}: {
  initial: Edit;
  directory: Directory;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [edit, setEdit] = useState(initial),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const allowed =
    directory.profiles.find((p) => p.id === edit.userId)?.unitKeys || [];
  const units = directory.units.filter(
    (u) =>
      allowed.includes(u.unit_key) &&
      matches(`${u.sigla} ${u.base_name}`, search),
  );
  function toggleRole(role: string, checked: boolean) {
    setEdit({
      ...edit,
      roles: checked
        ? [...edit.roles, role]
        : edit.roles.filter((r) => r !== role),
    });
  }
  function selectUnits(selected: boolean) {
    const keys = units.map((u) => u.unit_key);
    setEdit({
      ...edit,
      bases: selected
        ? [
            ...edit.bases,
            ...keys
              .filter((key) => !edit.bases.some((b) => b.unitKey === key))
              .map((unitKey) => ({
                unitKey,
                responsibility: "primary" as const,
              })),
          ]
        : edit.bases.filter((b) => !keys.includes(b.unitKey)),
    });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("operators", edit);
      await onSaved();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ManagementDialog
      title={initial.userId ? "Editar atendente" : "Adicionar atendente"}
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={save}>
        <div className="management-dialog-body">
          <fieldset disabled={busy} className="management-form">
            <label>
              Usuário existente
              <select
                required
                value={edit.userId}
                onChange={(e) => {
                  const userId = e.target.value;
                  const existing = directory.records.find((o) => o.user_id === userId);
                  setEdit(existing ? {
                    userId,
                    roles: [...new Set([...existing.roles, "agent"])],
                    active: existing.active,
                    available: existing.available,
                    receiving: existing.receiving,
                    bases: existing.bases.map((b) => ({
                      unitKey: b.unit_key,
                      responsibility: b.responsibility,
                    })),
                  } : { ...empty, userId });
                }}
              >
                <option value="">Selecionar</option>
                {directory.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                {edit.userId &&
                  !directory.profiles.some((p) => p.id === edit.userId) && (
                    <option value={edit.userId}>Identidade indisponível</option>
                  )}
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={edit.roles.includes("agent")}
                onChange={(e) => toggleRole("agent", e.target.checked)}
              />
              Habilitar função Atendente
            </label>
            <div className="management-form-grid">
              <label>
                Status operacional
                <select
                  value={String(edit.active)}
                  onChange={(e) =>
                    setEdit({ ...edit, active: e.target.value === "true" })
                  }
                >
                  <option value="true">Ativo</option>
                  <option value="false">Suspenso</option>
                </select>
              </label>
              <label>
                Disponibilidade
                <select
                  value={String(edit.available)}
                  onChange={(e) =>
                    setEdit({ ...edit, available: e.target.value === "true" })
                  }
                >
                  <option value="false">Indisponível</option>
                  <option value="true">Disponível</option>
                </select>
              </label>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={edit.receiving}
                onChange={(e) =>
                  setEdit({ ...edit, receiving: e.target.checked })
                }
              />
              Receber novos atendimentos
            </label>
            <details>
              <summary>Outras funções operacionais</summary>
              <div className="management-role-list">
                {Object.entries(roles)
                  .filter(([id]) => id !== "agent")
                  .map(([id, label]) => (
                    <label className="check" key={id}>
                      <input
                        type="checkbox"
                        checked={edit.roles.includes(id)}
                        onChange={(e) => toggleRole(id, e.target.checked)}
                      />
                      {label}
                    </label>
                  ))}
              </div>
              <small>
                Não alteram o perfil administrativo ou o organograma central.
              </small>
            </details>
            <section className="management-unit-picker">
              <h3>
                Bases de atendimento{" "}
                <small>{edit.bases.length} selecionadas</small>
              </h3>
              <input
                aria-label="Buscar bases autorizadas"
                placeholder="Sigla ou cidade"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="management-bulk">
                <button
                  type="button"
                  disabled={!units.length}
                  onClick={() => selectUnits(true)}
                >
                  Selecionar filtradas
                </button>
                <button
                  type="button"
                  disabled={!units.length}
                  onClick={() => selectUnits(false)}
                >
                  Desmarcar filtradas
                </button>
              </div>
              <div className="management-unit-options">
                {units.map((u) => {
                  const binding = edit.bases.find(
                    (b) => b.unitKey === u.unit_key,
                  );
                  return (
                    <div key={u.unit_key}>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={Boolean(binding)}
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
                        <span>
                          <strong>{u.sigla}</strong> · {u.base_name}
                          {u.xpt_code && <small>XPT {u.xpt_code}</small>}
                        </span>
                      </label>
                      {binding && (
                        <select
                          aria-label={`Responsabilidade ${u.sigla} ${u.base_name}`}
                          value={binding.responsibility}
                          onChange={(e) =>
                            setEdit({
                              ...edit,
                              bases: edit.bases.map((b) =>
                                b.unitKey === u.unit_key
                                  ? {
                                      ...b,
                                      responsibility: e.target
                                        .value as Responsibility,
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
                {!units.length && (
                  <p>
                    {edit.userId
                      ? "Nenhuma base autorizada neste filtro."
                      : "Selecione primeiro uma identidade central."}
                  </p>
                )}
              </div>
              <div className="management-tags">
                {edit.bases.map((b) => {
                  const u = directory.units.find(
                    (u) => u.unit_key === b.unitKey,
                  );
                  return (
                    <span className="badge" key={b.unitKey}>
                      {u?.sigla || "Unidade inativa"} ·{" "}
                      {responsibilityLabel(b.responsibility)}
                      <button
                        type="button"
                        aria-label={`Remover base ${u?.sigla || b.unitKey}`}
                        title="Remover base"
                        onClick={() =>
                          setEdit({
                            ...edit,
                            bases: edit.bases.filter(
                              (item) => item.unitKey !== b.unitKey,
                            ),
                          })
                        }
                      >
                        <X size={12} />
                      </button>
                    </span>
                  );
                })}
              </div>
              <small>
                Principal e substituto são responsabilidades de atendimento. A
                cobertura respeita o acesso central e não altera a gestão da
                base.
              </small>
            </section>
          </fieldset>
          {error && (
            <p className="notice" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="primary"
            disabled={busy || !edit.roles.length || !edit.userId}
          >
            <Save size={16} />
            {busy ? "Salvando…" : "Salvar atendente"}
          </button>
        </footer>
      </form>
    </ManagementDialog>
  );
}

function CoverageEditor({
  unit,
  directory,
  onClose,
  onSaved,
}: {
  unit: Unit;
  directory: Directory;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [expected] = useState(() => members(directory, unit.unit_key)),
    [selected, setSelected] = useState(expected),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const eligible = directory.records.filter(
    (o) =>
      o.active &&
      o.identityEnabled &&
      o.roles.includes("agent") &&
      directory.profiles.some(
        (p) => p.id === o.user_id && p.unitKeys.includes(unit.unit_key),
      ),
  );
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("coverage", {
        unitKey: unit.unit_key,
        expected,
        assignments: selected,
      });
      await onSaved();
      onClose();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Falha ao salvar cobertura.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <ManagementDialog
      title={`Cobertura · ${unit.sigla} · ${unit.base_name}`}
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={save}>
        <div className="management-dialog-body">
          <fieldset disabled={busy} className="management-form">
            <section className="management-reference">
              <h3>Estrutura operacional</h3>
              <p>
                Coordenador: {unit.coordinator_name || "—"}
                <br />
                Supervisores: {unit.supervisors.join(", ") || "—"}
              </p>
            </section>
            <h3>Cobertura de atendimento</h3>
            <input
              aria-label="Buscar atendente habilitado"
              placeholder="Buscar atendente habilitado"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="management-unit-options">
              {eligible
                .filter((o) => matches(o.name, search))
                .map((o) => {
                  const binding = selected.find((b) => b.userId === o.user_id);
                  return (
                    <div key={o.user_id}>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={Boolean(binding)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [
                                    ...selected,
                                    {
                                      userId: o.user_id,
                                      responsibility: "primary",
                                    },
                                  ]
                                : selected.filter(
                                    (b) => b.userId !== o.user_id,
                                  ),
                            )
                          }
                        />
                        <span>
                          {o.name}
                          <small>{status(o)}</small>
                        </span>
                      </label>
                      {binding && (
                        <select
                          aria-label={`Responsabilidade ${o.name}`}
                          value={binding.responsibility}
                          onChange={(e) =>
                            setSelected(
                              selected.map((b) =>
                                b.userId === o.user_id
                                  ? {
                                      ...b,
                                      responsibility: e.target
                                        .value as Responsibility,
                                    }
                                  : b,
                              ),
                            )
                          }
                        >
                          <option value="primary">Principal</option>
                          <option value="substitute">Substituto</option>
                        </select>
                      )}
                    </div>
                  );
                })}
              {!eligible.length && (
                <p>
                  Nenhum atendente habilitado para esta base. Cadastre a função
                  em Atendentes.
                </p>
              )}
            </div>
            {selected
              .filter((b) => !eligible.some((o) => o.user_id === b.userId))
              .map((b) => (
                <p key={b.userId}>
                  Vínculo indisponível:{" "}
                  {directory.records.find((o) => o.user_id === b.userId)?.name}
                  <button
                    type="button"
                    onClick={() =>
                      setSelected(
                        selected.filter((item) => item.userId !== b.userId),
                      )
                    }
                  >
                    Remover vínculo
                  </button>
                </p>
              ))}
            <small>
              {selected.length} atendente(s) selecionado(s). Nenhuma permissão
              administrativa será concedida.
            </small>
          </fieldset>
          {error && (
            <p className="notice" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" disabled={busy}>
            <Save size={16} />
            Salvar cobertura
          </button>
        </footer>
      </form>
    </ManagementDialog>
  );
}

type QueueRow = {
  case_id: string;
  base_key: string;
  sigla: string;
  classification: string;
  assigned_to: string | null;
  version: number;
  reason?: string;
  created_at?: string;
};
function AssignmentQueue({ directory }: { directory: Directory }) {
  const [page, setPage] = useState(0),
    [history, setHistory] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [transfer, setTransfer] = useState<{
      row: QueueRow;
      assignedTo: string;
    } | null>(null),
    [reason, setReason] = useState(""),
    [transferError, setTransferError] = useState(""),
    [filters, setFilters] = useState({
      base: "",
      sigla: "",
      owner: "",
      search: "",
    });
  const query = new URLSearchParams({
    ...filters,
    offset: String(page * 30),
    history: String(history),
  });
  const { data, error, refresh } = useData<{
    records: QueueRow[];
    summary: {
      total: number;
      unassigned: number;
      assigned: number;
      recentRedistributions: number;
    };
  }>(`assignments?${query}`);
  const { data: policy, refresh: refreshPolicy } = useData<{
    policy: { mode: string };
  }>("assignment-policy");
  function filter(key: keyof typeof filters, value: string) {
    setFilters({ ...filters, [key]: value });
    setPage(0);
  }
  async function assign(event: FormEvent) {
    event.preventDefault();
    if (!transfer) return;
    setBusy(true);
    setTransferError("");
    try {
      await api("assignments", {
        caseId: transfer.row.case_id,
        assignedTo: transfer.assignedTo || null,
        version: transfer.row.version,
        reason,
      });
      await refresh();
      setTransfer(null);
      setNotice("Responsabilidade atualizada.");
    } catch (error) {
      setTransferError(
        error instanceof Error ? error.message : "Falha na distribuição.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <ManagementIndicators
        items={[
          [
            history ? "Registros no histórico" : "PNRs na fila",
            data?.summary.total,
          ],
          ["Sem responsável", data?.summary.unassigned],
          ["Atribuídas", data?.summary.assigned],
          [
            "Redistribuições nos últimos 7 dias",
            data?.summary.recentRedistributions,
          ],
        ]}
      />
      <div className="management-toolbar queue-toolbar">
        <label>
          Distribuição
          <select
            disabled={!policy || busy}
            value={policy?.policy.mode || "manual"}
            onChange={async (e) => {
              setBusy(true);
              try {
                await api("assignment-policy", { mode: e.target.value });
                await refreshPolicy();
              } catch (error) {
                setNotice(
                  error instanceof Error ? error.message : "Falha ao salvar.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <option value="manual">Manual</option>
            <option value="primary_then_least_loaded">
              Automática: principal, depois menor fila
            </option>
          </select>
        </label>
        <label>
          Base
          <select
            value={filters.base}
            onChange={(e) => filter("base", e.target.value)}
          >
            <option value="">Todas</option>
            {[...new Set(directory.units.map((u) => u.base_key))].map(
              (base) => (
                <option key={base}>{base}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Sigla
          <select
            value={filters.sigla}
            onChange={(e) => filter("sigla", e.target.value)}
          >
            <option value="">Todas</option>
            {[...new Set(directory.units.map((u) => u.sigla))].map((sigla) => (
              <option key={sigla}>{sigla}</option>
            ))}
          </select>
        </label>
        <label>
          Atendente
          <select
            value={filters.owner}
            onChange={(e) => filter("owner", e.target.value)}
          >
            <option value="">Todos</option>
            <option value="unassigned">Sem responsável</option>
            {directory.records.map((o) => (
              <option value={o.user_id} key={o.user_id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          PNR
          <input
            value={filters.search}
            onChange={(e) => filter("search", e.target.value)}
            placeholder="Buscar PNR"
          />
        </label>
        <div className="segmented">
          <button
            aria-pressed={!history}
            onClick={() => {
              setHistory(false);
              setPage(0);
            }}
          >
            Fila
          </button>
          <button
            aria-pressed={history}
            onClick={() => {
              setHistory(true);
              setPage(0);
            }}
          >
            Histórico
          </button>
        </div>
      </div>
      {(notice || error) && (
        <p className="notice" role="alert">
          {notice || error}
        </p>
      )}
      {!data && !error && <p role="status">Carregando fila…</p>}
      <div className="table-wrap management-table">
        <table>
          <thead>
            <tr>
              {[
                "PNR",
                "Base / sigla",
                "Classificação",
                "Atendente responsável",
                "Situação",
                ...(history ? ["Motivo", "Data"] : ["Ação"]),
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.records.map((row, i) => {
              const owner = directory.records.find(
                (o) => o.user_id === row.assigned_to,
              );
              return (
                <tr key={`${row.case_id}:${row.version}:${i}`}>
                  <td>
                    <strong>{row.case_id}</strong>
                  </td>
                  <td>
                    {row.sigla}
                    <small>{row.base_key}</small>
                  </td>
                  <td>{labels[row.classification] || row.classification || "—"}</td>
                  <td>
                    {owner?.name ||
                      (row.assigned_to
                        ? "Identidade indisponível"
                        : "Sem responsável")}
                  </td>
                  <td>{row.assigned_to ? "Atribuída" : "Não atribuída"}</td>
                  {history ? (
                    <>
                      <td>{row.reason}</td>
                      <td>{when(row.created_at)}</td>
                    </>
                  ) : (
                    <td>
                      <select
                        aria-label={`Responsável PNR ${row.case_id}`}
                        disabled={busy}
                        value={row.assigned_to || ""}
                        onChange={(e) => {
                          setTransfer({ row, assignedTo: e.target.value });
                          setReason("");
                          setTransferError("");
                        }}
                      >
                        <option value="">Sem responsável</option>
                        {directory.records
                          .filter(
                            (o) =>
                              o.user_id === row.assigned_to ||
                              (ready(o) &&
                                o.bases.some((b) => {
                                  const u = directory.units.find(
                                    (u) => u.unit_key === b.unit_key,
                                  );
                                  return (
                                    u?.base_key === row.base_key &&
                                    u?.sigla === row.sigla
                                  );
                                })),
                          )
                          .map((o) => (
                            <option value={o.user_id} key={o.user_id}>
                              {o.name}
                            </option>
                          ))}
                      </select>
                    </td>
                  )}
                </tr>
              );
            })}
            {data && !data.records.length && (
              <tr>
                <td colSpan={7}>Nenhum registro neste recorte.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        total={data?.summary.total || 0}
        onChange={setPage}
      />
      {transfer && (
        <ManagementDialog
          title={`Responsabilidade · PNR ${transfer.row.case_id}`}
          busy={busy}
          onClose={() => setTransfer(null)}
        >
          <form onSubmit={assign}>
            <div className="management-dialog-body">
              <p>
                {directory.records.find(
                  (o) => o.user_id === transfer.row.assigned_to,
                )?.name || "Sem responsável"}{" "}
                →{" "}
                {directory.records.find(
                  (o) => o.user_id === transfer.assignedTo,
                )?.name || "Sem responsável"}
              </p>
              <label>
                Justificativa
                <textarea
                  required
                  minLength={3}
                  maxLength={400}
                  disabled={busy}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  autoFocus
                />
              </label>
              {transferError && (
                <p className="notice" role="alert">
                  {transferError}
                </p>
              )}
            </div>
            <footer>
              <button
                type="button"
                disabled={busy}
                onClick={() => setTransfer(null)}
              >
                Cancelar
              </button>
              <button
                className="primary"
                disabled={busy || reason.trim().length < 3}
              >
                <Save size={16} />
                Confirmar atribuição
              </button>
            </footer>
          </form>
        </ManagementDialog>
      )}
    </>
  );
}
