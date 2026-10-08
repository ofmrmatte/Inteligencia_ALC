"use client";
import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import connector from "alc-pnr-connector/package.json";
import { connectorStatus, type ConnectorPing } from "../lib/connector-status";
import { api, useData, when } from "./data";
export function request<T>(
  type: string,
  payload: unknown = {},
  timeoutMs = 600_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => {
      window.removeEventListener("message", receive);
      reject(
        new Error(
          type === "PING"
            ? "A extensão não respondeu à verificação. Se já estiver instalada, recarregue esta aba e verifique novamente."
            : "O conector não respondeu dentro do prazo. Confira a última sincronização antes de tentar novamente.",
        ),
      );
    }, timeoutMs);
    function receive(event: MessageEvent) {
      if (
        event.origin !== location.origin ||
        event.source !== window ||
        event.data?.source !== "alc-pnr-extension" ||
        event.data.requestId !== requestId
      )
        return;
      clearTimeout(timer);
      window.removeEventListener("message", receive);
      if (event.data.ok) resolve(event.data.data);
      else reject(new Error(event.data.error?.message || "Falha no conector."));
    }
    window.addEventListener("message", receive);
    window.postMessage(
      { source: "alc-pnr-panel", type, payload, requestId },
      location.origin,
    );
  });
}
export function Collector() {
  const [connectorState, setConnectorState] = useState<ConnectorPing | null>(null);
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);
  const check = useCallback(async () => {
    setChecking(true);
    try {
      setConnectorState(await request<ConnectorPing>("PING", {}, 8_000));
    } catch {
      // A stale content script after an extension update is not evidence of an outdated version.
      setConnectorState(null);
    } finally {
      setChecked(true);
      setChecking(false);
    }
  }, []);
  useEffect(() => {
    void check();
    const whenVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    window.addEventListener("focus", whenVisible);
    document.addEventListener("visibilitychange", whenVisible);
    return () => {
      window.removeEventListener("focus", whenVisible);
      document.removeEventListener("visibilitychange", whenVisible);
    };
  }, [check]);
  const detection = connectorStatus(connectorState, connector.version, checked);
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const { data, refresh } = useData<{
    collector: {
      lastSync?: string;
      enabled?: boolean;
      lastError?: string;
    } | null;
  }>("collector");
  async function run(type: string) {
    setBusy(true);
    try {
      const result = await request<{ message?: string }>(type);
      setNotice(result.message || "Solicitação concluída.");
      await refresh();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-section collector-settings">
      <p className="eyebrow">FONTE / MERCADO LIVRE</p>
      <h2>Conector Case Center</h2>
      <p>
        Versão necessária: {connector.version}. A verificação é feita na aba atual
        do navegador. Mantenha a Bandeja de suporte e o ALC Atendimento abertos.
      </p>
      <a
        className="primary"
        href={`/downloads/alc-pnr-connector-v${connector.version}.zip`}
        download
      >
        <Download size={16} /> Baixar extensão
      </a>
      <dl>
        <dt>Extensão no navegador</dt>
        <dd role="status">{checking ? "Verificando extensão…" : detection.label}</dd>
        {connectorState?.extensionId ? (
          <>
            <dt>ID da extensão</dt>
            <dd className="wrap">{connectorState.extensionId}</dd>
          </>
        ) : null}
        <dt>Bandeja Mercado Livre</dt>
        <dd>
          {connectorState?.mlTabAvailable
            ? "Aba identificada; autenticação confirmada somente durante a coleta"
            : "Aba não identificada; abra a Bandeja autenticada neste navegador"}
        </dd>
        <dt>Frequência</dt>
        <dd>30 minutos</dd>
        <dt>Período automático</dt>
        <dd>Competência vigente, mais recentes primeiro</dd>
        <dt>Última coleta</dt>
        <dd>{when(data?.collector?.lastSync)}</dd>
        <dt>Agendamento</dt>
        <dd>
          {data?.collector?.enabled
            ? "Ativado no cadastro do coletor"
            : "Verifique o conector neste computador"}
        </dd>
      </dl>
      <div className="actions">
        <button type="button" disabled={checking} onClick={() => void check()}>
          <RefreshCw size={15} /> {checking ? "Verificando…" : "Verificar extensão"}
        </button>
        <button
          disabled={busy || !detection.ready || !connectorState?.mlTabAvailable}
          onClick={() => run("ATENDIMENTO_COLLECT")}
        >
          Coletar agora
        </button>
        <button
          disabled={busy || !detection.ready}
          onClick={() => run("ATENDIMENTO_ENABLE")}
        >
          Ativar coleta a cada 30 min
        </button>
        <button
          disabled={busy || !detection.ready}
          onClick={() => run("ATENDIMENTO_DISABLE")}
        >
          Pausar coleta
        </button>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api("sync", {});
              setNotice("Dados disponíveis no Inteligência atualizados.");
            } catch (e) {
              setNotice((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Atualizar dados do Inteligência
        </button>
      </div>
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      <div className="notice">
        Se a extensão estiver instalada e atualizada, mas sem resposta, recarregue
        a aba do ALC Atendimento: o Chrome injeta a ponte na abertura da página.
        A presença da extensão não confirma o login no Mercado Livre.
      </div>
      <div className="notice">
        Coleta manual não envia nem enfileira mensagens, mesmo com automações habilitadas.
        O coletor depende deste computador e das sessões abertas. Se houver
        falha ou a máquina estiver desligada, a próxima coleta ocorrerá quando
        estiver disponível. O histórico já coletado continua acessível.
      </div>
      <h3>Complemento do cliente</h3>
      <p className="muted">
        O Case Center fornece o comprador parcialmente. O acesso a
        package-management é necessário para confirmar telefone e demais
        detalhes do comprador. Até esse acesso estar disponível, os contatos
        podem ser complementados e validados pela equipe nos detalhes da PNR.
      </p>
      <p className="muted">
        Dados do recebedor de uma entrega não são usados como cadastro do
        comprador.
      </p>
    </section>
  );
}
