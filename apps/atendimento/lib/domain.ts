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
): { state: AgentState; reply: string; handoff?: boolean } {
  const t = normalize(text);
  if (/HUMAN|ATENDENTE|EQUIPE|PESSOA|PARAR|CANCELAR|NAO QUERO/.test(t))
    return {
      state: { ...state, step: "human" },
      reply: "Vou encaminhar seu atendimento à equipe Loss da ALC.",
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
        reply:
          "Você já verificou se alguém da portaria, um familiar ou vizinho recebeu o produto?",
      };
    if (yes)
      return {
        state: { step: "date" },
        reply:
          "Obrigado pela confirmação. Em qual data você recebeu o produto? Informe dia e mês (dd/mm).",
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
      reply: "O produto recebido está correto, conforme sua compra?",
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
        reply:
          "Obrigado! Registramos suas informações para análise da equipe. Por favor, confirme também o recebimento diretamente no aplicativo do Mercado Livre.",
      };
    if (/NAO|ERRADO|DIFERENTE|INCORRETO/.test(t))
      return {
        state: {
          ...state,
          step: "human",
          correctProduct: false,
          result: "produto_divergente",
        },
        reply:
          "Obrigado pelas informações. Vou encaminhar a divergência à equipe para análise.",
        handoff: true,
      };
    return { state, reply: "O produto está correto? Responda sim ou não." };
  }
  if (state.step === "neighbors") {
    if (/RECEBI|ENCONTREI|ESTA COM|ESTAVA COM/.test(t) && !denied)
      return {
        state: { step: "date" },
        reply:
          "Que bom que localizou. Em qual data você recebeu o produto? Informe dd/mm.",
      };
    if (denied || /NAO (LOCALIZ|ENCONTR)/.test(t))
      return {
        state: { step: "done", result: "nao_recebido" },
        reply:
          "Obrigado pelas informações. Registramos que o produto não foi localizado e encaminharemos seu relato à equipe responsável pelo contato com o Mercado Livre.",
      };
    return {
      state,
      reply:
        "Após verificar com portaria, familiares ou vizinhos, o produto foi localizado?",
    };
  }
  return {
    state: { ...state, step: "human" },
    reply: "Vou encaminhar sua nova mensagem à equipe Loss da ALC.",
    handoff: true,
  };
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
    !record.deliveryAt
  )
    throw new Error("Cadastro do cliente ou detalhes da entrega incompletos.");
  const date = new Date(record.deliveryAt);
  if (!Number.isFinite(date.getTime()))
    throw new Error("Data de entrega inválida.");
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
