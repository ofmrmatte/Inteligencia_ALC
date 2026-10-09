import { CUSTOMER_STEPS, fillScript } from "./agent-playbook";
import { AGENT_DISPLAY_NAME } from "./agent-brand";
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
  customerCapturedAt?: string;
  customerAddressFields?: Record<string, string>;
  products: { title: string }[];
  deliveryAt: string;
  purchaseValue: number;
};
export type AgentState = {
  step: string;
  optOut?: boolean;
  receivedAt?: string;
  correctProduct?: boolean;
  result?: string;
  selectedCaseId?: string;
  selectedShipmentId?: string;
};
export type AgentReply = { state: AgentState; reply: string; handoff?: boolean };
export function clientReply(
  state: AgentState,
  text: string,
  customerName?: string,
  context?: { shipmentId?: string; deliveryAt?: string; overrides?: Record<string,string> },
): AgentReply {
  const t = normalize(text);
  const texts = context?.overrides;
  const message = (id: string) => {
    const code = CUSTOMER_STEPS.find(step => step.id === id)?.code || "";
    return (code && texts?.[code]) || CUSTOMER_STEPS.find(step => step.id === id)?.example || "";
  };
  const addressed = (id: string, name?: string) =>
    message(id).replaceAll("[Nome do Cliente]", name?.trim() || "cliente");
  const human = () => ({ state: { ...state, step: "human" }, reply: message("handoff"), handoff: true });
  if ((state.optOut && !contactOptedOut(text)) || state.step === "done" || state.step === "human")
    return { state, reply: "" }; // Prevent another automatic message after conclusion/takeover.
  if (/ATENDENTE|FALAR COM (ALGUEM|UMA PESSOA|UM HUMANO|A EQUIPE|EQUIPE)|EQUIPE LOSS|HUMANO|PARAR|CANCELAR CONTATO|NAO QUERO/.test(t))
    return human();
  if (/RECLAMACAO|ENCERRAR (A )?RECLAMACAO|FECHAR (A )?RECLAMACAO/.test(t))
    return { state, reply: message("complaint-question") };
  if (/ATIVAR (O )?CARTAO|SENHA (DO )?CARTAO|CODIGO DE SEGURANCA/.test(t))
    return { state, reply: message("card") };
  const denied = /NAO (RECEBI|RECEBEU|FOI ENTREGUE)|NAO RECEB|NUNCA RECEB|NAO CHEGOU/.test(t);
  const located = /ENCONTREI|LOCALIZEI|ACHEI|ESTAVA COM|RECEBI POR|RECEBEU POR/.test(t) && !denied && !/NAO (LOCALIZ|ENCONTR|ACHEI)/.test(t);
  const uncertain = /NAO (LEMBRO|RECORDO|SEI)|TALVEZ|NAO TENHO CERTEZA/.test(t);
  const different = /PRODUTO (ESTA |VEIO )?(DIFERENTE|ERRADO|INCORRETO|DANIFICADO)|ITEM (ERRADO|DIFERENTE)|VEIO (ERRADO|DIFERENTE|QUEBRADO)|NAO (E|EH) O (PRODUTO|ITEM)/.test(t);
  const thirdParty = /PORTARIA|PORTEIRO|VIZINH|FAMILIAR|TERCEIRO|OUTRA PESSOA|MINHA MAE|MEU PAI/.test(t);
  const yes = /^(SIM|RECEBI|RECEBIDO|FOI ENTREGUE|ESTA CORRETO|CORRETO|CERTO|ESTAVA CERTO)(\b|[.!])/.test(t);
  const answeredNo = /^(NAO|NEGATIVO)(\b|[.!])/.test(t);
  const acceptedDate = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(text);
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

export function contactOptedOut(text: string) {
  return /PARAR|CANCELAR CONTATO|NAO QUERO/.test(normalize(text));
}
export const CLIENT_AUDIO_NOTICE_POLICY = "unsupported_client_audio_v1";
export const UNSUPPORTED_AUDIO_RECORD = "Áudio não suportado. Conteúdo não armazenado nem transcrito.";
export function clientAudioNoticeText() {
  return `A ${AGENT_DISPLAY_NAME} não oferece suporte a áudio. Por favor, envie sua mensagem por texto.`;
}
export function clientAudioNoticeAllowed(
  conversation: { id: string; channel: string; phone: string; status: string; agent_state: AgentState; last_inbound_at: string | Date | null },
  job: { conversation_id: string; channel: string; phone: string; dedupe_key: string; sender_kind?: string; sender_user_id?: string | null; sender_display_name_snapshot?: string; agent_policy?: string | null; payload: unknown },
  inbound: { conversation_id: string; provider_id: string; direction: string; type: string; created_at: string | Date } | undefined,
  recentContactText: string,
  now = Date.now(),
) {
  const withinWindow = (value: string | Date | null) => {
    const elapsed = now - new Date(value ?? "").getTime();
    return Number.isFinite(elapsed) && elapsed >= -60_000 && elapsed <= 86_400_000;
  };
  if (typeof recentContactText !== "string" || !inbound || !conversation.id || conversation.channel !== "client" || job.channel !== "client" ||
    !["bot", "human", "pending"].includes(conversation.status) || conversation.agent_state.step === "done" ||
    conversation.agent_state.optOut || contactOptedOut(recentContactText) ||
    job.conversation_id !== conversation.id || inbound.conversation_id !== conversation.id ||
    job.phone !== conversation.phone || phone(conversation.phone) !== conversation.phone ||
    !withinWindow(conversation.last_inbound_at) || !withinWindow(inbound.created_at) ||
    job.agent_policy !== CLIENT_AUDIO_NOTICE_POLICY || job.sender_kind !== "ai" || job.sender_user_id != null ||
    job.sender_display_name_snapshot !== AGENT_DISPLAY_NAME || inbound.direction !== "in" || inbound.type !== "audio" ||
    !inbound.provider_id || job.dedupe_key !== `reply:audio:${inbound.provider_id}` ||
    !job.payload || typeof job.payload !== "object" || Array.isArray(job.payload)) return false;
  const payload = job.payload as Record<string, unknown>;
  if (Object.keys(payload).sort().join(",") !== "messaging_product,text,to,type" ||
    payload.messaging_product !== "whatsapp" || payload.to !== conversation.phone || payload.type !== "text" ||
    !payload.text || typeof payload.text !== "object" || Array.isArray(payload.text)) return false;
  const text = payload.text as Record<string, unknown>;
  return Object.keys(text).join(",") === "body" && text.body === clientAudioNoticeText();
}
type AgentAiPlan = { reason: "rules_terminal" | "identity_unverified" | "rules_protected" | "rules_decided" | "unsupported_state" | null; actions: string[]; code: string };
export function agentAiPlan(channel: "client" | "driver", state: AgentState, text: string, baseline: AgentReply, verified: boolean): AgentAiPlan {
  if (state.optOut || state.step === "human" || state.step === "done" || baseline.handoff || ["human", "done"].includes(baseline.state.step))
    return { reason: "rules_terminal" as const, actions: [], code: "" };
  if (!verified) return { reason: "identity_unverified" as const, actions: [], code: "" };
  const t = normalize(text);
  if (!baseline.reply || /ATENDENTE|HUMANO|LOSS|PARAR|CANCELAR CONTATO|NAO QUERO|RECLAMACAO|CARTAO|SENHA|TOKEN|CODIGO DE SEGURANCA|\b(SQL|SYSTEM|PROMPT)\b|IGNORE.*(REGRA|INSTRU|RULE)|ALTER.*(STATUS|PNR)/.test(t))
    return { reason: "rules_protected" as const, actions: [], code: "" };
  if (channel === "driver") {
    if (state.step === "driver_continue" && baseline.state.step === "driver_continue") {
      if (/ACAREACAO|TENHO (UM )?COMPROVANTE|TENHO EVIDENCIA|COMO (ENVIAR|ENTREGAR) (O )?COMPROVANTE/.test(t))
        return { reason: null, actions: ["manual_evidence"], code: "M11" };
      if (/COMO (RESOLVER|TRATAR|FAZER)|COMO PROCEDER/.test(t))
        return { reason: null, actions: ["procedure"], code: "M10" };
    }
    return { reason: "unsupported_state" as const, actions: [], code: "" };
  }
  const codes: Record<string, string> = {
    receipt: "C01", start: "C01", uncertain: "C10", date: "C02", found_later: "C11",
    product: "C03", neighbors: "C05", neighbors_wait: "C06", third_party: "C08",
  };
  if (!codes[state.step] || !codes[baseline.state.step]) return { reason: "unsupported_state" as const, actions: [], code: "" };
  if (baseline.state.step !== state.step && !(state.step === "start" && baseline.state.step === "receipt"))
    return { reason: "rules_decided", actions: [], code: codes[state.step] };
  const intents: Record<string, string[]> = {
    start: ["yes", "no", "uncertain"], receipt: ["yes", "no", "uncertain"], uncertain: ["yes", "no", "uncertain"],
    product: ["yes", "no"], neighbors: ["yes", "no", "checking"], neighbors_wait: ["yes", "no", "checking"],
    date: [], found_later: [], third_party: [],
  };
  // Dates and third-party authorization require the original deterministic evidence, not model assertions.
  return { reason: null, actions: ["clarify", "handoff", ...intents[state.step]], code: codes[state.step] };
}

export function validateAgentAiAction(
  actionId: string, channel: "client" | "driver", state: AgentState, text: string,
  baseline: AgentReply, verified: boolean,
  context?: { customerName?: string; shipmentId?: string; overrides?: Record<string, string> },
): AgentReply | null {
  const independentlyValidated = channel === "client" ? clientReply(state, text, context?.customerName, context) : baseline;
  const plan = agentAiPlan(channel, state, text, independentlyValidated, verified);
  if (!plan.actions.includes(actionId)) return null;
  if (channel === "driver") return baseline;
  if (actionId === "clarify") return independentlyValidated;
  const canonical: Record<string, string> = {
    yes: state.step === "neighbors" || state.step === "neighbors_wait" ? "Encontrei" : "Sim, correto",
    no: state.step === "neighbors" || state.step === "neighbors_wait" ? "Não encontrei" : "Não recebi",
    uncertain: "Não tenho certeza", checking: "Vou verificar", handoff: "humano",
  };
  const answer = clientReply(state, canonical[actionId], context?.customerName, context);
  const allowedNext: Record<string, string[]> = {
    start: ["date", "neighbors", "uncertain", "human"], receipt: ["date", "neighbors", "uncertain", "human"],
    uncertain: ["date", "neighbors", "uncertain", "human"], product: ["done", "human"],
    neighbors: ["date", "human", "neighbors_wait"], neighbors_wait: ["date", "human", "neighbors_wait"],
    date: ["human"], found_later: ["human"], third_party: ["human"],
  };
  return allowedNext[state.step]?.includes(answer.state.step) ? answer : null;
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
