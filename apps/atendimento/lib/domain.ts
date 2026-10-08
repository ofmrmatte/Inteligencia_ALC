import { CUSTOMER_STEPS } from "./agent-playbook";
function message(id: string) {
  return CUSTOMER_STEPS.find((step) => step.id === id)?.example || "";
}
function addressed(id: string, customerName?: string) {
  return message(id).replaceAll("[Nome do Cliente]", customerName?.trim() || "cliente");
}
export function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}
export function phone(value: unknown) {
  const n = String(value ?? "").replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(n)) return n;
  if (/^\d{10,11}$/.test(n)) return "55" + n;
  return "";
}
export function competence(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}${parts.month}Q${Number(parts.day) <= 15 ? 1 : 2}`;
}
// Proactive PNR notifications are intentionally narrower than self-service lookup.
export function driverNotificationEligible(classification: string) {
  return classification === "aguardando_comprovante" || classification === "penalidade";
}
export function classification(main: unknown, sub: unknown) {
  const t = normalize(`${main ?? ""} ${sub ?? ""}`);
  if (/CLOSED|ENCERRAD|CANCELAD|RESOLVID/.test(t)) return "encerrada";
  if (/PENAL|PENALTY|TO_BILL/.test(t)) return "penalidade";
  if (/COMPROVANTE|WAITING_RECEIPT|AWAITING.*PROOF|WAITING.*PROOF/.test(t))
    return "aguardando_comprovante";
  return "aberta";
}
export type CaseRecord = {
  caseId: string;
  shipmentId: string;
  competence: string;
  caseDate: string;
  baseKey: string;
  sigla: string;
  driverId: string;
  driverName: string;
  driverPhone: string;
  mainStatus: string;
  subStatus: string;
  classification: string;
  customerName: string;
  customerPhone: string;
  customerVerified: boolean;
  customerDocument?: string;
  customerAddress?: string;
  customerSource?: string;
  products: { title: string }[];
  deliveryAt: string;
  purchaseValue: number;
};
export type AgentState = {
  step: string;
  receivedAt?: string;
  correctProduct?: boolean;
  result?: string;
};
export function clientReply(
  state: AgentState,
  text: string,
  customerName?: string,
): { state: AgentState; reply: string; handoff?: boolean } {
  const t = normalize(text);
  if (/HUMAN|ATENDENTE|EQUIPE|PESSOA|PARAR|CANCELAR|NAO QUERO/.test(t))
    return {
      state: { ...state, step: "human" },
      reply: message("handoff"),
      handoff: true,
    };
  const denied = /NAO (RECEBI|RECEBEU|FOI ENTREGUE)|NAO RECEB|NUNCA RECEB/.test(
    t,
  );
  const yes =
    /^(SIM|RECEBI|RECEBIDO|FOI ENTREGUE|ESTA CORRETO|CORRETO)(\b|[.!])/.test(t);
  if (state.step === "receipt" || state.step === "start") {
    if (denied)
      return {
        state: { step: "neighbors" },
        reply: addressed("not-received", customerName),
      };
    if (yes)
      return {
        state: { step: "date" },
        reply: message("received"),
      };
    return {
      state: { step: "receipt" },
      reply:
        "Poderia confirmar se recebeu o produto mencionado no nosso contato?",
    };
  }
  if (state.step === "date") {
    const m = /\b(\d{1,2})\/(\d{1,2})\b/.exec(text);
    const day = Number(m?.[1]),
      month = Number(m?.[2]);
    const valid =
      m &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= new Date(2024, month, 0).getDate();
    if (!valid)
      return {
        state,
        reply: "Informe uma data válida no formato dd/mm, por favor.",
      };
    return {
      state: {
        step: "product",
        receivedAt: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`,
      },
      reply: message("date"),
    };
  }
  if (state.step === "product") {
    if (yes)
      return {
        state: {
          ...state,
          step: "done",
          correctProduct: true,
          result: "recebimento_confirmado",
        },
        reply: addressed("closing", customerName),
      };
    if (/NAO|ERRADO|DIFERENTE|INCORRETO/.test(t))
      return {
        state: {
          ...state,
          step: "human",
          correctProduct: false,
          result: "produto_divergente",
        },
        reply: message("wrong-product"),
        handoff: true,
      };
    return { state, reply: "O produto está correto? Responda sim ou não." };
  }
  if (state.step === "neighbors") {
    if (/RECEBI|ENCONTREI|ESTA COM|ESTAVA COM/.test(t) && !denied)
      return {
        state: { step: "date" },
        reply: message("received"),
      };
    if (denied || /NAO (LOCALIZ|ENCONTR)/.test(t))
      return {
        state: { step: "human", result: "nao_recebido" },
        reply: addressed("not-found", customerName),
        handoff: true,
      };
    return {
      state,
      reply:
        "Após verificar com portaria, familiares ou vizinhos, o produto foi localizado?",
    };
  }
  return {
    state: { ...state, step: "human" },
    reply: message("handoff"),
    handoff: true,
  };
}
export function clientOpening(record: CaseRecord, operator: string) {
  if (
    !record.customerVerified ||
    !record.customerName?.trim() ||
    !phone(record.customerPhone) ||
    !record.products?.length ||
    !record.deliveryAt ||
    !record.shipmentId?.trim() ||
    !Number.isFinite(record.purchaseValue) ||
    record.purchaseValue <= 0 ||
    !operator.trim()
  ) throw new Error("Cadastro do cliente ou detalhes da entrega incompletos.");
  const date = new Date(record.deliveryAt);
  if (!Number.isFinite(date.getTime())) throw new Error("Data de entrega inválida.");
  const value = record.purchaseValue.toLocaleString("pt-BR", {
    style: "currency", currency: "BRL",
  });
  const delivery = date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit",
    year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  return message("intro")
    .replace("[Nome do Cliente]", record.customerName.trim())
    .replace("[Seu Nome]", operator.trim())
    .replace("[Produto]", record.products.map((p) => p.title).join(", ").slice(0, 900))
    .replace("[Valor]", value)
    .replace("[Data/Hora]", delivery)
    .replace("[ID]", record.shipmentId.trim());
}
export function templateParameters(
  channel: "driver" | "client",
  record: CaseRecord,
  operator: string,
) {
  if (channel === "driver") {
    if (!record.driverName) throw new Error("Nome do motorista ausente.");
    const p = {
      type: "text",
      parameter_name: "nome_motorista",
      text: record.driverName,
    };
    return [
      { type: "header", parameters: [p] },
      { type: "body", parameters: [p] },
    ];
  }
  if (
    !record.customerVerified ||
    !record.customerName ||
    !record.customerPhone ||
    !record.products.length ||
    !record.deliveryAt ||
    !Number.isFinite(record.purchaseValue) ||
    record.purchaseValue <= 0
  )
    throw new Error("Cadastro do cliente ou detalhes da entrega incompletos.");
  // Validate that the approved C01 script can be fully rendered before queuing.
  clientOpening(record, operator);
  const date = new Date(record.deliveryAt);
  const values: Record<string, string> = {
    customer_name: record.customerName,
    nome_disparou: operator,
    product_name: record.products
      .map((p) => p.title)
      .join(", ")
      .slice(0, 900),
    delivery_date: date.toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    }),
    delivery_time: date.toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    }),
    product_id: record.shipmentId,
    purchase_value: record.purchaseValue.toLocaleString("pt-BR", {
      style: "currency", currency: "BRL",
    }),
  };
  return [
    {
      type: "body",
      parameters: Object.entries(values).map(([name, text]) => ({
        type: "text",
        parameter_name: name,
        text,
      })),
    },
  ];
}
