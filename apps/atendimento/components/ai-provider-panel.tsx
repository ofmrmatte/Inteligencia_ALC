"use client";
import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Pencil, RefreshCw, Save, Trash2 } from "lucide-react";
import { api, useData, when, PRIVATE_CONTENT_CLEARED_EVENT } from "./data";
import { ManagementDialog } from "./management-dialog";
import {
  ChannelCredentialStepUp,
  type AiCredentialPayload,
} from "./channel-credential-step-up";
import { documentedAiModel } from "../lib/ai-models";
import type { AgentAiConfig } from "../lib/agent-instructions";
import type { aiConfigurationStatus } from "../lib/ai-provider-service";

export type AiStatus = Awaited<ReturnType<typeof aiConfigurationStatus>>;
const results: Record<string, string> = {
  ready: "Conexão e resposta estruturada confirmadas",
  authentication_failed: "Credencial recusada pelo provedor",
  model_unavailable: "Modelo não encontrado ou sem acesso",
  provider_limit: "Limite do provedor atingido",
  timeout: "Prazo da consulta excedido",
  incompatible_model:
    "Modelo incompatível com a API ou com o formato estruturado",
  unavailable: "Provedor indisponível ou resposta inválida",
};
const providers = { openai: "OpenAI", gemini: "Google Gemini" };
export function AiProviderPanel() {
  const { data, error, refresh } = useData<AiStatus>("ai-config");
  const [draft, setDraft] = useState<AgentAiConfig | null>(null),
    [secret, setSecret] = useState<string | null>(null),
    [credential, setCredential] = useState<AiCredentialPayload | null>(null),
    [confirmation, setConfirmation] = useState<"remove" | "test" | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [tested, setTested] = useState<{
      result: string;
      testedAt: string;
      provider: AgentAiConfig["provider"];
      model: string;
    } | null>(null);
  const selected = draft || data?.config,
    status = selected && data?.credentials[selected.provider];
  useEffect(() => {
    const clear = () => {
      setSecret(null);
      setCredential(null);
      setDraft(null);
      setConfirmation(null);
      setTested(null);
      setNotice("");
    };
    window.addEventListener(PRIVATE_CONTENT_CLEARED_EVENT, clear);
    return () =>
      window.removeEventListener(PRIVATE_CONTENT_CLEARED_EVENT, clear);
  }, []);
  const lastTest =
    tested?.provider === selected?.provider && tested?.model === selected?.model
      ? tested
      : selected?.provider === data?.config.provider
        ? data?.diagnostic.lastTest
        : null;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setNotice("");
    try {
      await api("ai-config", draft);
      await refresh();
      setDraft(null);
      setSecret(null);
      setNotice("Configuração de IA salva.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Falha ao salvar configuração.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    if (!selected) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await api<NonNullable<typeof tested>>("ai-test", {
        provider: selected.provider,
        model: selected.model,
        timeoutMs: selected.timeoutMs,
        confirmed: true,
      });
      setTested(result);
      setNotice(results[result.result] || "Teste indisponível.");
      await refresh();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Falha ao testar conexão.",
      );
    } finally {
      setBusy(false);
      setConfirmation(null);
    }
  }
  return (
    <section
      className="ai-provider-section"
      aria-labelledby="ai-provider-title"
    >
      <div className="agent-instruction-top">
        <div>
          <h3 id="ai-provider-title">Provedor de IA</h3>
          <p className="muted">
            {data
              ? `Chamadas hoje (UTC): ${data.used} / ${data.config.dailyCallLimit} · Disponíveis: ${data.remaining}`
              : "Uso ainda não verificado."}
          </p>
        </div>
        {data && (
          <button
            disabled={busy}
            onClick={() => {
              setDraft({ ...data.config });
              setNotice("");
            }}
          >
            <Pencil size={15} />
            Configurar IA
          </button>
        )}
      </div>
      <p className="notice">
        Motor atual:{" "}
        <strong>
          {!data
            ? "Configuração não verificada"
            : data.diagnostic.effective === "rules"
              ? "Regras determinísticas"
              : data.diagnostic.effective === "available"
                ? "IA disponível · conexão verificada"
                : data.diagnostic.effective === "untested"
                  ? "IA configurada · conexão ainda não verificada"
                  : "IA indisponível · fallback determinístico"}
        </strong>
        . A identidade da Ellie não substitui o atendente humano nos templates.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {selected && (
        <>
          <dl className="ai-diagnostic">
            <div>
              <dt>Provedor selecionado</dt>
              <dd>{providers[selected.provider]}</dd>
            </div>
            <div>
              <dt>Credencial</dt>
              <dd>
                {status?.configured
                  ? "Configurada"
                  : status?.source === "unavailable"
                    ? "Indisponível"
                    : "Não configurada"}
                {status?.source === "environment"
                  ? " · Ambiente Railway"
                  : status?.source === "stored"
                    ? " · Cofre criptografado"
                    : ""}
              </dd>
            </div>
            <div>
              <dt>Modelo ativo</dt>
              <dd>{data?.config.model || "Não configurado"}</dd>
            </div>
            <div>
              <dt>Último teste de conexão</dt>
              <dd>
                {lastTest
                  ? `${when(lastTest.testedAt)} · ${results[lastTest.result] || "Não verificado"}${"current" in lastTest && !lastTest.current ? " · Configuração anterior" : ""}`
                  : "Ainda não testado"}
              </dd>
            </div>
          </dl>
          {draft && (
            <form className="ai-config-form" onSubmit={save}>
              <fieldset
                disabled={busy || Boolean(credential)}
                className="management-form"
              >
                <div className="management-form-grid">
                  <label>
                    Provedor
                    <select
                      value={draft.provider}
                      onChange={(e) => {
                        setDraft({
                          ...draft,
                          provider: e.target.value as AgentAiConfig["provider"],
                          model: "",
                        });
                        setSecret(null);
                      }}
                    >
                      <option value="openai">OpenAI</option>
                      <option value="gemini">Google Gemini</option>
                    </select>
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={(e) =>
                        setDraft({ ...draft, enabled: e.target.checked })
                      }
                    />
                    IA habilitada
                  </label>
                </div>
                <section className="ai-credential">
                  <div className="ai-credential-heading">
                    <strong>Credencial de {providers[draft.provider]}</strong>
                    <div className="actions">
                      <button type="button" onClick={() => setSecret("")}>
                        <KeyRound size={15} />
                        {status?.configured
                          ? "Substituir credencial"
                          : "Cadastrar credencial"}
                      </button>
                      {status?.stored && (
                        <button
                          type="button"
                          onClick={() => setConfirmation("remove")}
                        >
                          <Trash2 size={15} />
                          Remover credencial
                        </button>
                      )}
                    </div>
                  </div>
                  {secret !== null && (
                    <div className="ai-secret-entry">
                      <label>
                        API Key
                        <input
                          type="password"
                          autoComplete="off"
                          maxLength={3000}
                          value={secret}
                          onChange={(e) => setSecret(e.target.value)}
                        />
                      </label>
                      <div className="actions">
                        <button
                          type="button"
                          disabled={!secret}
                          onClick={() => {
                            setCredential({
                              operation: "replace_ai_credential",
                              channel: draft.provider,
                              apiKey: secret,
                            });
                            setSecret(null);
                          }}
                        >
                          <Save size={15} />
                          Salvar credencial
                        </button>
                        <button type="button" onClick={() => setSecret(null)}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                  <small>
                    Cadastro, substituição e remoção exigem confirmação MFA.
                    Chaves salvas nunca são exibidas.
                  </small>
                </section>
                <ModelPicker
                  key={draft.provider}
                  config={draft}
                  onChange={(model) => setDraft({ ...draft, model })}
                />
                <div className="management-form-grid">
                  <label>
                    Limite diário de chamadas
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      step={1}
                      required
                      value={draft.dailyCallLimit}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          dailyCallLimit: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Timeout (segundos)
                    <input
                      type="number"
                      min={0.1}
                      max={8}
                      step={0.1}
                      required
                      value={draft.timeoutMs / 1000}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          timeoutMs: Math.round(Number(e.target.value) * 1000),
                        })
                      }
                    />
                  </label>
                </div>
                <div className="actions">
                  <button type="submit" className="primary">
                    <Save size={15} />
                    Salvar configuração
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(null);
                      setSecret(null);
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={!draft.model || !status?.configured}
                    onClick={() => setConfirmation("test")}
                  >
                    <RefreshCw size={15} />
                    Testar conexão
                  </button>
                </div>
              </fieldset>
            </form>
          )}
        </>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {credential && (
        <ChannelCredentialStepUp
          payload={credential}
          onCancel={() => setCredential(null)}
          onComplete={async () => {
            setCredential(null);
            await refresh();
            setNotice("Credencial de IA atualizada com confirmação MFA.");
          }}
        />
      )}
      {confirmation && (
        <ManagementDialog
          title={
            confirmation === "test"
              ? "Testar conexão de IA"
              : "Remover credencial de IA"
          }
          busy={busy}
          onClose={() => setConfirmation(null)}
        >
          <div className="management-dialog-body">
            <p>
              {confirmation === "test"
                ? "Este teste faz uma chamada ao provedor que pode ser faturada e conta no limite diário. Apenas texto sintético será enviado. Nenhuma mensagem de WhatsApp será enviada e a IA não será ativada."
                : "A credencial salva será removida após confirmação MFA. Se existir uma chave no ambiente Railway, ela voltará a ser utilizada. Para bloquear a IA, desative-a também na configuração."}
            </p>
          </div>
          <footer>
            <button disabled={busy} onClick={() => setConfirmation(null)}>
              Cancelar
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => {
                if (confirmation === "test") void test();
                else if (selected) {
                  setCredential({
                    operation: "remove_ai_credential",
                    channel: selected.provider,
                  });
                  setConfirmation(null);
                }
              }}
            >
              {busy
                ? "Testando…"
                : confirmation === "test"
                  ? "Confirmar teste faturável"
                  : "Continuar com MFA"}
            </button>
          </footer>
        </ManagementDialog>
      )}
    </section>
  );
}

function ModelPicker({
  config,
  onChange,
}: {
  config: AgentAiConfig;
  onChange: (model: string) => void;
}) {
  const [manual, setManual] = useState(
    !config.model || !documentedAiModel(config.provider, config.model),
  );
  const { data, error, refresh } = useData<{
    models: { id: string; label: string }[];
    fetchedAt: string;
  }>(`ai-models?provider=${config.provider}`);
  return (
    <section className="ai-model-picker">
      <div className="ai-credential-heading">
        <h3>Modelo</h3>
        <div className="segmented">
          <button
            type="button"
            aria-pressed={!manual}
            onClick={() => setManual(false)}
          >
            Catálogo
          </button>
          <button
            type="button"
            aria-pressed={manual}
            onClick={() => setManual(true)}
          >
            Manual
          </button>
        </div>
      </div>
      {manual ? (
        <label>
          Modelo
          <input
            required={config.enabled}
            maxLength={120}
            value={config.model}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      ) : (
        <label>
          Modelos compatíveis
          <select
            required={config.enabled}
            value={config.model}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">Selecionar modelo</option>
            {config.model &&
              !data?.models.some((model) => model.id === config.model) && (
                <option value={config.model}>
                  Modelo atual fora do catálogo: {config.model}
                </option>
              )}
            {data?.models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="ai-catalog-status">
        <small>
          {error ||
            (!data
              ? "Carregando catálogo…"
              : `${data.models.length} modelo(s) compatível(is) · ${when(data.fetchedAt)}`)}
        </small>
        <button
          type="button"
          className="icon-button"
          title="Atualizar catálogo"
          aria-label="Atualizar catálogo"
          onClick={() => void refresh()}
        >
          <RefreshCw size={15} />
        </button>
      </div>
      <small>
        Modelos fora do catálogo precisam passar pelo teste de resposta
        estruturada antes da ativação.
      </small>
    </section>
  );
}
