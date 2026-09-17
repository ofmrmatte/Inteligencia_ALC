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
    UPDATE_STATUS_TO_CLOSED_NOT_BILLED: "O caso foi revisado e anulado.",
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
    return [{
      sourceEventId,
      sourceIndex,
      eventType,
      dateCreated: date.toISOString(),
      label: eventLabel(eventType, actorName),
      ...(actorName ? { actorName } : {}),
    }];
  });
  const idCounts = new Map();
  normalized.forEach((event) => idCounts.set(event.sourceEventId, (idCounts.get(event.sourceEventId) ?? 0) + 1));
  const fingerprints = new Map();
  return normalized
    .sort((left, right) => left.dateCreated.localeCompare(right.dateCreated) || left.sourceIndex - right.sourceIndex)
    .map((normalizedEvent) => {
      const { sourceEventId, eventType, dateCreated, label, actorName } = normalizedEvent;
      const event = { eventType, dateCreated, label, ...(actorName ? { actorName } : {}) };
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
