export const AGENT_PLAYBOOK_VERSION = "2026-10-08-v1";
export const CUSTOMER_STEPS = [
  { id: "intro", title: "Abertura", goal: "Confirmar se a entrega foi recebida." },
  { id: "received", title: "Recebido", goal: "Confirmar data e produto real, sem pressupor respostas." },
  { id: "not-received", title: "Não recebido", goal: "Verificar portaria, vizinho ou familiar e registrar resultado." },
  { id: "wrong-product", title: "Divergente", goal: "Encaminhar divergência para análise humana." },
  { id: "handoff", title: "Atendimento humano", goal: "Transferir diante de dúvida, pedido ou contestação." },
  { id: "closing", title: "Encerramento", goal: "Agradecer, registrar resultado verificado e encerrar." },
] as const;
export const DRIVER_STEPS = [
  { id: "verify", title: "Identificar motorista", goal: "Validar telefone, nome, ID e base antes de mostrar casos." },
  { id: "lookup", title: "Consultar PNRs", goal: "Permitir consultar revisão, comprovante, penalidade e encerradas." },
  { id: "notification", title: "Notificação de PNR", goal: "Enviar somente para aguardando comprovante ou com penalidade, após aprovação do template Meta." },
] as const;
export const AGENT_GUARDRAILS = [
  "Nunca inventar status de entrega, mensagens, comprovantes ou aprovações do Mercado Livre.",
  "Nunca prometer reembolso, ressarcimento, prazo ou mudança externa que não esteja confirmada.",
  "Transferir para humano se houver dúvida, negativa persistente, conflito, solicitação ou dados insuficientes.",
  "Não expor dados de cliente ou de outro motorista e respeitar as permissões do operador.",
  "Respeitar a janela de 24 horas, modelos Meta aprovados e bloqueio de conversas assumidas.",
  "Não transformar notas internas ou mensagens pendentes em comprovantes da tratativa.",
] as const;
export function activeAgentEngine(provider?: string) {
  // A selection alone never enables an unimplemented external provider.
  return provider === "rules" || !provider ? "Regras determinísticas" : "IA externa não habilitada";
}
