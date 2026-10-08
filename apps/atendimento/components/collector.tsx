"use client";
import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import connector from "alc-pnr-connector/package.json";
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
          "Conector não respondeu. Atualize a extensão e recarregue esta página.",
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
  const [connectorState, setConnectorState] = useState<{
    installed: boolean;
    version?: string;
    mlTabAvailable?: boolean;
  } | null>(null);
  const check = useCallback(
    () =>
      request<{
        installed: boolean;
        version?: string;
        mlTabAvailable?: boolean;
      }>("PING", {}, 5000)
        .then(setConnectorState)
        .catch(() => setConnectorState({ installed: false })),
    [],
  );
  useEffect(() => {
    void check();
  }, [check]);
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
        Instale a versão {connector.version} no computador de teste. Mantenha a
        Bandeja de suporte autenticada e uma aba do ALC Atendimento abertas.
      </p>
      <a
        className="primary"
        href={`/downloads/alc-pnr-connector-v${connector.version}.zip`}
        download
      >
        <Download size={16} /> Baixar extensão
      </a>
      <dl>
        <dt>Este computador</dt>
        <dd>
          {connectorState === null
            ? "Verificando conector"
            : !connectorState.installed
              ? "Conector não encontrado"
              : `Conector ${connectorState.version || "instalado"}`}
        </dd>
        <dt>Bandeja Mercado Livre</dt>
        <dd>
          {connectorState?.mlTabAvailable
            ? "Aba disponível; sessão verificada na coleta"
            : "Abra a Bandeja autenticada neste navegador"}
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
        <button onClick={() => void check()}>
          <RefreshCw size={15} /> Verificar conector
        </button>
        <button
          disabled={busy || !connectorState?.mlTabAvailable}
          onClick={() => run("ATENDIMENTO_COLLECT")}
        >
          Coletar agora
        </button>
        <button
          disabled={busy || !connectorState?.installed}
          onClick={() => run("ATENDIMENTO_ENABLE")}
        >
          Ativar coleta a cada 30 min
        </button>
        <button
          disabled={busy || !connectorState?.installed}
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
