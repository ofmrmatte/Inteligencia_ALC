import { z } from "zod";
import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { canManageUsers, type AuthProfile } from "@alc/identity/auth";
import { HttpError, requireAdmin } from "./auth";
import { db, audit } from "./db";
import { enabledProfiles } from "./operator-directory";
import { channelConfig, templates, type Channel, type ChannelConfig } from "./meta";
import { assertTemplateSender, parseTemplateContract, reviewTemplateContract, templateContractContentVersion, type TemplateContract } from "./template-contract";
import { templateContractDraftSchema, type TemplateContractDraft } from "./template-contract-fields";

export async function requireCentralManager(profile: AuthProfile, transaction?: PoolClient) {
  requireAdmin(profile);
  const current = (await enabledProfiles(transaction)).find((entry) => entry.id === profile.id);
  if (!current || !canManageUsers(current))
    throw new HttpError(403, "Revisão Meta restrita a gestor central ativo e autorizado.");
  return current;
}
async function storedTemplateContract(channel: Channel, connection: Pool | PoolClient) {
  if (channel !== "driver" && channel !== "client") throw new HttpError(409, "Canal Meta desconhecido.");
  const row = (await connection.query(
    "SELECT channel,revision,baseline,reviewed_by FROM alc_atendimento.meta_template_contracts WHERE channel=$1 ORDER BY revision DESC LIMIT 1",
    [channel],
  )).rows[0];
  if (!row) return null;
  if (row.channel !== channel || !Number.isSafeInteger(row.revision) || row.revision < 1 || !z.uuid().safeParse(row.reviewed_by).success)
    throw new HttpError(409, "Revisão do baseline Meta inválida; disparo bloqueado.");
  const contract = parseTemplateContract(row.baseline);
  if (contract.channel !== channel) throw new HttpError(409, "Canal do baseline Meta divergente.");
  return { revision: row.revision as number, contract };
}
export async function readTemplateContract(channel: Channel, connection: Pool | PoolClient = db()) {
  const current = await storedTemplateContract(channel, connection);
  if (!current) throw new HttpError(409, "Baseline Meta não revisado para este canal; gestor deve revisar e salvar o contrato aprovado.");
  return current;
}
export type TemplateContractReview = {
  channel: Channel;
  revision: number;
  contract: (TemplateContractDraft & { contentVersion: string }) | null;
  sender: { phoneId: string; wabaId: string };
};

// The resource caller must first authorize with requireCentralManager.
export async function loadTemplateContractReview(channel: Channel): Promise<TemplateContractReview> {
  const current = await storedTemplateContract(channel, db());
  const config = await channelConfig(channel);
  const mask = (value: string) => value.length > 4 ? `***${value.slice(-4)}` : value ? "***" : "";
  let contract: TemplateContractReview["contract"] = null;
  if (current) {
    const { sender: _sender, ...fields } = current.contract;
    void _sender;
    contract = fields;
  }
  return { channel, revision: current?.revision ?? 0, contract, sender: { phoneId: mask(config.phoneId), wabaId: mask(config.wabaId) } };
}

function fingerprint(expectedRevision: number, contract: TemplateContract) {
  return createHash("sha256").update(JSON.stringify({ expectedRevision, contract })).digest("hex");
}
export type TemplateContractPreview = {
  expectedRevision: number;
  contract: TemplateContract;
  fingerprint: string;
};
async function reviewProviderContract(candidate: TemplateContract, config: ChannelConfig) {
  let catalog;
  try {
    catalog = await templates(candidate.channel, config);
  } catch {
    throw new HttpError(409, "Catálogo Meta indisponível ou inválido; revisão bloqueada.");
  }
  return reviewTemplateContract(candidate, catalog);
}
export async function previewTemplateContractDraft(profile: AuthProfile, input: unknown): Promise<TemplateContractPreview> {
  await requireCentralManager(profile);
  const request = z.object({
    expectedRevision: z.number().int().min(0).max(2147483646),
    contract: templateContractDraftSchema,
  }).strict().safeParse(input);
  if (!request.success) throw new HttpError(400, "Informe um draft estrito, sem remetente ou contentVersion.");
  const { expectedRevision, contract: draft } = request.data;
  const current = await storedTemplateContract(draft.channel, db());
  if ((current?.revision ?? 0) !== expectedRevision)
    throw new HttpError(409, "Baseline Meta mudou durante a revisão; releia antes de visualizar.");
  const config = await channelConfig(draft.channel);
  const candidate = parseTemplateContract({
    ...draft, sender: { phoneId: config.phoneId, wabaId: config.wabaId },
    contentVersion: templateContractContentVersion(draft),
  });
  const contract = await reviewProviderContract(candidate, config);
  return { expectedRevision, contract, fingerprint: fingerprint(expectedRevision, contract) };
}

// The caller submits the exact reviewed copy and hash, never a catalog-derived default.
export async function persistTemplateContract(profile: AuthProfile, input: unknown) {
  await requireCentralManager(profile);
  const request = z.object({
    expectedRevision: z.number().int().min(0).max(2147483646),
    reviewed: z.literal(true), contract: z.unknown(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }).strict().safeParse(input);
  if (!request.success) throw new HttpError(400, "Informe contrato revisado e a revisão esperada para CAS.");
  const candidate = parseTemplateContract(request.data.contract);
  if (request.data.fingerprint && request.data.fingerprint !== fingerprint(request.data.expectedRevision, candidate))
    throw new HttpError(409, "Fingerprint do preview diverge do contrato revisado.");
  const config = await channelConfig(candidate.channel);
  assertTemplateSender(candidate, config);
  const contract = await reviewProviderContract(candidate, config);
  const transaction = await db().connect();
  try {
    await transaction.query("BEGIN");
    await transaction.query("SELECT pg_advisory_xact_lock(hashtext('atendimento_operator_directory'))");
    const manager = await requireCentralManager(profile, transaction);
    await transaction.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`atendimento_meta_contract:${contract.channel}`]);
    const previous = (await transaction.query(
      "SELECT revision FROM alc_atendimento.meta_template_contracts WHERE channel=$1 ORDER BY revision DESC LIMIT 1",
      [contract.channel],
    )).rows[0]?.revision ?? 0;
    if (previous !== request.data.expectedRevision)
      throw new HttpError(409, "Baseline Meta mudou durante a revisão; releia antes de salvar.");
    const revision = previous + 1;
    await transaction.query(
      "INSERT INTO alc_atendimento.meta_template_contracts(channel,revision,baseline,reviewed_by) VALUES($1,$2,$3,$4)",
      [contract.channel, revision, contract, manager.id],
    );
    await audit(manager.id, "meta_contract_reviewed", contract.channel,
      { revision, previousRevision: previous, contentVersion: contract.contentVersion }, transaction);
    await transaction.query("COMMIT");
    return { revision, contract };
  } catch (error) {
    await transaction.query("ROLLBACK");
    throw error;
  } finally {
    transaction.release();
  }
}
