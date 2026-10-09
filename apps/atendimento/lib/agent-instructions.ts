import { z } from "zod";
import { CUSTOMER_STEPS, DRIVER_STEPS, AGENT_GUARDRAILS, AGENT_PLAYBOOK_VERSION } from "./agent-playbook";
import { audit, db, setting } from "./db";
import { HttpError } from "./auth";
import { canManageUsers, type AuthProfile } from "@alc/identity/auth";
import { enabledProfiles } from "./operator-directory";
import type { PoolClient } from "pg";
import { aiCredential, aiModelVerified } from "./ai-provider";
import { validAiModelId } from "./ai-models";

/** Editable operational copy; immutable authorization / identity / delivery rules stay in code. */
export const editableInstructionSchema = z.object({
  channel: z.enum(["client", "driver"]),
  code: z.string().regex(/^[CM]\d\d$/),
  title: z.string().trim().min(3).max(140),
  goal: z.string().trim().min(5).max(800),
  example: z.string().trim().min(8).max(6000),
}).strict();
export const policiesSchema = z.array(z.string().trim().min(8).max(1000)).min(1).max(35);
export const agentSettingsSchema = z.object({
  revision: z.number().int().nonnegative(),
  scripts: z.record(z.string(), editableInstructionSchema).default({}),
  policies: policiesSchema.optional(),
}).strict();
export type AgentInstructions = z.infer<typeof agentSettingsSchema>;
export const INSTRUCTION_KEY = "agent_instructions_v1";
export const defaults: AgentInstructions = { revision: 0, scripts: {}, policies: [...AGENT_GUARDRAILS] };
export function effectiveInstructions(saved?: unknown): AgentInstructions {
  const result = agentSettingsSchema.safeParse(saved);
  return result.success ? { ...defaults, ...result.data } : defaults;
}
export async function loadInstructions(transaction?: PoolClient) {
  const saved = transaction
    ? (await transaction.query("SELECT value FROM alc_atendimento.settings WHERE key=$1", [INSTRUCTION_KEY])).rows[0]?.value
    : await setting<unknown>(INSTRUCTION_KEY);
  return effectiveInstructions(saved);
}
export function stepsFor(channel: "client" | "driver", current: AgentInstructions) {
  const steps = channel === "client" ? CUSTOMER_STEPS : DRIVER_STEPS;
  return steps.map(step => current.scripts[`${channel}:${step.code}`] || {
    channel, code: step.code, title: step.title, goal: step.goal, example: step.example,
  });
}
export function scriptSnapshotFor(channel: "client" | "driver", code: string, current: AgentInstructions) {
  const script = stepsFor(channel, current).find(step => step.code === code);
  if (!script) throw new Error("Código de instrução inexistente.");
  return { revision: current.revision, ...script };
}
export function validateEditedScript(entry: z.infer<typeof editableInstructionSchema>) {
  const source = (entry.channel === "client" ? CUSTOMER_STEPS : DRIVER_STEPS)
    .find(step => step.code === entry.code);
  if (!source) throw new Error("Código de instrução inexistente.");
  // Runtime placeholders must not be removed or added by editing.
  const tokens = (text: string) => [...text.matchAll(/\[([^\]]+)\]/g)].map(x => x[1]).sort();
  if (JSON.stringify(tokens(source.example)) !== JSON.stringify(tokens(entry.example)))
    throw new Error("Preserve exatamente os campos entre colchetes do modelo original.");
  return entry;
}
export function runtimeScripts(current: AgentInstructions, channel: "client" | "driver") {
  return Object.fromEntries(stepsFor(channel, current).map(s => [s.code, s.example])) as Record<string, string>;
}

export function instructionSnapshotFor(channel: "client" | "driver", current: AgentInstructions) {
  return {
    revision: current.revision,
    playbookVersion: AGENT_PLAYBOOK_VERSION,
    channel,
    scripts: stepsFor(channel, current).map(script => ({ ...script })),
    policies: [...(current.policies ?? AGENT_GUARDRAILS)],
    mandatoryPolicies: [...AGENT_GUARDRAILS],
  };
}

export const AI_CONFIG_KEY = "agent_ai_config_v1";
export const aiConfigSchema = z.object({
  revision: z.number().int().nonnegative(),
  enabled: z.boolean(),
  provider: z.enum(["openai", "gemini"]),
  model: z.string().trim().max(120).regex(/^[a-zA-Z0-9._:/-]*$/),
  dailyCallLimit: z.number().int().min(1).max(1000),
  timeoutMs: z.number().int().min(100).max(8000),
}).strict().refine(config => !config.enabled || config.model.length > 0, {
  message: "Informe o modelo para ativar a IA.", path: ["model"],
});
export type AgentAiConfig = z.infer<typeof aiConfigSchema>;
export const defaultAiConfig: AgentAiConfig = {
  revision: 0, enabled: false, provider: "openai", model: "", dailyCallLimit: 10, timeoutMs: 8000,
};
export async function loadAiConfig(transaction?: PoolClient): Promise<AgentAiConfig> {
  const saved = transaction
    ? (await transaction.query("SELECT value FROM alc_atendimento.settings WHERE key=$1", [AI_CONFIG_KEY])).rows[0]?.value
    : await setting<unknown>(AI_CONFIG_KEY);
  if (saved === undefined || saved === null) return { ...defaultAiConfig };
  return aiConfigSchema.parse(saved);
}
export async function aiDailyUsage() {
  const result = await db().query("SELECT calls FROM alc_atendimento.agent_ai_daily_usage WHERE usage_day=(now() AT TIME ZONE 'UTC')::date");
  return Number(result.rows[0]?.calls ?? 0);
}

export const instructionUpdateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("script"), revision: z.number().int().nonnegative(), entry: editableInstructionSchema }).strict(),
  z.object({ kind: z.literal("policies"), revision: z.number().int().nonnegative(), policies: policiesSchema }).strict(),
]);

async function saveSetting(
  key: string, profile: AuthProfile, revision: number,
  update: (saved: unknown, transaction: PoolClient) => AgentInstructions | AgentAiConfig | Promise<AgentInstructions | AgentAiConfig>,
  action: string, details: Record<string, unknown>,
) {
  const transaction = await db().connect();
  try {
    await transaction.query("BEGIN");
    await transaction.query("SELECT pg_advisory_xact_lock(hashtext('atendimento_operator_directory'))");
    const actor = (await enabledProfiles(transaction)).find(current => current.id === profile.id);
    if (!actor || !canManageUsers(actor))
      throw new HttpError(403, "Administração sem autorização vigente.");
    await transaction.query("SELECT pg_advisory_xact_lock(hashtext('alc_atendimento_agent_settings'))");
    const row = (await transaction.query("SELECT value FROM alc_atendimento.settings WHERE key=$1 FOR UPDATE", [key])).rows[0];
    const currentRevision = row?.value?.revision ?? 0;
    if (currentRevision !== revision) throw new HttpError(409, "Conflito de revisão. Recarregue as instruções e configurações.");
    const value = await update(row?.value, transaction);
    await transaction.query(
      `INSERT INTO alc_atendimento.settings(key,value,updated_by) VALUES($1,$2,$3)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=now()`,
      [key, value, actor.id],
    );
    await audit(actor.id, action, key, { ...details, revision: value.revision }, transaction);
    await transaction.query("COMMIT");
    return { ok: true, revision: value.revision };
  } catch (error) {
    await transaction.query("ROLLBACK");
    throw error;
  } finally { transaction.release(); }
}

export async function saveInstructions(actor: AuthProfile, body: unknown) {
  const parsed = instructionUpdateSchema.parse(body);
  if (parsed.kind === "script") validateEditedScript(parsed.entry);
  return saveSetting(INSTRUCTION_KEY, actor, parsed.revision, saved => {
    const current = effectiveInstructions(saved);
    return {
      ...current, revision: parsed.revision + 1,
      ...(parsed.kind === "script"
        ? { scripts: { ...current.scripts, [`${parsed.entry.channel}:${parsed.entry.code}`]: parsed.entry } }
        : { policies: parsed.policies }),
    };
  }, "agent_instructions_updated", parsed.kind === "script"
    ? { kind: parsed.kind, code: parsed.entry.code, channel: parsed.entry.channel }
    : { kind: parsed.kind, policies: parsed.policies.length });
}

export async function saveAiConfig(actor: AuthProfile, body: unknown) {
  const config = aiConfigSchema.parse(body);
  if (config.model && !validAiModelId(config.model)) throw new HttpError(400, "Identificador de modelo inválido.");
  return saveSetting(AI_CONFIG_KEY, actor, config.revision,
    async (_saved, transaction) => {
      if (config.enabled) {
        const credential = await aiCredential(config.provider, transaction);
        if (!credential.value) throw new HttpError(409, "Configure uma credencial antes de ativar a IA.");
        if (!await aiModelVerified(config.provider, config.model, credential.value)) throw new HttpError(409, "Modelo não validado para respostas estruturadas. Teste a conexão antes de ativar.");
      }
      return { ...config, revision: config.revision + 1 };
    },
    "agent_ai_config_updated", { enabled: config.enabled, provider: config.provider });
}
