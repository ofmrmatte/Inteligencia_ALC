import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthProfile } from "@alc/identity/auth";
import { competence, type CaseRecord } from "../lib/domain";
import { mockSender, providerCatalog, reviewedRow, reviewerId } from "./meta-contract-fixtures";
const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), connect: vi.fn(), audit: vi.fn(), templates: vi.fn(), graph: vi.fn(), config: vi.fn(), authorize: vi.fn(), validate: vi.fn() }));
vi.mock("../lib/db", () => ({ db: () => ({ query: mocks.query, connect: mocks.connect }), core: vi.fn(), setting: vi.fn(), audit: mocks.audit }));
vi.mock("../lib/meta", () => ({ templates: mocks.templates, channelConfig: mocks.config, graph: mocks.graph }));
vi.mock("../lib/dispatch-authorization", () => ({ authorizeDispatch: mocks.authorize, validateQueuedAuthor: mocks.validate }));
import { queueTemplate } from "../lib/source";
import { processOutbox } from "../lib/worker";

const actor: AuthProfile = { id: reviewerId, fullName: "Synthetic manager", email: "manager@example.test", role: "director", globalAccess: true, baseScope: [], siglaScope: [] };
const record = (id: string): CaseRecord => ({
  caseId: id, shipmentId: id, competence: competence(), caseDate: "2026-10-09", baseKey: "MOCK", sigla: "SP",
  driverId: "mock-driver", driverName: "Synthetic driver", driverPhone: "5511999990000", mainStatus: "NEW", subStatus: "WAITING_RECEIPT", classification: "aguardando_comprovante",
  customerName: "Synthetic buyer", customerPhone: id === "case-a" ? "5511988880000" : "5511977770000", customerVerified: true,
  products: [{ title: "Synthetic product" }], deliveryAt: "2026-10-08T12:00:00Z", purchaseValue: 10,
});
let records: Map<string, CaseRecord>;
let jobs: Record<string, unknown>[];
let baselineMissing: boolean;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network request"); }));
  records = new Map(["case-a", "case-b"].map((id) => [id, record(id)]));
  jobs = []; baselineMissing = false;
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  mocks.config.mockResolvedValue(mockSender);
  mocks.templates.mockResolvedValue(providerCatalog);
  mocks.graph.mockResolvedValue({ messages: [{ id: "mock-provider-id" }] });
  mocks.audit.mockResolvedValue(undefined);
  mocks.validate.mockResolvedValue(undefined);
  mocks.authorize.mockImplementation(async (_actor, entry: CaseRecord) => ({ owner: { id: reviewerId, fullName: entry.caseId === "case-a" ? "Owner A" : "Owner B" }, assignment: { version: 1 }, unit: { base_key: "MOCK", sigla: "SP" } }));
  mocks.query.mockImplementation(async (sql: string, values: unknown[] = []) => {
    const found = jobs.find((job) => job.id === values[0]);
    if (sql.includes("WHERE key='automation'")) return { rows: [{ value: { driverNotifications: true, clientOutreach: true } }], rowCount: 1 };
    if (sql.startsWith("SELECT channel,revision,baseline")) return { rows: baselineMissing ? [] : [reviewedRow(values[0] as "driver" | "client")], rowCount: baselineMissing ? 0 : 1 };
    if (sql.startsWith("SELECT * FROM alc_atendimento.cases") || sql.startsWith("SELECT record FROM alc_atendimento.cases")) return { rows: [{ record: records.get(String(values[0])) }], rowCount: 1 };
    if (sql.startsWith("SELECT * FROM alc_atendimento.outbox")) return { rows: jobs.filter((job) => job.status === "pending"), rowCount: jobs.length };
    if (sql.startsWith("SELECT id FROM alc_atendimento.outbox")) return { rows: jobs.filter((job) => job.case_id === values[0] && job.channel === values[1]), rowCount: jobs.filter((job) => job.case_id === values[0] && job.channel === values[1]).length };
    if (sql.startsWith("INSERT INTO alc_atendimento.conversations")) return { rows: [{ id: `conversation-${values[5]}` }], rowCount: 1 };
    if (sql.startsWith("INSERT INTO alc_atendimento.outbox")) {
      const job = { id: `job-${jobs.length}`, status: "pending", attempts: 0, dedupe_key: values[0], conversation_id: values[1], case_id: values[2], channel: values[3], phone: values[4], payload: values[5], assigned_to: values[7], operator_name_snapshot: values[9], dispatch_batch_id: values[12], template_name: values[13], template_version: values[14], template_contract_revision: values[15], template_evidence: values[16], rendered_template_text: values[17], sender_kind: "system", sender_display_name_snapshot: values[18] };
      jobs.push(job); return { rows: [{ id: job.id }], rowCount: 1 };
    }
    if (sql.includes("status='sending'") && sql.includes("RETURNING id") && found?.status === "pending") { found.status = "sending"; found.attempts = Number(found.attempts) + 1; return { rows: [{ id: found.id }], rowCount: 1 }; }
    if (found && sql.startsWith("UPDATE alc_atendimento.outbox") && sql.includes("status='cancelled'") && (!sql.includes("AND status='pending'") || found.status === "pending")) { found.status = "cancelled"; found.error = values[1]; }
    if (found && sql.startsWith("UPDATE alc_atendimento.outbox") && sql.includes("status=$2")) found.status = values[1];
    if (sql.startsWith("WITH inserted")) { const sent = jobs.find((job) => job.id === values[8]); if (sent) sent.status = "sent"; }
    return { rows: [], rowCount: 0 };
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("reviewed templates across queue and provider send", () => {
  it("uses Ellie only as automated author while preserving the human owner parameter and approved copy", async () => {
    await queueTemplate("client", records.get("case-a")!, null, true);
    expect(jobs[0].sender_display_name_snapshot).toBe("Ellie");
    expect(jobs[0].operator_name_snapshot).toBe("Owner A");
    expect(jobs[0].template_evidence).toMatchObject({ parameterValues: { nome_disparou: "Owner A" } });
    expect(jobs[0].rendered_template_text).toContain("Owner A");
    expect(jobs[0].rendered_template_text).not.toContain("Ellie");
    await processOutbox();
    const insert = mocks.query.mock.calls.find(([sql]) => sql.startsWith("WITH inserted"))!;
    expect(insert[1][6]).toBe("Ellie");
    expect(insert[1][2]).toBe(jobs[0].rendered_template_text);
  });
  it("preserves each PNR owner, dedupe and full immutable evidence outside the Graph payload", async () => {
    for (const entry of records.values()) await queueTemplate("client", entry, actor, false, { global: true });
    expect(await queueTemplate("client", records.get("case-a")!, actor)).toBe(false);
    expect(jobs).toHaveLength(2);
    expect(jobs[0].rendered_template_text).toContain("Owner A");
    expect(jobs[1].rendered_template_text).toContain("Owner B");
    expect(jobs.map((job) => job.sender_display_name_snapshot)).toEqual(["Ellie", "Ellie"]);
    expect(jobs.map((job) => job.operator_name_snapshot)).toEqual(["Owner A", "Owner B"]);
    expect(jobs[0].rendered_template_text).not.toContain("Ellie");
    const original = structuredClone(jobs[0].template_evidence);
    await processOutbox();
    expect(mocks.graph).toHaveBeenCalledTimes(2);
    for (const call of mocks.graph.mock.calls) expect(Object.keys(call[2]).sort()).toEqual(["messaging_product", "template", "to", "type"]);
    const insert = mocks.query.mock.calls.find(([sql]) => sql.startsWith("WITH inserted"))!;
    expect(insert[0]).toContain("template_version,template_contract_revision,template_evidence");
    expect(insert[1][2]).toBe(jobs[0].rendered_template_text);
    expect(insert[1][2]).not.toContain("[Modelo:");
    expect(insert[1][6]).toBe("Ellie");
    expect(jobs[0].template_evidence).toEqual(original);
    expect(mocks.templates).toHaveBeenCalledTimes(5);
  });
  it("blocks missing baselines and incompatible provider text before queue insert", async () => {
    baselineMissing = true;
    await expect(queueTemplate("client", records.get("case-a")!, actor)).rejects.toThrow(/não revisado/);
    expect(mocks.templates).not.toHaveBeenCalled();
    baselineMissing = false;
    const changed = structuredClone(providerCatalog); changed[1].components[0].text = "Different {{customer_name}}";
    mocks.templates.mockResolvedValue(changed);
    await expect(queueTemplate("client", records.get("case-a")!, actor)).rejects.toThrow(/diverge/);
    expect(jobs).toHaveLength(0);
    expect(mocks.graph).not.toHaveBeenCalled();
  });
  it("fetches provider templates before acquiring a DB connection or advisory lock", async () => {
    await queueTemplate("driver", records.get("case-a")!, actor);
    mocks.connect.mockClear(); mocks.query.mockClear();
    mocks.templates.mockImplementationOnce(async () => {
      expect(mocks.connect).not.toHaveBeenCalled();
      expect(mocks.query.mock.calls.some(([sql]) => sql.includes("advisory"))).toBe(false);
      return providerCatalog;
    });
    await processOutbox();
    expect(jobs[0].status).toBe("sent");
  });
  it.each(["footer", "missing review", "queued snapshot", "queued revision", "queued hash", "queued payload", "sender", "phone", "permission", "catalog unavailable"])("blocks %s at send time before claim or Graph", async (change) => {
    await queueTemplate("driver", records.get("case-a")!, actor);
    if (change === "footer") { const catalog = structuredClone(providerCatalog); catalog[0].components[2].text = "Changed footer"; mocks.templates.mockResolvedValue(catalog); }
    if (change === "missing review") baselineMissing = true;
    if (change === "queued snapshot") jobs[0].rendered_template_text = "Forged";
    if (change === "queued revision") jobs[0].template_contract_revision = 2;
    if (change === "queued hash") jobs[0].template_version = "0".repeat(64);
    if (change === "queued payload") jobs[0].payload = { ...(jobs[0].payload as object), extra: true };
    if (change === "sender") mocks.config.mockResolvedValue({ ...mockSender, phoneId: "different-sender" });
    if (change === "phone") records.get("case-a")!.driverPhone = "5511966660000";
    if (change === "permission") { const { HttpError } = await import("../lib/auth"); mocks.validate.mockRejectedValue(new HttpError(403, "Authorization revoked")); }
    if (change === "catalog unavailable") mocks.templates.mockRejectedValue(new Error("synthetic-private-provider-error"));
    await processOutbox();
    expect(jobs[0].status).toBe("cancelled");
    expect(jobs[0].attempts).toBe(0);
    expect(mocks.graph).not.toHaveBeenCalled();
    if (change === "catalog unavailable") expect(jobs[0].error).toBe("Catálogo ou baseline Meta indisponível; envio bloqueado antes da solicitação.");
  });
  it("keeps a sent-but-unconfirmed request uncertain and never sends it again", async () => {
    await queueTemplate("client", records.get("case-a")!, actor);
    mocks.graph.mockRejectedValue(new Error("Timeout after dispatch"));
    await processOutbox();
    expect(jobs[0].status).toBe("uncertain");
    await processOutbox();
    expect(mocks.graph).toHaveBeenCalledTimes(1);
    expect(jobs[0].attempts).toBe(1);
  });
  it("does not retry when provider confirmed but local message persistence failed", async () => {
    await queueTemplate("client", records.get("case-a")!, actor);
    const query = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql: string, values: unknown[] = []) => {
      if (sql.startsWith("WITH inserted")) throw new Error("Synthetic DB write failure after dispatch");
      return query(sql, values);
    });
    await processOutbox();
    expect(jobs[0].status).toBe("uncertain");
    await processOutbox();
    expect(mocks.graph).toHaveBeenCalledTimes(1);
  });
  it.each(["uncertain", "sent"])("does not overwrite %s after a stale pending selection and contact drift", async (status) => {
    await queueTemplate("driver", records.get("case-a")!, actor);
    jobs[0].status = status;
    records.get("case-a")!.driverPhone = "5511966660000";
    const query = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql: string, values: unknown[] = []) => {
      if (sql.startsWith("SELECT * FROM alc_atendimento.outbox")) return { rows: jobs, rowCount: 1 };
      return query(sql, values);
    });
    await processOutbox();
    expect(jobs[0].status).toBe(status);
    expect(mocks.graph).not.toHaveBeenCalled();
  });
});
