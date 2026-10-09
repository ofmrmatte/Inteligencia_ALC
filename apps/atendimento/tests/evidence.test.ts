import { describe, expect, it } from "vitest";
import { evidenceFingerprint, validateEvidence, type EvidenceMessage } from "../lib/evidence";
import { CUSTOMER_STEPS, DRIVER_STEPS, activeAgentEngine } from "../lib/agent-playbook";
import { CLIENT_AUDIO_NOTICE_POLICY, UNSUPPORTED_AUDIO_RECORD } from "../lib/domain";

const conversation = { status: "resolved", phone: "5511999990000" };
const messages: EvidenceMessage[] = [
  { id: "a", provider_id: "wamid:a", direction: "out", body: "Recebeu o produto?", type: "text", status: "delivered", created_at: "2026-10-08T10:00:00Z" },
  { id: "b", provider_id: "wamid:b", direction: "in", body: "Sim", type: "text", status: "received", created_at: "2026-10-08T10:01:00Z" },
  { id: "c", provider_id: "wamid:c", direction: "out", body: "Obrigado pela confirmação.", type: "text", status: "sent", created_at: "2026-10-08T10:02:00Z" },
];

describe("comprovante fiel à conversa real", () => {
  it("permite o histórico integral confirmado, com início meio e fim", () => {
    expect(validateEvidence(conversation, messages)).toBeNull();
    expect(evidenceFingerprint(conversation.phone, "123", messages)).toHaveLength(64);
  });
  it("bloqueia conversa não encerrada, envio incerto, notas, modelos sem texto, anexos e truncamento", () => {
    expect(validateEvidence({ ...conversation, status: "human" }, messages)).toMatch(/Resolva/);
    expect(validateEvidence(conversation, messages.map((m) => m.id === "c" ? { ...m, status: "uncertain" } : m))).toMatch(/confirma/);
    expect(validateEvidence(conversation, [...messages, { ...messages[0], direction: "note" }])).toMatch(/notas/);
    expect(validateEvidence(conversation, messages.map((m) => m.id === "a" ? { ...m, body: "[Modelo: cliente_loss]" } : m))).toMatch(/modelo Meta/);
    expect(validateEvidence(conversation, messages.map((m) => m.id === "a" ? { ...m, type: "image" } : m))).toMatch(/mídia/i);
    expect(validateEvidence(conversation, messages, true)).toMatch(/integral/);
  });
  it("não permite alterar silenciosamente o conteúdo sem mudar o hash", () => {
    const first = evidenceFingerprint(conversation.phone, "123", messages);
    const second = evidenceFingerprint(conversation.phone, "123", messages.map((m) =>
      m.id === "b" ? { ...m, body: "Não" } : m,
    ));
    expect(first).not.toBe(second);
  });
  it("preserva a recusa explícita de áudio, sem afirmar que o original está arquivado", () => {
    const audio: EvidenceMessage = { ...messages[1], type: "audio", body: UNSUPPORTED_AUDIO_RECORD,
      attachment: { id: "synthetic-audio", mime: "audio/ogg", unsupported: true, policy: CLIENT_AUDIO_NOTICE_POLICY } };
    const history = [messages[0], audio, messages[2]];
    expect(validateEvidence(conversation, history)).toBeNull();
    expect(validateEvidence(conversation, [messages[0], { ...audio, attachment: null }, messages[2]])).toMatch(/mídia/i);
    expect(validateEvidence(conversation, [messages[0], messages[1], { ...audio, id: "unsupported-out", direction: "out" }, messages[2]])).toMatch(/mídia/i);
    expect(evidenceFingerprint(conversation.phone, "123", history)).not.toBe(evidenceFingerprint(conversation.phone, "123",
      [messages[0], { ...audio, attachment: { ...(audio.attachment as object), id: "different-audio" } }, messages[2]]));
  });
});

it("documenta o motor de regras atual e as etapas para clientes e motoristas", () => {
  expect(activeAgentEngine()).toBe("Regras determinísticas");
  expect(activeAgentEngine("openai")).toMatch(/não habilitada/);
  expect(CUSTOMER_STEPS.map((s) => s.id)).toContain("closing");
  expect(DRIVER_STEPS.map((s) => s.id)).toContain("lookup");
});
