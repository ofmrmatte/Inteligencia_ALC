import { monthFromFortnight, normalizeFortnight } from "@/lib/competence";

export const CASE_CENTER_PAGE_SIZE = 30;
export const CASE_CENTER_MAX_PAGES = 500;
export const CASE_CENTER_TIMELINE_PARSER_VERSION = 4;

export interface CaseCenterCompetence {
  period: string;
  fortnight: string;
  month: string;
  year: number;
  monthNumber: number;
  half: 1 | 2;
  dateFrom: string;
  dateTo: string;
}

export interface NormalizedCaseCenterPnrCase {
  caseId: string;
  caseDate: string;
  routeCode: string;
  routeId: string;
  originStation: string;
  driverName: string;
  shipmentId: string;
  purchaseValue: number;
  currency: string;
  mainStatus: string;
  subStatus: string;
  reviewedStatus: string;
  caseType: string;
  routeStatus: string;
  priority: string;
}

export interface CaseCenterPage {
  records: NormalizedCaseCenterPnrCase[];
  page: number;
  totalPages: number;
  totalElements: number;
  invalidCount: number;
}

export interface PnrCaseTimelineEvent {
  eventId: string;
  eventType: string;
  dateCreated: string;
  label: string;
  actorName?: string;
  actorUserId?: string;
}

export function parseCaseCenterCompetence(value: string): CaseCenterCompetence | null {
  const match = /^(20\d{2})(0[1-9]|1[0-2])Q([12])$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const half = Number(match[3]) as 1 | 2;
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const startDay = half === 1 ? 1 : 16;
  const endDay = half === 1 ? 15 : lastDay;
  const fortnight = normalizeFortnight(value);
  return {
    period: value,
    fortnight,
    month: monthFromFortnight(fortnight),
    year,
    monthNumber,
    half,
    dateFrom: `${match[1]}-${match[2]}-${String(startDay).padStart(2, "0")}T00:00:00.000Z`,
    dateTo: `${match[1]}-${match[2]}-${String(endDay).padStart(2, "0")}T23:59:59.999Z`,
  };
}

export function getCaseCenterDisplayStatus({ mainStatus, subStatus }: { mainStatus: string; subStatus: string }) {
  const main = mainStatus.trim().toUpperCase();
  const sub = subStatus.trim().toUpperCase();
  const code = [main, sub].filter(Boolean).join("_");
  const known: Record<string, { label: string; category: string; terminal: boolean }> = {
    CLOSED_BILLED: { label: "Enviado para faturamento", category: "billed", terminal: true },
    CLOSED_NOT_BILLED: { label: "Anulado", category: "not_billed", terminal: true },
    IN_PROGRESS_ON_REVIEW: { label: "Em revisão", category: "in_review", terminal: false },
    NEW_WAITING_RECEIPT: { label: "Aguardando comprovante", category: "awaiting_receipt", terminal: false },
    NEW_TO_BILL: { label: "Com penalidade", category: "penalty", terminal: false },
  };
  return known[code]
    ? { code, ...known[code] }
    : { code, label: code ? "Status não reconhecido" : "Sem status", category: "unknown", terminal: false };
}

export function caseCenterStatusLabel(mainStatus: string, subStatus: string) {
  return getCaseCenterDisplayStatus({ mainStatus, subStatus }).label;
}

export function caseCenterReviewLabel(reviewedStatus: string) {
  if (reviewedStatus === "reviewed") return "Revisado";
  if (reviewedStatus === "not_reviewed") return "Sem revisão";
  return reviewedStatus ? "Revisão não identificada" : "Sem revisão";
}

export function caseCenterEventLabel(eventType: string, actorName = "", reviewedStatus = "") {
  const actor = actorName.trim();
  if (eventType === "ATTACHED_RECEIPT") return actor ? `${actor} carregou comprovante.` : "Comprovante carregado.";
  if (eventType === "NOT_ATTACHED_RECEIPT") return actor ? `${actor} não carregou comprovante.` : "Comprovante não carregado.";
  if (eventType === "UPDATE_STATUS_TO_ON_REVIEW" || eventType === "UPDATE_STATUS_TO_IN_PROGRESS_ON_REVIEW") {
    return actor ? `${actor} pediu uma revisão do caso.` : "Foi solicitada uma revisão do caso.";
  }
  if (eventType === "UPDATE_STATUS_TO_CLOSED_BILLED") {
    return reviewedStatus === "not_reviewed" ? "Caso encerrado automaticamente." : "O caso foi revisado e enviado para faturamento.";
  }
  const labels: Record<string, string> = {
    CREATE_CASE_BY_CONSUMER: "O caso foi criado.",
    UPDATE_STATUS_TO_BILL: "O caso foi revisado e alterado para o status Com penalidade.",
    UPDATE_STATUS_TO_CLOSED_NOT_BILLED: reviewedStatus.toLowerCase() === "reviewed"
      ? "O caso foi revisado e anulado."
      : "O caso foi encerrado pelo cliente e anulado.",
    UPDATE_CASE_BILLED: "Envio para faturamento registrado.",
  };
  return labels[eventType] ?? "Atualização do caso.";
}

export function caseCenterTimelineNeedsRefresh(rawSnapshot: unknown) {
  if (!rawSnapshot || typeof rawSnapshot !== "object" || Array.isArray(rawSnapshot)) return true;
  return Number((rawSnapshot as Record<string, unknown>).timelineParserVersion) !== CASE_CENTER_TIMELINE_PARSER_VERSION;
}

export function dedupeCaseCenterCases(records: NormalizedCaseCenterPnrCase[]) {
  return [...new Map(records.map((record) => [record.caseId, record])).values()];
}

export function dedupeCaseTimelineEvents<T extends { eventId: string }>(events: T[]) {
  return [...new Map(events.map((event) => [event.eventId, event])).values()];
}

export function chunkCaseCenterRecords<T>(records: T[], size = 200) {
  if (!Number.isInteger(size) || size < 1 || size > 300) throw new Error("Chunk deve conter entre 1 e 300 registros.");
  const chunks: T[][] = [];
  for (let index = 0; index < records.length; index += size) chunks.push(records.slice(index, index + size));
  return chunks;
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function withRetry<T>(operation: () => Promise<T>, retries: number, delayMs: number) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await wait(delayMs * (attempt + 1));
    }
  }
  throw lastError;
}

export async function runCaseCenterPagination({
  startPage = 1,
  initialProcessed = 0,
  initialErrors = 0,
  maxPages = CASE_CENTER_MAX_PAGES,
  retries = 1,
  delayMs = 150,
  isCancelled = () => false,
  fetchPage,
  persistPage,
  onProgress = () => undefined,
}: {
  startPage?: number;
  initialProcessed?: number;
  initialErrors?: number;
  maxPages?: number;
  retries?: number;
  delayMs?: number;
  isCancelled?: () => boolean;
  fetchPage: (page: number) => Promise<CaseCenterPage>;
  persistPage: (page: CaseCenterPage, completed: boolean, processed: number, errors: number) => Promise<void>;
  onProgress?: (progress: { page: number; totalPages: number; processed: number; totalElements: number; errors: number }) => void;
}) {
  let page = startPage;
  let processed = initialProcessed;
  let errors = initialErrors;

  while (page - startPage < maxPages) {
    if (isCancelled()) return { completed: false, cancelled: true, nextPage: page, processed, errors };
    const result = await withRetry(() => fetchPage(page), retries, Math.max(delayMs, 50));
    if (result.page !== page) throw new Error("O Case Center retornou uma página diferente da solicitada.");
    if (result.totalPages > CASE_CENTER_MAX_PAGES) throw new Error(`A captura excede o limite de ${CASE_CENTER_MAX_PAGES} páginas.`);

    processed += result.records.length;
    errors += result.invalidCount;
    const completed = result.totalPages === 0 || page >= result.totalPages;
    await persistPage(result, completed, processed, errors);
    onProgress({ page, totalPages: result.totalPages, processed, totalElements: result.totalElements, errors });

    if (completed) return { completed: true, cancelled: false, nextPage: page + 1, processed, errors };
    page += 1;
    if (isCancelled()) return { completed: false, cancelled: true, nextPage: page, processed, errors };
    if (delayMs > 0) await wait(delayMs);
  }

  throw new Error(`A captura atingiu o limite de ${maxPages} páginas.`);
}
