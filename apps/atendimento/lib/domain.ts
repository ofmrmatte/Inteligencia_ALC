import { CUSTOMER_STEPS, fillScript } from "./agent-playbook";
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
  context?: { shipmentId?: string; deliveryAt?: string },
): { state: AgentState; reply: string; handoff?: boolean } {
  const t = normalize(text);
  const human = () => ({ state: { ...state, step: "human" }, reply: message("handoff"), handoff: true });
  if (state.step === "done" || state.step === "human")
    return { state, reply: "" }; // Prevent another automatic message after conclusion/takeover.
  if (/ATENDENTE|FALAR COM (ALGUEM|UMA PESSOA|UM HUMANO)|EQUIPE LOSS|HUMANO|PARAR|CANCELAR CONTATO|NAO QUERO/.test(t))
    return human();
  if (/RECLAMACAO|ENCERRAR (A )?RECLAMACAO|FECHAR (A )?RECLAMACAO/.test(t))
    return { state, reply: message("complaint-question") };
  if (/ATIVAR (O )?CARTAO|SENHA (DO )?CARTAO|CODIGO DE SEGURANCA/.test(t))
    return { state, reply: message("card") };
  const denied = /NAO (RECEBI|RECEBEU|FOI ENTREGUE)|NAO RECEB|NUNCA RECEB|NAO CHEGOU/.test(t);
  const located = /ENCONTREI|LOCALIZEI|ACHEI|ESTAVA COM|RECEBI POR|RECEBEU POR/.test(t) && !denied;
  const uncertain = /NAO (LEMBRO|RECORDO|SEI)|TALVEZ|NAO TENHO CERTEZA/.test(t);
  const different = /PRODUTO (DIFERENTE|ERRADO|INCORRETO|DANIFICADO)|ITEM (ERRADO|DIFERENTE)|VEIO (ERRADO|DIFERENTE|QUEBRADO)|NAO (E|EH) O (PRODUTO|ITEM)/.test(t);
  const thirdParty = /PORTARIA|PORTEIRO|VIZINH|FAMILIAR|TERCEIRO|OUTRA PESSOA|MINHA MAE|MEU PAI/.test(t);
  const yes = /^(SIM|RECEBI|RECEBIDO|FOI ENTREGUE|ESTA CORRETO|CORRETO|CERTO|ESTAVA CERTO)(\\b|[.!])/.test(t);
  const answeredNo = /^(NAO|NEGATIVO)(\\b|[.!])/.test(t);
  const acceptedDate = /\\b(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?\\b/.exec(text);
  const day = Number(acceptedDate?.[1]), month = Number(acceptedDate?.[2]);
  const year = acceptedDate?.[3] ? Number(acceptedDate[3].length === 2 ? "20"+acceptedDate[3] : acceptedDate[3]) : new Date().getFullYear();
  const validDate = Boolean(acceptedDate && year >= 2000 && month >= 1 && month <= 12 &&
    day >= 1 && day <= new Date(year, month, 0).getDate());
  const formattedDate = validDate ? `${String(day).padStart(2,"0")}/${String(month).padStart(2,"0")}` : "";
  const identified = addressed("uncertain", customerName);
  const verifiedDelivery = context?.shipmentId?.trim();
  const uncertainReply = verifiedDelivery
    ? fillScript(identified, { ID: verifiedDelivery })
    : identified.replace("Estamos consultando a entrega vinculada ao envio [ID].",
      "Estamos consultando as informações da entrega mencionada no primeiro contato.");
  if (state.step === "receipt" || state.step === "start" || state.step === "uncertain") {
    if (denied) return { state: { step: "neighbors" }, reply: addressed("not-received", customerName) };
    if (uncertain) return { state: { step: "uncertain" }, reply: uncertainReply };
    if (different) return { state: { step: "human", correctProduct: false, result: "produto_divergente" }, reply: message("wrong-product"), handoff: true };
    if (thirdParty && /RECEB|ENTREG|PEGOU/.test(t))
      return { state: { step: "third_party" }, reply: message("third-party") };
    if (yes) return { state: { step: "date" }, reply: message("received") };
    return { state: { step: "receipt" }, reply: "Poderia confirmar se recebeu o produto mencionado no nosso contato?" };
  }
  if (state.step === "date" || state.step === "found_later") {
    if (different) return { state: { step: "human", correctProduct: false, result: "produto_divergente" }, reply: message("wrong-product"), handoff: true };
    if (!validDate) return { state, reply: "Para registrar a data corretamente, informe o dia e mês em que recebeu o produto (dd/mm), por gentileza." };
    return { state: { step: "product", receivedAt: formattedDate }, reply: message("date") };
  }
  if (state.step === "product") {
    if (different || answeredNo)
      return { state: { ...state, step: "human", correctProduct: false, result: "produto_divergente" }, reply: message("wrong-product"), handoff: true };
    if (yes)
      return { state: { ...state, step: "done", correctProduct: true, result: "recebimento_confirmado" }, reply: addressed("closing", customerName) };
    return { state, reply: "O produto recebido corresponde ao que você comprou? Pode responder com suas palavras." };
  }
  if (state.step === "neighbors" || state.step === "neighbors_wait") {
    if (located) return { state: { step: "date" }, reply: message("found-later") };
    if (/AINDA (NAO )?(VERIFIQUEI|OLHEI|CONFERI)|VOU VERIFICAR|VOU CONFERIR|PRECISO VERIFICAR|DEPOIS VEJO/.test(t))
      return { state: { step: "neighbors_wait" }, reply: message("check-pending") };
    if (denied || /NAO (LOCALIZ|ENCONTR|ACHEI)|VERIFIQUEI E NAO|NINGUEM RECEBEU/.test(t))
      return { state: { step: "human", result: "nao_recebido" }, reply: addressed("not-found", customerName), handoff: true };
    if (thirdParty && /RECEB|ENTREG|PEGOU/.test(t))
      return { state: { step: "third_party" }, reply: message("third-party") };
    // Do not interpret "Sim, verifiquei" as "Sim, recebi".
    if (state.step === "neighbors_wait" && /^(OK|CERTO|ENTENDI|COMBINADO)$/.test(t))
      return { state, reply: "" };
    return { state, reply: "Obrigado. A encomenda foi localizada após verificar com as pessoas do endereço?" };
  }
  if (state.step === "third_party") {
    if (answeredNo || /NAO AUTORIZ|DESCONHEC|NAO CONHECO/.test(t))
      return { state: { step: "human", result: "recebimento_terceiro_nao_autorizado" },
        reply: "Entendi. Vou encaminhar essa informação à equipe de Prevenção de Perdas para análise, sem registrar o recebimento como confirmado.",
        handoff: true };
    if (/AUTORIZAD|CONHEC|E DA FAMILIA|MORA COMIGO/.test(t) || yes) {
      if (validDate) return { state: { step: "product", receivedAt: formattedDate }, reply: message("date") };
      return { state: { step: "date" }, reply: "Obrigado pela informação. Em que data a encomenda foi recebida pela pessoa autorizada (dd/mm)?" };
    }
    return { state, reply: "Essa pessoa estava autorizada a receber a encomenda em seu nome? Se possível, informe também a data." };
  }
  return human();
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
