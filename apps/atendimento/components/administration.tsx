"use client";
import { useState, type FormEvent } from "react";
import { api, useData, labels, when } from "./data";
import { Collector } from "./collector";
import { AgentPanel } from "./agent-panel";
type Channel = {
  channel: "driver" | "client";
  number: string;
  phoneId: string;
  wabaId: string;
  tokenConfigured: boolean;
  secretConfigured: boolean;
  verifyConfigured: boolean;
  webhook: string;
};
type Automation = {
  driverNotifications: boolean;
  clientOutreach: boolean;
  bot: boolean;
  operatorName: string;
  intervalMinutes: 30;
};
type Admin = {
  automation: Automation;
  channels: Channel[];
  source: { lastSync?: string };
};
export function Administration() {
  const { data, error, refresh } = useData<Admin>("admin");
  const [tab, setTab] = useState("channels");
  return (
    <main className="page">
      <div className="page-tools">
          <p className="muted">
            Canais, usuários, coleta e automações do Atendimento.
          </p>
        <span className="badge">Acesso administrativo</span>
      </div>
      <nav className="tabs" aria-label="Áreas dos Ajustes">
        {[
          ["channels", "Números & Meta"],
          ["automation", "Automações"],
          ["agent", "Modelo de instruções"],
          ["collector", "Conector & dados"],
          ["users", "Usuários"],
          ["audit", "Auditoria"],
        ].map(([id, label]) => (
          <button
            className={tab === id ? "active" : ""}
            key={id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {error ? <p className="notice error">{error}</p> : null}
      {tab === "channels" ? (
        <div className="channel-grid">
          {data?.channels.map((channel) => (
            <ChannelCard
              key={channel.channel}
              channel={channel}
              refresh={refresh}
            />
          ))}
        </div>
      ) : tab === "automation" && data ? (
        <AutomationForm
          key={JSON.stringify(data.automation)}
          initial={data.automation}
          refresh={refresh}
        />
      ) : tab === "agent" ? (
        <AgentPanel />
      ) : tab === "collector" ? (
        <Collector />
      ) : tab === "users" ? (
        <Users />
      ) : tab === "audit" ? (
        <Audit />
      ) : null}
    </main>
  );
}
function ChannelCard({
  channel,
  refresh,
}: {
  channel: Channel;
  refresh: () => Promise<void>;
}) {
  const [edit, setEdit] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [models, setModels] = useState<
      {
        name: string;
        status: string;
        category: string;
        components: { text?: string }[];
      }[]
    >([]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await api("channel", {
        channel: channel.channel,
        ...Object.fromEntries(form.entries()),
      });
      setNotice("Configuração salva.");
      setEdit(false);
      await refresh();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <div className="card-heading">
        <h2>{labels[channel.channel]}</h2>
        <span
          className={`badge ${channel.secretConfigured ? "ready" : "pending"}`}
        >
          {channel.secretConfigured
            ? "Assinatura configurada"
            : "App Secret pendente"}
        </span>
      </div>
      <h3>+{channel.number || "Número não configurado"}</h3>
      <dl>
        <dt>Phone Number ID</dt>
        <dd>{channel.phoneId}</dd>
        <dt>WABA</dt>
        <dd>{channel.wabaId}</dd>
        <dt>Token de acesso</dt>
        <dd>{channel.tokenConfigured ? "Configurado" : "Pendente"}</dd>
        <dt>Token de verificação</dt>
        <dd>{channel.verifyConfigured ? "Configurado" : "Pendente"}</dd>
        <dt>Webhook</dt>
        <dd className="wrap">{channel.webhook}</dd>
      </dl>
      <p className="muted">
        Configure este endereço no aplicativo Meta, assine o campo messages e
        confirme a verificação antes de ativar os disparos.
      </p>
      <div className="actions">
        <button onClick={() => setEdit((v) => !v)}>Configurar canal</button>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const data = await api<{ records: typeof models }>(
                `templates?channel=${channel.channel}`,
              );
              setModels(data.records);
              setNotice("Modelos consultados na Meta.");
            } catch (e) {
              setNotice((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Consultar modelos Meta
        </button>
      </div>
      {edit ? (
        <form className="stack" onSubmit={save}>
          <label>
            Número
            <input name="number" defaultValue={channel.number} required />
          </label>
          <label>
            Phone Number ID
            <input name="phoneId" defaultValue={channel.phoneId} required />
          </label>
          <label>
            WABA ID
            <input name="wabaId" defaultValue={channel.wabaId} required />
          </label>
          <label>
            Token de acesso
            <input
              name="token"
              type="password"
              autoComplete="new-password"
              placeholder="Preencha para substituir"
            />
          </label>
          <label>
            App Secret
            <input
              name="appSecret"
              type="password"
              autoComplete="new-password"
              placeholder="Segredo do aplicativo Meta"
            />
          </label>
          <label>
            Token de verificação do webhook
            <input
              name="verifyToken"
              type="password"
              autoComplete="new-password"
              placeholder="Preencha para substituir"
            />
          </label>
          <button className="primary" disabled={busy}>
            Salvar canal
          </button>
        </form>
      ) : null}
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      {models.map((m) => (
        <details className="template" key={m.name}>
          <summary>
            {m.name} <span className="badge">{m.status}</span>
          </summary>
          <p>{m.category}</p>
          {m.components.map((c, i) =>
            c.text ? (
              <p className="template-body" key={i}>
                {c.text}
              </p>
            ) : null,
          )}
        </details>
      ))}
    </section>
  );
}
function AutomationForm({
  initial,
  refresh,
}: {
  initial: Automation;
  refresh: () => Promise<void>;
}) {
  const [value, setValue] = useState(initial),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="settings-section">
      <h2>Automação de PNRs</h2>
      <p className="muted">
        A ativação exige canais configurados e os webhooks verificados na Meta.
        A carga inicial não gera disparos.
      </p>
      <form
        className="stack automation-fields"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api("automation", value);
            setNotice("Automações atualizadas.");
            await refresh();
          } catch (e) {
            setNotice((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {[
          ["driverNotifications", "Notificar motorista sobre nova PNR"],
          [
            "clientOutreach",
            "Contatar clientes em Aguardando comprovante e Com penalidade",
          ],
          ["bot", "Responder automaticamente dentro da janela de atendimento"],
        ].map(([key, label]) => (
          <label className="check" key={key}>
            <input
              type="checkbox"
              checked={Boolean(value[key as keyof Automation])}
              onChange={(e) =>
                setValue((v) => ({ ...v, [key]: e.target.checked }))
              }
            />
            {label}
          </label>
        ))}
        <label>
          Responsável apresentado ao cliente
          <input
            value={value.operatorName}
            onChange={(e) =>
              setValue((v) => ({ ...v, operatorName: e.target.value }))
            }
            required
            maxLength={200}
          />
        </label>
        <label>
          Intervalo da coleta
          <input readOnly value="30 minutos" />
        </label>
        <button className="primary" disabled={busy}>
          Salvar automações
        </button>
      </form>
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      <div className="notice">
        Notificações aos motoristas são limitadas a Aguardando comprovante e Com penalidade,
        mediante modelo aprovado pela Meta. Casos em revisão e encerrados continuam consultáveis,
        mas não geram disparos proativos.
      </div>
    </section>
  );
}
export function Users() {
  const { data, error, refresh } = useData<{
    records: {
      id: string;
      email: string;
      full_name: string;
      role: string;
      active: boolean;
      atendimentoActive: boolean;
    }[];
  }>("users");
  const [notice, setNotice] = useState("");
  const enabledUsers = (data?.records ?? []).filter(
    (user) => user.active && user.atendimentoActive,
  );
  return (
    <section className="card">
      <h2>Usuários do Atendimento</h2>
      <p className="muted">
        Contas compartilhadas com o Inteligência ALC. Perfis, bases e MFA
        permanecem no cadastro central. Somente usuários habilitados são
        exibidos. Novos acessos devem ser liberados nas Configurações do
        Inteligência ALC.
      </p>
      {error ? <p className="notice error">{error}</p> : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Perfil</th>
              <th>Acesso ao Atendimento</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {enabledUsers.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.full_name}
                  <small>{u.email}</small>
                </td>
                <td>{u.role}</td>
                <td>
                  Habilitado
                </td>
                <td>
                  <button
                    onClick={async () => {
                      try {
                        await api("users", {
                          id: u.id,
                          active: !u.atendimentoActive,
                        });
                        await refresh();
                        setNotice("Acesso atualizado.");
                      } catch (e) {
                        setNotice((e as Error).message);
                      }
                    }}
                  >
                    Desativar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && !enabledUsers.length ? (
        <p className="empty">Nenhum usuário habilitado no Atendimento.</p>
      ) : null}
      {notice ? <p className="notice">{notice}</p> : null}
    </section>
  );
}
function Audit() {
  const { data, error } = useData<{
    records: {
      action: string;
      target: string;
      created_at: string;
      data: Record<string, unknown>;
    }[];
  }>("audit");
  return (
    <section className="card">
      <h2>Registro de ações</h2>
      {error ? <p className="notice error">{error}</p> : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Ação</th>
              <th>Referência</th>
              <th>Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {data?.records.map((r, i) => (
              <tr key={i}>
                <td>{when(r.created_at)}</td>
                <td>{r.action}</td>
                <td>{r.target}</td>
                <td>{JSON.stringify(r.data)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data?.records.length ? (
        <div className="empty">Ainda sem ações registradas.</div>
      ) : null}
    </section>
  );
}
