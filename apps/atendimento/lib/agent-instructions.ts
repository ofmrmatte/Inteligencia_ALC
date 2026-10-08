import { z } from "zod";
import { CUSTOMER_STEPS, DRIVER_STEPS, AGENT_GUARDRAILS } from "./agent-playbook";
import { setting } from "./db";

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
export async function loadInstructions() {
  return effectiveInstructions(await setting<unknown>(INSTRUCTION_KEY));
}
export function stepsFor(channel: "client" | "driver", current: AgentInstructions) {
  const steps = channel === "client" ? CUSTOMER_STEPS : DRIVER_STEPS;
  return steps.map(step => current.scripts[`${channel}:${step.code}`] || {
    channel, code: step.code, title: step.title, goal: step.goal, example: step.example,
  });
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
