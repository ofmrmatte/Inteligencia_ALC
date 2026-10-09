import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthProfile } from "@alc/identity/auth";
import { driverContract, mockSender, providerCatalog, reviewedRow, reviewerId } from "./meta-contract-fixtures";
const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), connect: vi.fn(), audit: vi.fn(), profiles: vi.fn(), templates: vi.fn(), config: vi.fn() }));
vi.mock("../lib/db", () => ({ db: () => ({ query: mocks.query, connect: mocks.connect }), core: vi.fn(), setting: vi.fn(), audit: mocks.audit }));
vi.mock("../lib/operator-directory", () => ({ enabledProfiles: mocks.profiles }));
vi.mock("../lib/meta", () => ({ templates: mocks.templates, channelConfig: mocks.config }));
import { loadTemplateContractReview, persistTemplateContract, previewTemplateContractDraft, readTemplateContract } from "../lib/template-contract-config";
import { templateContractDraftSchema } from "../lib/template-contract-fields";

const manager: AuthProfile = { id: reviewerId, role: "director", fullName: "Synthetic manager", email: "manager@example.test", globalAccess: true, baseScope: [], siglaScope: [] };
const request = { expectedRevision: 0, reviewed: true, contract: driverContract };
const draft = templateContractDraftSchema.strip().parse(driverContract);
let currentRevision: number;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network request"); }));
  currentRevision = 0;
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.startsWith("SELECT channel,revision,baseline")) return { rows: currentRevision ? [reviewedRow("driver", currentRevision)] : [], rowCount: currentRevision ? 1 : 0 };
    if (sql.startsWith("SELECT revision")) return { rows: currentRevision ? [{ revision: currentRevision }] : [], rowCount: currentRevision ? 1 : 0 };
    if (sql.startsWith("INSERT INTO alc_atendimento.meta_template_contracts")) currentRevision++;
    return { rows: [], rowCount: 0 };
  });
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  mocks.profiles.mockResolvedValue([manager]);
  mocks.config.mockResolvedValue(mockSender);
  mocks.templates.mockResolvedValue(providerCatalog);
  mocks.audit.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe("explicit manager review persistence", () => {
  it("loads revision zero or the reviewed copy without exposing sender IDs, tokens or a live catalog", async () => {
    expect(await loadTemplateContractReview("driver")).toEqual({ channel: "driver", revision: 0, contract: null, sender: { phoneId: "***e-id", wabaId: "***a-id" } });
    currentRevision = 2;
    const loaded = await loadTemplateContractReview("driver");
    expect(loaded).toMatchObject({ revision: 2, contract: { ...draft, contentVersion: driverContract.contentVersion } });
    expect(loaded.contract).not.toHaveProperty("sender");
    expect(JSON.stringify(loaded)).not.toContain(mockSender.token);
    expect(JSON.stringify(loaded)).not.toContain(mockSender.phoneId);
    expect(mocks.templates).not.toHaveBeenCalled();
  });
  it("previews a strict draft with server hash and sender, no writes; persists only explicit reviewed CAS", async () => {
    const preview = await previewTemplateContractDraft(manager, { expectedRevision: 0, contract: draft });
    expect(preview.contract).toEqual(driverContract);
    expect(preview.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.templates).toHaveBeenCalledWith("driver", mockSender);
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.some(([sql]) => !sql.startsWith("SELECT"))).toBe(false);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(await persistTemplateContract(manager, { ...preview, reviewed: true })).toEqual({ revision: 1, contract: driverContract });
  });
  it.each([
    { ...draft, contentVersion: driverContract.contentVersion },
    { ...draft, sender: driverContract.sender },
    { ...draft, parameters: { ...draft.parameters, extra: [] } },
    { ...draft, buttons: [{ type: "QUICK_REPLY", text: "Recebi", extra: true }] },
  ])("rejects open draft fields before provider access", async (contract) => {
    await expect(previewTemplateContractDraft(manager, { expectedRevision: 0, contract })).rejects.toThrow(/draft estrito/);
    expect(mocks.templates).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("requires current manager permission, a fresh revision and exact live text for preview", async () => {
    mocks.profiles.mockResolvedValue([]);
    await expect(previewTemplateContractDraft(manager, { expectedRevision: 0, contract: draft })).rejects.toThrow(/gestor central/);
    expect(mocks.templates).not.toHaveBeenCalled();
    mocks.profiles.mockResolvedValue([manager]);
    currentRevision = 1;
    await expect(previewTemplateContractDraft(manager, { expectedRevision: 0, contract: draft })).rejects.toThrow(/mudou durante/);
    expect(mocks.templates).not.toHaveBeenCalled();
    await expect(previewTemplateContractDraft(manager, { expectedRevision: 1, contract: { ...draft, footerText: "Unreviewed copy" } })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/rodapé/) });
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("rejects a mismatching preview fingerprint and rechecks permission inside the transaction", async () => {
    await expect(persistTemplateContract(manager, { ...request, fingerprint: "0".repeat(64) })).rejects.toThrow(/Fingerprint/);
    expect(mocks.templates).not.toHaveBeenCalled();
    mocks.profiles.mockResolvedValueOnce([manager]).mockResolvedValueOnce([]);
    await expect(persistTemplateContract(manager, request)).rejects.toThrow(/gestor central/);
    expect(mocks.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(false);
  });
  it("commits the submitted baseline and audit under the CAS lock; stale review rolls back", async () => {
    expect(await persistTemplateContract(manager, request)).toEqual({ revision: 1, contract: driverContract });
    expect(mocks.query).toHaveBeenCalledWith("SELECT pg_advisory_xact_lock(hashtext($1))", ["atendimento_meta_contract:driver"]);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO alc_atendimento.meta_template_contracts"), ["driver", 1, driverContract, manager.id]);
    expect(mocks.audit).toHaveBeenCalledWith(manager.id, "meta_contract_reviewed", "driver", expect.objectContaining({ revision: 1, previousRevision: 0 }), expect.objectContaining({ query: mocks.query }));
    expect(mocks.query).toHaveBeenLastCalledWith("COMMIT");
    await expect(persistTemplateContract(manager, request)).rejects.toThrow(/mudou durante/);
    expect(mocks.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(mocks.query.mock.calls.filter(([sql]) => sql.startsWith("INSERT INTO alc_atendimento.meta_template_contracts"))).toHaveLength(1);
  });
  it("requires current central manager permission and explicit review", async () => {
    await expect(persistTemplateContract({ ...manager, role: "supervisor" }, request)).rejects.toThrow(/restrita/);
    expect(mocks.templates).not.toHaveBeenCalled();
    await expect(persistTemplateContract(manager, { ...request, reviewed: false })).rejects.toThrow(/revisado/);
    mocks.profiles.mockResolvedValue([{ ...manager, role: "supervisor" }]);
    await expect(persistTemplateContract(manager, request)).rejects.toThrow(/gestor central/);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(false);
  });
  it("never persists a provider change by adopting the live catalog as baseline", async () => {
    const changed = structuredClone(providerCatalog);
    changed[0].components[2].text = "Unreviewed footer";
    mocks.templates.mockResolvedValue(changed);
    await expect(persistTemplateContract(manager, request)).rejects.toThrow(/rodapé/);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("returns a safe HTTP 409 for unavailable preview/persist catalogs without exposing provider details", async () => {
    mocks.templates.mockRejectedValue(new Error("synthetic-secret-provider-detail"));
    await expect(previewTemplateContractDraft(manager, { expectedRevision: 0, contract: draft })).rejects.toMatchObject({ status: 409, message: "Catálogo Meta indisponível ou inválido; revisão bloqueada." });
    await expect(persistTemplateContract(manager, request)).rejects.toMatchObject({ status: 409, message: "Catálogo Meta indisponível ou inválido; revisão bloqueada." });
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("reports the missing review instead of falling back to a catalog/default", async () => {
    await expect(readTemplateContract("driver")).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/Baseline Meta não revisado/) });
    expect(mocks.templates).not.toHaveBeenCalled();
  });
});
