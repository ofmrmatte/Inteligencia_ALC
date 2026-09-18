export const CASE_CENTER_PAGE_SIZE = 30;

function text(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function keyedValues(item) {
  const values = new Map();
  for (const cell of Array.isArray(item?.cells) ? item.cells : []) {
    for (const line of Array.isArray(cell?.lines) ? cell.lines : []) {
      for (const field of Array.isArray(line) ? line : []) {
        if (typeof field?.key === "string") values.set(field.key, field.value);
      }
    }
  }
  return values;
}

function amount(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { purchaseValue: 0, currency: "" };
  const number = Number(value.amount ?? 0);
  return {
    purchaseValue: Number.isFinite(number) && number >= 0 ? number : 0,
    currency: text(value.currency),
  };
}

export function normalizeCaseCenterPnrCase(item) {
  const fields = keyedValues(item);
  const state = fields.get("case.state");
  const shipmentAmount = amount(fields.get("case.shipment_amount"));
  const caseId = text(item?.case_id ?? fields.get("case.id"));
  const shipmentId = text(fields.get("case.shipment_id"));
  const caseDate = text(fields.get("case.date_created"));
  if (!caseId || !shipmentId || !/^\d{4}-\d{2}-\d{2}/.test(caseDate)) return null;

  return {
    caseId,
    caseDate,
    routeCode: text(fields.get("case.route_code")),
    routeId: text(fields.get("case.route_id")),
    originStation: text(fields.get("case.svc_name")),
    driverName: text(fields.get("case.driver_name")),
    shipmentId,
    purchaseValue: shipmentAmount.purchaseValue,
    currency: shipmentAmount.currency,
    mainStatus: text(state && typeof state === "object" ? state.status : ""),
    subStatus: text(state && typeof state === "object" ? state.sub_status : ""),
    reviewedStatus: text(fields.get("case.reviewed_status")),
    caseType: text(fields.get("case.type")),
    routeStatus: text(fields.get("case.route_status")),
    priority: text(item?.priority),
  };
}

export function normalizeCaseCenterPage(payload, requestedPage) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.casesList) || !payload.paging) {
    throw Object.assign(new Error("Resposta inválida do Case Center."), { code: "INVALID_RESPONSE" });
  }
  const normalized = payload.casesList.map(normalizeCaseCenterPnrCase);
  const records = normalized.filter(Boolean);
  const totalPages = Number(payload.paging.totalPages ?? 0);
  const totalElements = Number(payload.paging.totalElements ?? 0);
  if (!Number.isInteger(totalPages) || totalPages < 0 || !Number.isInteger(totalElements) || totalElements < 0) {
    throw Object.assign(new Error("Paginação inválida do Case Center."), { code: "INVALID_RESPONSE" });
  }
  return {
    records,
    page: requestedPage,
    totalPages,
    totalElements,
    invalidCount: normalized.length - records.length,
  };
}

export function periodDetails(competence) {
  const match = /^(20\d{2})(0[1-9]|1[0-2])Q([12])$/.exec(competence);
  if (!match) throw Object.assign(new Error("Competência inválida."), { code: "INVALID_RESPONSE" });
  const year = Number(match[1]);
  const month = Number(match[2]);
  const half = Number(match[3]);
  const endDay = half === 1 ? 15 : new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    period: competence,
    dateFrom: `${match[1]}-${match[2]}-${half === 1 ? "01" : "16"}T00:00:00.000Z`,
    dateTo: `${match[1]}-${match[2]}-${String(endDay).padStart(2, "0")}T23:59:59.999Z`,
  };
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function clean(value, max = 2000) {
  return text(value).replace(/\s+/g, " ").trim().slice(0, max);
}

function normalized(value) {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function aliasMatch(value, aliases) {
  const key = normalized(value);
  return Boolean(key) && aliases.some((alias) => key === alias || key.includes(alias));
}

function scalar(value) {
  return typeof value === "string" || typeof value === "number" ? clean(value, 2000) : "";
}

function sourcePlaceholder(value) {
  const raw = clean(value).toLowerCase();
  return raw === "-" || ["no -", "n/a", "n.a.", "não informado", "sem informação"].includes(raw);
}

export function findLabeledValue(root, aliases) {
  const targets = aliases.map(normalized).filter(Boolean);
  const visited = new Set();
  const visit = (value, depth = 0) => {
    if (depth > 10 || value == null || typeof value !== "object" || visited.has(value)) return null;
    visited.add(value);
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 300)) {
        const result = visit(item, depth + 1);
        if (result) return result;
      }
      return null;
    }

    for (const [key, item] of Object.entries(value).slice(0, 300)) {
      if (!targets.includes(normalized(key))) continue;
      const direct = scalar(item) || scalar(record(item)?.value ?? record(item)?.text ?? record(item)?.content);
      if (direct) return { found: true, placeholder: sourcePlaceholder(direct), value: direct };
    }

    const label = scalar(value.label ?? value.key ?? value.name);
    if (targets.includes(normalized(label))) {
      const direct = scalar(value.value ?? value.text ?? value.content ?? value.description ?? value.message);
      if (direct) return { found: true, placeholder: sourcePlaceholder(direct), value: direct };
    }

    for (const item of Object.values(value).slice(0, 300)) {
      const result = visit(item, depth + 1);
      if (result) return result;
    }
    return null;
  };
  return visit(root) ?? { found: false, placeholder: false, value: "" };
}

function findSection(root, aliases) {
  const targets = aliases.map(normalized).filter(Boolean);
  const visited = new Set();
  const visit = (value, depth = 0) => {
    if (depth > 10 || value == null || typeof value !== "object" || visited.has(value)) return null;
    visited.add(value);
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 300)) {
        const result = visit(item, depth + 1);
        if (result) return result;
      }
      return null;
    }
    for (const [key, item] of Object.entries(value).slice(0, 300)) {
      if (aliasMatch(key, targets) && item && typeof item === "object") return item;
    }
    const heading = value.title ?? value.heading ?? value.header ?? value.sectionTitle ?? value.cardTitle ?? value.type;
    if (aliasMatch(heading, targets)) return value;
    for (const item of Object.values(value).slice(0, 300)) {
      const result = visit(item, depth + 1);
      if (result) return result;
    }
    return null;
  };
  return visit(root);
}

function findDirectTextNode(root, pattern) {
  const visited = new Set();
  const visit = (value, depth = 0) => {
    if (depth > 10 || value == null || typeof value !== "object" || visited.has(value)) return null;
    visited.add(value);
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 300)) {
        const result = visit(item, depth + 1);
        if (result) return result;
      }
      return null;
    }
    if (Object.values(value).slice(0, 300).some((item) => scalar(item) && pattern.test(clean(item)))) return value;
    for (const item of Object.values(value).slice(0, 300)) {
      const result = visit(item, depth + 1);
      if (result) return result;
    }
    return null;
  };
  return visit(root);
}

function directNestedValue(root, keys) {
  const source = record(root);
  if (!source) return "";
  for (const key of keys) {
    const value = source[key];
    const direct = scalar(value);
    if (direct) return direct;
    const nested = record(value);
    const nestedValue = scalar(nested?.name ?? nested?.value ?? nested?.text);
    if (nestedValue) return nestedValue;
  }
  return "";
}

function valueFrom(root, aliases) {
  return findLabeledValue(root, aliases).value;
}

function first(...values) {
  return values.find((value) => clean(value)) || "";
}

function fileNames(root) {
  const files = new Map();
  const visited = new Set();
  const add = (value) => {
    const name = clean(value, 300);
    if (name && /\.[a-z0-9]{2,8}$/i.test(name)) files.set(normalized(name), name);
  };
  const visit = (value, depth = 0, inFiles = false) => {
    if (depth > 10 || value == null || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.slice(0, 100).forEach((item) => visit(item, depth + 1, inFiles));
      return;
    }
    const explicitName = scalar(value.fileName ?? value.filename);
    if (explicitName) add(explicitName);
    if (inFiles) add(value.name);
    for (const [key, item] of Object.entries(value).slice(0, 300)) {
      visit(item, depth + 1, inFiles || ["files", "attachments", "evidences", "evidence"].includes(normalized(key)));
    }
  };
  visit(root);
  return [...files.values()].slice(0, 30);
}

function productsFrom(root) {
  const products = new Map();
  const visited = new Set();
  const visit = (value, depth = 0) => {
    if (depth > 10 || value == null || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.slice(0, 100).forEach((item) => visit(item, depth + 1));
      return;
    }
    const title = clean(value.title, 500);
    const payment = record(value.payment);
    const priceValue = payment?.amount ?? record(value.price)?.amount ?? value.price;
    const price = Number(priceValue);
    if (title && (payment || value.product_id || value.productId || (value.id && Number.isFinite(price)))) {
      const id = scalar(value.id);
      const key = `${id}|${normalized(title)}`;
      products.set(key, {
        ...(id ? { id } : {}),
        title,
        ...(Number.isFinite(price) && price >= 0 ? { price } : {}),
        ...(scalar(payment?.currency ?? record(value.price)?.currency) ? { currency: scalar(payment?.currency ?? record(value.price)?.currency) } : {}),
      });
    }
    Object.values(value).slice(0, 300).forEach((item) => visit(item, depth + 1));
  };
  visit(root);
  return [...products.values()].slice(0, 30);
}

function eventOf(events, matcher) {
  return [...events].reverse().find((event) => matcher(text(event?.event_type)));
}

function actorFromSentence(root, pattern) {
  const node = findDirectTextNode(root, pattern);
  if (!node) return "";
  const sentence = Object.values(node).map(scalar).find((value) => pattern.test(value)) || "";
  return clean(sentence.match(/^(.+?)\s+(?:pediu|enviou|solicit[oó]|carregou|carg[oó])/i)?.[1], 240);
}

function semanticNote(notes, aliases, event) {
  const explicit = [...notes].reverse().find((note) => findSection(note, aliases)
    || aliasMatch(note?.title ?? note?.type ?? note?.event_type ?? note?.action, aliases.map(normalized)));
  if (explicit) return explicit;
  const eventDate = scalar(event?.date_created);
  if (eventDate) {
    const sameDate = [...notes].reverse().find((note) => scalar(note?.date_created ?? note?.createdAt) === eventDate);
    if (sameDate) return sameDate;
  }
  return notes.length === 1 ? notes[0] : null;
}

export function extractCaseCenterDetail(caseState) {
  const detail = record(caseState?.caseDetail) ?? {};
  const events = Array.isArray(caseState?.events) ? caseState.events : [];
  const notes = Array.isArray(caseState?.notes) ? caseState.notes : [];
  const references = Array.isArray(detail.references) ? detail.references : [];
  const referenceValue = (type) => {
    const item = references.find((reference) => text(reference?.type ?? reference?.key).toUpperCase() === type);
    return scalar(item?.value ?? item?.id ?? item?.reference);
  };

  const complaint = findSection(caseState, ["Dados da reclamação", "Datos del reclamo", "Complaint data"]);
  const receiver = findSection(caseState, ["Dados de quem recebeu", "Datos de quien recibió", "Receiver data"]);
  const route = findSection(caseState, ["Dados da rota", "Datos de la ruta", "Route data"]);
  const reviewEvent = eventOf(events, (type) => type.includes("ON_REVIEW"));
  const review = findSection(caseState, ["Pedido de revisão", "Solicitud de revisión", "Review request"]);
  const reviewNote = semanticNote(notes, ["Pedido de revisão", "Solicitud de revisión", "Review request"], reviewEvent);
  const reviewSource = review ?? reviewNote;
  const receiptEvent = eventOf(events, (type) => type === "ATTACHED_RECEIPT" || type === "NOT_ATTACHED_RECEIPT");
  const receipt = findSection(caseState, ["Comprovante carregado", "Comprobante cargado", "Sem comprovante carregado", "Receipt"]);
  const receiptAction = findDirectTextNode(receipt, /(?:carregou comprovante|carg[oó] comprobante)/i);
  const receiptSource = receiptAction ?? receipt ?? receiptEvent?.note;
  const result = findSection(caseState, ["Resultado da revisão", "Resultado de la revisión", "Resposta da revisão", "Review result"]);
  const reviewedStatus = scalar(detail.reviewedStatus ?? detail.reviewed_status).toLowerCase();
  const closedBilled = events.some((event) => ["UPDATE_STATUS_TO_CLOSED_BILLED", "UPDATE_CASE_BILLED"].includes(text(event?.event_type)));
  const closedNotBilled = events.some((event) => text(event?.event_type) === "UPDATE_STATUS_TO_CLOSED_NOT_BILLED");
  const derivedOutcome = closedBilled
    ? (reviewedStatus === "reviewed" || reviewEvent ? "Revisado pelo Mercado Livre e enviado para faturamento." : "Enviado para faturamento.")
    : closedNotBilled
      ? (reviewedStatus === "reviewed" || reviewEvent ? "Revisado pelo Mercado Livre e anulado." : "Caso encerrado e anulado.")
      : "";
  const complaintMessage = findLabeledValue(complaint ?? caseState, ["Mensaje del reclamo", "Mensagem da reclamação", "Complaint message"]);

  return {
    claimId: first(scalar(detail.claimId ?? detail.claim_id ?? caseState?.pnrClaim?.claimId), referenceValue("CLAIM_ID")),
    preInvoiceNumber: first(scalar(detail.preInvoiceNumber ?? detail.pre_invoice_number), valueFrom(detail, ["Nº da pré-fatura", "Número da pré-fatura", "Número de prefactura"])),
    billingPeriod: scalar(detail.billingPeriod?.id ?? detail.billingPeriod?.value ?? detail.billingPeriod ?? detail.billing_period),
    driverId: first(referenceValue("DRIVER_ID"), valueFrom(route ?? caseState, ["ID do motorista", "Id do motorista", "ID motorista", "ID del conductor", "ID del transportista", "Driver ID"])),
    buyerName: first(valueFrom(complaint, ["Nombre del reclamante", "Nome do reclamante", "Comprador"]), valueFrom(caseState, ["Nombre del reclamante", "Nome do reclamante", "Comprador", "claimantName", "buyerName", "complainantName"])),
    complaintMessage: complaintMessage.placeholder ? "" : complaintMessage.value,
    assignedReceiver: first(valueFrom(complaint, ["Designado para recibir", "Designado para receber", "Assigned receiver"]), valueFrom(caseState, ["Designado para recibir", "Designado para receber", "Assigned receiver"])),
    trackingId: first(valueFrom(complaint, ["ID de seguimiento", "ID de seguimento", "Tracking ID"]), valueFrom(caseState, ["ID de seguimiento", "ID de seguimento", "Tracking ID"])),
    products: productsFrom(complaint).length ? productsFrom(complaint) : productsFrom(caseState),
    deliveryAt: first(valueFrom(receiver, ["Data de entrega", "Fecha de entrega", "Delivery date"]), valueFrom(caseState, ["Data de entrega", "Fecha de entrega", "Delivery date"])),
    receivedBy: first(valueFrom(receiver, ["Recebeu", "Recibió", "Recibio", "Received by"]), valueFrom(caseState, ["Recebeu", "Recibió", "Recibio", "Received by"])),
    receiverName: first(valueFrom(receiver, ["Nome completo", "Nombre completo", "Receiver name"]), valueFrom(caseState, ["Nome completo", "Nombre completo", "Receiver name"])),
    receiverDocument: first(valueFrom(receiver, ["Documento", "Document"]), valueFrom(caseState, ["Documento", "Document"])),
    routeId: first(referenceValue("ROUTE_ID"), valueFrom(route, ["Rota", "Ruta", "Route"])),
    carrierName: first(valueFrom(route, ["Transportadora", "Transportista", "Carrier"]), valueFrom(caseState, ["Transportadora", "Transportista", "Carrier"])),
    driverName: first(valueFrom(route, ["Transportador", "Motorista", "Conductor", "Driver"]), valueFrom(caseState, ["driverName"])),
    driverPhone: first(valueFrom(route, ["Telefone", "Teléfono", "Telefono", "Phone"]), valueFrom(caseState, ["Telefone", "Teléfono", "Telefono", "Phone"])),
    reviewRequestedBy: first(
      valueFrom(reviewSource, ["Operador", "Responsável", "Solicitado por", "Enviado por"]),
      directNestedValue(reviewSource, ["created_by", "createdBy", "author"]),
      actorFromSentence(reviewSource, /(?:pediu uma revisão|enviou o caso para revisão|solicit[oó] una revisi[oó]n)/i),
      scalar(reviewEvent?.created_by?.name),
    ),
    reviewRequestedAt: first(valueFrom(reviewSource, ["Data", "Fecha", "Data do pedido"]), scalar(reviewSource?.date_created ?? reviewSource?.createdAt), scalar(reviewEvent?.date_created)),
    reviewMessage: first(valueFrom(reviewSource, ["Mensagem", "Motivo", "Comentário", "Mensaje"]), scalar(reviewSource?.message)),
    reviewEvidenceNames: fileNames(reviewSource),
    receiptStatus: receipt ? first(scalar(receipt.title ?? receipt.heading ?? receipt.header), "Comprovante carregado")
      : text(receiptEvent?.event_type) === "ATTACHED_RECEIPT" ? "Comprovante carregado"
        : text(receiptEvent?.event_type) === "NOT_ATTACHED_RECEIPT" ? "Sem comprovante carregado" : "",
    receiptActorName: first(
      valueFrom(receiptSource, ["Operador", "Responsável", "Enviado por"]),
      directNestedValue(receiptSource, ["created_by", "createdBy", "author"]),
      actorFromSentence(receiptSource, /(?:carregou comprovante|carg[oó] comprobante)/i),
      scalar(receiptEvent?.created_by?.name),
    ),
    receiptAt: first(valueFrom(receiptSource, ["Data", "Fecha", "Data do comprovante"]), scalar(receiptSource?.date_created ?? receiptSource?.createdAt), scalar(receiptEvent?.date_created)),
    receiptMessage: first(valueFrom(receiptSource, ["Descrição", "Mensagem do comprovante", "Motivo", "Observação", "Mensaje"]), scalar(receiptSource?.message ?? receiptEvent?.note?.message)),
    receiptEvidenceNames: fileNames(receiptSource).length ? fileNames(receiptSource) : fileNames(receiptEvent?.note),
    reviewOutcome: first(valueFrom(result, ["Resultado", "Status", "Estado"]), directNestedValue(result, ["status", "result", "action"]), derivedOutcome),
    reviewOutcomeMessage: valueFrom(result, ["Mensagem", "Motivo", "Descrição", "Mensaje"]),
    reviewOutcomeAt: first(valueFrom(result, ["Data", "Fecha"]), scalar(result?.date_created ?? result?.createdAt)),
  };
}

export function eventLabel(eventType, actorName = "") {
  const actor = actorName.trim();
  if (eventType === "ATTACHED_RECEIPT") return actor ? `${actor} carregou comprovante.` : "Comprovante carregado.";
  if (eventType === "NOT_ATTACHED_RECEIPT") return actor ? `${actor} não carregou comprovante.` : "Comprovante não carregado.";
  if (eventType === "UPDATE_STATUS_TO_ON_REVIEW" || eventType === "UPDATE_STATUS_TO_IN_PROGRESS_ON_REVIEW") {
    return actor ? `${actor} pediu uma revisão do caso.` : "Foi solicitada uma revisão do caso.";
  }
  return {
    CREATE_CASE_BY_CONSUMER: "O caso foi criado.",
    UPDATE_STATUS_TO_BILL: "O caso foi revisado e alterado para o status Com penalidade.",
    UPDATE_STATUS_TO_CLOSED_BILLED: "O caso foi revisado e enviado para faturamento.",
    UPDATE_STATUS_TO_CLOSED_NOT_BILLED: "O caso foi encerrado e anulado.",
    UPDATE_CASE_BILLED: "Envio para faturamento registrado.",
  }[eventType] ?? "Atualização do caso.";
}

function hashEvent(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function normalizeCaseTimelineEvents(events) {
  if (!Array.isArray(events)) return [];
  const normalized = events.flatMap((event, sourceIndex) => {
    const sourceEventId = text(event?.id);
    const eventType = text(event?.event_type);
    const rawDate = text(event?.date_created);
    const date = new Date(rawDate);
    if (!sourceEventId || !eventType || !Number.isFinite(date.getTime())) return [];
    const actorName = text(event?.created_by?.name).trim();
    const actorUserId = text(event?.created_by?.user_id).trim();
    return [{
      sourceEventId,
      sourceIndex,
      eventType,
      dateCreated: date.toISOString(),
      label: eventLabel(eventType, actorName),
      ...(actorName ? { actorName } : {}),
      ...(actorUserId ? { actorUserId } : {}),
    }];
  });
  const idCounts = new Map();
  normalized.forEach((event) => idCounts.set(event.sourceEventId, (idCounts.get(event.sourceEventId) ?? 0) + 1));
  const fingerprints = new Map();
  return normalized
    .sort((left, right) => left.dateCreated.localeCompare(right.dateCreated) || left.sourceIndex - right.sourceIndex)
    .map((normalizedEvent) => {
      const { sourceEventId, eventType, dateCreated, label, actorName, actorUserId } = normalizedEvent;
      const event = { eventType, dateCreated, label, ...(actorName ? { actorName } : {}), ...(actorUserId ? { actorUserId } : {}) };
      if (sourceEventId !== "0" && idCounts.get(sourceEventId) === 1) return { eventId: sourceEventId, ...event };
      const fingerprint = `${sourceEventId}|${event.eventType}|${event.dateCreated}|${event.actorName ?? ""}`;
      const occurrence = (fingerprints.get(fingerprint) ?? 0) + 1;
      fingerprints.set(fingerprint, occurrence);
      return { eventId: `${sourceEventId}:${hashEvent(`${fingerprint}|${occurrence}`)}`, ...event };
    });
}

export function parseCaseTimelineHtml(html) {
  const marker = "_n.ctx.r=";
  const start = html.indexOf(marker);
  if (start < 0) throw Object.assign(new Error("Estado SSR da timeline não encontrado."), { code: "INVALID_RESPONSE" });
  const jsonStart = start + marker.length;
  const endMarker = ";_n.ctx.r.assets";
  const end = html.indexOf(endMarker, jsonStart);
  if (end < 0) throw Object.assign(new Error("Estado SSR da timeline incompleto."), { code: "INVALID_RESPONSE" });
  const state = JSON.parse(html.slice(jsonStart, end));
  return normalizeCaseTimelineEvents(state?.appProps?.pageProps?.preloadedStore?.CaseDetail?.events);
}
