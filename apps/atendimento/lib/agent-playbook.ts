export const AGENT_PLAYBOOK_VERSION = "2026-10-08-v1";
export const CUSTOMER_STEPS = [
  { id: "intro", title: "Abertura", goal: "Confirmar se a entrega foi recebida." },
  { id: "received", title: "Recebido", goal: "Confirmar data e produto real, sem pressupor respostas." },
  { id: "not-received", title: "Não recebido", goal: "Verificar portaria, vizinho ou familiar e registrar resultado." },
  { id: "wrong-product", title: "Divergente", goal: "Encaminhar divergência para análise humana." },
  { id: "handoff", title: "Atendimento humano", goal: "Transferir diante de dúvida, pedido ou contestação." },
  { id: "closing", title: "Encerramento", goal: "Agradecer, registrar resultado verificado e encerrar." },
] as const;
